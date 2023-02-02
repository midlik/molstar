import { ChainIndex, Model, Structure } from '../../mol-model/structure';
import { type Entities } from '../../mol-model/structure/model/properties/common';
import { RootStructureDefinition } from '../../mol-plugin-state/helpers/root-structure';
import { StructureComponentParams } from '../../mol-plugin-state/helpers/structure-component';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { PluginContext } from '../../mol-plugin/context';
import { MolScriptBuilder } from '../../mol-script/language/builder';
import { StateObjectSelector } from '../../mol-state';
import { Color } from '../../mol-util/color';
import { ParamDefinition } from '../../mol-util/param-definition';
import { setSubtreeVisibility } from '../../mol-plugin/behavior/static/state';

import { Disposable } from './helpers';
import { Download, ParseCif } from '../../mol-plugin-state/transforms/data';


const BRANCHED_STICKS_OPACITY = 0.5;

const HIGHLIGHT_COLOR = Color.fromRgb(40, 100, 255);
const FADED_COLOR = Color.fromRgb(120, 120, 120);
const FADED_OPACITY = 0.6;
const FADED_SIZE_SCALE = 0.9;

const BALL_SIZE_FACTOR = 0.25;
const HIGHTLIGHT_BALL_SIZE_FACTOR = 0.75;


type EntityType = ReturnType<Entities['data']['type']['value']>

type ModelObjSelector = StateObjectSelector<PluginStateObject.Molecule.Model, any>
type StructureObjSelector = StateObjectSelector<PluginStateObject.Molecule.Structure, any>
type VisualObjSelector = StateObjectSelector<PluginStateObject.Molecule.Structure.Representation3D, any>
type Visuals = VisualObjSelector | null | (VisualObjSelector | null)[]

type ComponentType = 'polymer' | 'ligand' | 'branched' | 'ion'
type Components = { [type in ComponentType]: StructureObjSelector | null }

type ComponentVisualType = 'polymerCartoon' | 'ligandSticks' | 'branchedCarbohydrate' | 'branchedSticks' | 'ionSticks'
type ComponentVisuals = { [type in ComponentVisualType]: VisualObjSelector | null }

type StructureParams = ParamDefinition.Values<ReturnType<typeof RootStructureDefinition.getParams>>
type VisualParams = ReturnType<typeof StructureRepresentation3D.createDefaultParams>


// MODEL

export async function makeModel(plugin: PluginContext, url: string): Promise<Disposable<ModelObjSelector>> {
    const download = await plugin.build().toRoot()
        .apply(Download, { url, isBinary: true }).commit();
    const model = await plugin.build().to(download)
        .apply(ParseCif)
        .apply(TrajectoryFromMmCif)
        .apply(ModelFromTrajectory).commit();
    return {
        value: model,
        dispose: () => plugin.build().delete(download).commit(),
    };
}


// STRUCTURE

export async function makeStructure(plugin: PluginContext, model: ModelObjSelector, params: Partial<StructureParams>): Promise<Disposable<StructureObjSelector>> {
    const structure = await plugin.build().to(model.ref).apply(StructureFromModel, params).commit();
    return {
        value: structure,
        dispose: () => plugin.build().delete(structure).commit(),
    };
}


// COMPONENTS

export async function makeComponents(plugin: PluginContext, structure: StructureObjSelector): Promise<Disposable<Components>> {
    const polymer = await makeComponent(plugin, structure, { type: { name: 'static', params: 'polymer' } });
    const ligand = await makeComponent(plugin, structure, { type: { name: 'static', params: 'ligand' } });
    const branched = await makeComponent(plugin, structure, { type: { name: 'static', params: 'branched' } });
    const ion = await makeComponent(plugin, structure, { type: { name: 'static', params: 'ion' } });
    return Disposable.combine({ polymer, branched, ligand, ion });
}

export async function makeEntities(plugin: PluginContext, structure: StructureObjSelector): Promise<Disposable<{ [entityId: string]: StructureObjSelector }>> {
    const entityInfo = getEntityInfo(structure.data!);
    const selections: { [entityId: string]: Disposable<StructureObjSelector> } = {};

    for (const entityId in entityInfo) {
        const description = entityInfo[entityId].description[0];
        const expression = MolScriptBuilder.struct.generator.atomGroups({
            'entity-test': MolScriptBuilder.core.rel.eq([MolScriptBuilder.struct.atomProperty.macromolecular.label_entity_id(), entityId])
        });
        // if (entityInfo[entityId].type === 'branched' || entityInfo[entityId].type === 'non-polymer') { // TODO make sure about this
        //     expression = MolScriptBuilder.struct.modifier.includeConnected({
        //         0: expression, 'layer-count': 1, 'as-whole-residues': true
        //     });
        // }
        const entitySelection = await makeComponent(plugin, structure, {
            type: { name: 'expression', params: expression },
            label: `Entity ${entityId} (${description})`
        });
        if (Disposable.hasValue(entitySelection)) {
            selections[entityId] = entitySelection;
        }
    }
    return Disposable.combine(selections);
}

export async function makeComponentsForEntities(plugin: PluginContext, entities: { [entityId: string]: StructureObjSelector }): Promise<Disposable<{ [entityId: string]: Components }>> {
    const components: { [entityId: string]: Disposable<Components> } = {};
    for (const entityId in entities) {
        components[entityId] = await makeComponents(plugin, entities[entityId]);
    }
    return Disposable.combine(components);
}

async function makeComponent(plugin: PluginContext, structure: StructureObjSelector, params: Partial<StructureComponentParams>): Promise<Disposable<StructureObjSelector | null>> {
    const component = await plugin.build().to(structure.ref).apply(StructureComponent, params).commit();
    if (component.data && !component.data.isEmpty) {
        return {
            value: component,
            dispose: () => plugin.build().delete(component).commit(),
        };
    } else {
        await plugin.build().delete(component).commit();
        return {
            value: null,
            dispose: () => { },
        };
    }
}


// VISUALS

export async function makeComponentVisuals(plugin: PluginContext, components: Components): Promise<Disposable<ComponentVisuals>> {
    const polymerCartoon = await makeCartoon(plugin, components.polymer, ['polymerCartoon']);
    const branchedCarbohydrate = await makeCarbohydrate(plugin, components.branched, ['branchedCarbohydrate']);
    const branchedSticks = await makeBallsAndSticks(plugin, components.branched, ['branchedSticks']);
    await setOpacity(plugin, branchedSticks.value, BRANCHED_STICKS_OPACITY);
    const ligandSticks = await makeBallsAndSticks(plugin, components.ligand, ['ligandSticks']);
    const ionSticks = await makeBallsAndSticks(plugin, components.ion, ['ionSticks']);

    return Disposable.combine({
        polymerCartoon,
        branchedCarbohydrate,
        branchedSticks,
        ligandSticks,
        ionSticks,
    });
}

export async function makeComponentVisualsForEntities(plugin: PluginContext, components: { [entityId: string]: Components }): Promise<Disposable<{ [entityId: string]: ComponentVisuals }>> {
    const visuals: { [entityId: string]: Disposable<ComponentVisuals> } = {};
    for (const entityId in components) {
        visuals[entityId] = await makeComponentVisuals(plugin, components[entityId]);
    }
    return Disposable.combine(visuals);
}

async function makeVisual(plugin: PluginContext, structure: StructureObjSelector | null, params: Partial<VisualParams>, tags?: string[]): Promise<Disposable<VisualObjSelector | null>> {
    if (!structure) {
        return {
            value: null,
            dispose: () => { },
        };
    }
    const visual = await plugin.build().to(structure).apply(StructureRepresentation3D, params, { tags: tags }).commit();
    return {
        value: visual,
        dispose: () => plugin.build().delete(visual).commit(),
    };
}

async function makeCartoon(plugin: PluginContext, structure: StructureObjSelector | null, tags?: string[]) {
    return await makeVisual(plugin, structure, {
        type: { name: 'cartoon', params: { alpha: 1 } },
        colorTheme: { name: 'unit-index', params: {} }, // sequence-id if there is only 1 chain ?
    }, tags);
}

async function makeBallsAndSticks(plugin: PluginContext, structure: StructureObjSelector | null, tags?: string[]) {
    return await makeVisual(plugin, structure, {
        type: { name: 'ball-and-stick', params: { sizeFactor: BALL_SIZE_FACTOR, sizeAspectRatio: 0.5 } },
        colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'element-symbol', params: {} } } }, // in original: carbonColor: chain-id
        sizeTheme: { name: 'physical', params: {} },
    }, tags);
}

async function makeCarbohydrate(plugin: PluginContext, structure: StructureObjSelector | null, tags?: string[]) {
    return await makeVisual(plugin, structure, {
        type: { name: 'carbohydrate', params: {} },
        colorTheme: { name: 'carbohydrate-symbol', params: {} },
        sizeTheme: { name: 'uniform', params: { value: 1 } },
    }, tags);
}

async function setOpacity(plugin: PluginContext, visual: VisualObjSelector | null, alpha: number) {
    if (visual && visual.cell) {
        await plugin.build().to(visual).update(visual.cell.transform.transformer, (old: any) => ({
            ...old,
            type: { ...old.type, params: { ...old.type.params, alpha: alpha } },
        })).commit();
        // TODO implement object deep merging?
    }
}

export async function setColorByEntity(plugin: PluginContext, visual: Visuals, options?: { ignoreElementColors: boolean }) {
    if (Array.isArray(visual)) {
        for (const vis of visual) {
            await setColorByEntity(plugin, vis, options); // Could be done async
        }
        return;
    }
    if (visual && visual.cell) {
        await plugin.build().to(visual).update(visual.cell.transform.transformer, (old: any) => ({
            ...old,
            colorTheme:
                (old.type.name === 'ball-and-stick' && !options?.ignoreElementColors) ?
                    { name: 'element-symbol', params: { carbonColor: { name: 'entity-id', params: {} } } }
                    : { name: 'entity-id', params: {} },
        })).commit();
        // TODO implement object deep merging?
    }
}

export async function updateVisual(plugin: PluginContext, visuals: Visuals, change: (oldParams: VisualParams, tags: string[]) => VisualParams): Promise<void> {
    if (!Array.isArray(visuals)) {
        visuals = [visuals];
    }
    const update = plugin.build();
    for (const visual of visuals) {
        if (visual && visual.cell) {
            if (visual.cell.transform.transformer !== StructureRepresentation3D) {
                throw new Error('Calling updateVisual on wrong transform');
            }
            const tags = visual.cell?.transform.tags ?? [];
            update.to(visual).update(StructureRepresentation3D, (old: VisualParams) => change(old, tags));
        }
    }
    await update.commit();
}

export function setFaded(plugin: PluginContext, visual: Visuals): Promise<void> {
    return updateVisual(plugin, visual, (old, tags) => ({
        ...old,
        type: {
            ...old.type,
            params: {
                ...old.type.params,
                alpha: FADED_OPACITY * (tags.includes('branchedSticks') ? BRANCHED_STICKS_OPACITY : 1),
            }
        },
        colorTheme: { name: 'uniform', params: { value: FADED_COLOR } },
        sizeTheme: {
            name: old.sizeTheme.name,
            params: old.sizeTheme.name === 'uniform' ? { value: FADED_SIZE_SCALE } : old.sizeTheme.name === 'physical' ? { scale: FADED_SIZE_SCALE } : old.sizeTheme.params,
        },
    }));
}


export function setHighlight(plugin: PluginContext, visual: Visuals): Promise<void> {
    return updateVisual(plugin, visual, (old, tags) => ({
        ...old,
        type: {
            ...old.type,
            params: {
                ...old.type.params,
                alpha: tags.includes('branchedSticks') ? BRANCHED_STICKS_OPACITY : 1,
                sizeFactor: (tags.includes('ligandSticks') || tags.includes('ionSticks')) ? HIGHTLIGHT_BALL_SIZE_FACTOR : old.type.params.sizeFactor,
            }
        },
        colorTheme: { name: 'uniform', params: { value: HIGHLIGHT_COLOR } }
    }));
}

export function setVisible(plugin: PluginContext, nodes: StateObjectSelector | (StateObjectSelector | null)[], visible: boolean): void {
    if (!Array.isArray(nodes)) {
        nodes = [nodes];
    }
    for (const node of nodes) {
        if (node && node.cell) {
            setSubtreeVisibility(plugin.state.data, node.cell.transform.ref, !visible); // true means hide, ¯\_(ツ)_/¯
        }
    }
}



function findEntities(model: Model) {
    // console.log('entities:', model.entities);
    for (let i = 0; i < model.entities.data._rowCount; i++) {
        const typ = model.entities.data.type.value(i);
        const id = model.entities.data.id.value(i);
        const desc = model.entities.data.pdbx_description.value(i);
        const count = model.entities.data.pdbx_number_of_molecules.value(i);
        console.log(i, ': entity', id, typ, desc ?? 'xxx', count ?? 'xxx');
    }
}

function getEntityInfo(structure: Structure) {
    const entities = structure.model.entities;
    const ent: { [entityId: string]: { description: string[], type: EntityType, chains: ChainIndex[] } } = {};

    for (let i = 0; i < entities.data._rowCount; i++) {
        const id = entities.data.id.value(i);
        const typ = entities.data.type.value(i);
        const desc = entities.data.pdbx_description.value(i);
        ent[id] = { description: desc, type: typ, chains: [] };
    }

    for (const unit of structure.units ?? []) {
        const firstElementIdx = unit.elements[0];
        const chainIdx = unit.model.atomicHierarchy.chainAtomSegments.index[firstElementIdx];
        const entityId = unit.model.atomicHierarchy.chains.label_entity_id.value(chainIdx);
        ent[entityId].chains.push(chainIdx);
    }
    return ent;
}
