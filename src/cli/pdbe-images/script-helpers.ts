import { Camera } from '../../mol-canvas3d/camera';
import { ChainIndex, Structure } from '../../mol-model/structure';
import { type Entities } from '../../mol-model/structure/model/properties/common';
import { RootStructureDefinition } from '../../mol-plugin-state/helpers/root-structure';
import { StructureComponentParams } from '../../mol-plugin-state/helpers/structure-component';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { Download, ParseCif } from '../../mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { setSubtreeVisibility } from '../../mol-plugin/behavior/static/state';
import { PluginContext } from '../../mol-plugin/context';
import { MolScriptBuilder } from '../../mol-script/language/builder';
import { StateObjectSelector } from '../../mol-state';
import { Color } from '../../mol-util/color';
import { ParamDefinition } from '../../mol-util/param-definition';

import { cameraZoom, Disposable } from './helpers';


const BRANCHED_STICKS_OPACITY = 0.5;

const HIGHLIGHT_COLOR = Color.fromRgb(40, 100, 255);
const FADED_COLOR = Color.fromRgb(120, 120, 120);
const FADED_OPACITY = 0.6;
const FADED_SIZE_SCALE = 0.9;

const BALL_SIZE_FACTOR = 0.25;
const HIGHTLIGHT_BALL_SIZE_FACTOR = 0.75;

const ZOOMOUT = 0.75;


type EntityType = ReturnType<Entities['data']['type']['value']>

export type ModelObjSelector = StateObjectSelector<PluginStateObject.Molecule.Model, any>
export type StructureObjSelector = StateObjectSelector<PluginStateObject.Molecule.Structure, any>
export type VisualObjSelector = StateObjectSelector<PluginStateObject.Molecule.Structure.Representation3D, any>
type Visuals = VisualObjSelector | null | (VisualObjSelector | null)[]

type ComponentType = 'polymer' | 'ligand' | 'branched' | 'ion'
type Components = { [type in ComponentType]: StructureObjSelector | null }

type ComponentVisualType = 'polymerCartoon' | 'ligandSticks' | 'branchedCarbohydrate' | 'branchedSticks' | 'ionSticks'
type ComponentVisuals = { [type in ComponentVisualType]: VisualObjSelector | null }

type StructureParams = ParamDefinition.Values<ReturnType<typeof RootStructureDefinition.getParams>>
type VisualParams = ReturnType<typeof StructureRepresentation3D.createDefaultParams>

export interface DomainRanges { chainId: string, ranges: [number, number][] }



export class ImageGeneratorBase {

    constructor(public readonly plugin: PluginContext) { }

    // MODEL

    protected async makeModel(url: string): Promise<Disposable<ModelObjSelector>> {
        const download = await this.plugin.build().toRoot()
            .apply(Download, { url, isBinary: true }).commit();
        const model = await this.plugin.build().to(download)
            .apply(ParseCif)
            .apply(TrajectoryFromMmCif)
            .apply(ModelFromTrajectory).commit();
        return {
            value: model,
            dispose: () => this.plugin.build().delete(download).commit(),
        };
    }


    // STRUCTURE

    protected async makeStructure(model: ModelObjSelector, params: Partial<StructureParams>): Promise<Disposable<StructureObjSelector>> {
        const structure = await this.plugin.build().to(model.ref).apply(StructureFromModel, params).commit();
        return {
            value: structure,
            dispose: () => this.plugin.build().delete(structure).commit(),
        };
    }


    // COMPONENTS

    private async makeComponent(structure: StructureObjSelector, params: Partial<StructureComponentParams>): Promise<Disposable<StructureObjSelector | null>> {
        const component = await this.plugin.build().to(structure.ref).apply(StructureComponent, params).commit();
        if (component.data && !component.data.isEmpty) {
            return {
                value: component,
                dispose: () => this.plugin.build().delete(component).commit(),
            };
        } else {
            await this.plugin.build().delete(component).commit();
            return {
                value: null,
                dispose: () => { },
            };
        }
    }

    /** Create components "polymer", "branched", "ligand", "ion" for a structure or its part */
    private async makeComponents(structure: StructureObjSelector): Promise<Disposable<Components>> {
        const polymer = await this.makeComponent(structure, { type: { name: 'static', params: 'polymer' } });
        const ligand = await this.makeComponent(structure, { type: { name: 'static', params: 'ligand' } });
        const branched = await this.makeComponent(structure, { type: { name: 'static', params: 'branched' } });
        const ion = await this.makeComponent(structure, { type: { name: 'static', params: 'ion' } });
        return Disposable.combine({ polymer, branched, ligand, ion });
    }

    /** Like makeComponents but for multiple structures or structure parts */
    private async makeComponentsMulti(structures: { [label: string]: StructureObjSelector }): Promise<Disposable<{ [entityId: string]: Components }>> {
        const components: { [label: string]: Disposable<Components> } = {};
        for (const label in structures) {
            components[label] = await this.makeComponents(structures[label]);
        }
        return Disposable.combine(components);
    }

    /** Split a stucture into entities, create a component for each entity */
    protected async makeEntities(structure: StructureObjSelector): Promise<Disposable<{ [entityId: string]: StructureObjSelector }>> {
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
            const entitySelection = await this.makeComponent(structure, {
                type: { name: 'expression', params: expression },
                label: `Entity ${entityId} (${description})`
            });
            if (Disposable.hasValue(entitySelection)) {
                selections[entityId] = entitySelection;
            }
        }
        return Disposable.combine(selections);
    }

    /** Create a component from a stucture, based on chainId (label_asym_id) */
    protected async makeChain(structure: StructureObjSelector, chainId: string, authChainId?: string): Promise<Disposable<StructureObjSelector | null>> {
        const expression = MolScriptBuilder.struct.generator.atomGroups({
            'chain-test': MolScriptBuilder.core.rel.eq([MolScriptBuilder.struct.atomProperty.macromolecular.label_asym_id(), chainId])
        });
        const description = (authChainId && authChainId !== chainId) ? `Chain ${chainId} [auth ${authChainId}]` : `Chain ${chainId}`;
        return await this.makeComponent(structure, {
            type: { name: 'expression', params: expression },
            label: description,
        });
    }

    /** Create a component from a stucture, based on authChainId (auth_asym_id) */
    protected async makeAuthChain(structure: StructureObjSelector, authChainId: string, labelChainId?: string): Promise<Disposable<StructureObjSelector | null>> {
        const expression = MolScriptBuilder.struct.generator.atomGroups({
            'chain-test': MolScriptBuilder.core.rel.eq([MolScriptBuilder.struct.atomProperty.macromolecular.auth_asym_id(), authChainId])
        });
        const description = (!labelChainId) ? `Chain auth ${authChainId}` : (authChainId === labelChainId) ? `Chain ${labelChainId}` : `Chain ${labelChainId} [auth ${authChainId}]`;
        return await this.makeComponent(structure, {
            type: { name: 'expression', params: expression },
            label: description,
        });
    }


    /** Create a component from a stucture, based on chainId (auth_asym_id) and residue ranges */
    protected async makeDomain(structure: StructureObjSelector, domain: DomainRanges, label: string): Promise<Disposable<StructureObjSelector | null>> {
        const rangeSubexprs = domain.ranges.map(r => MolScriptBuilder.core.rel.inRange([MolScriptBuilder.struct.atomProperty.macromolecular.label_seq_id(), r[0], r[1]]));
        const expression = MolScriptBuilder.struct.generator.atomGroups({
            'chain-test': MolScriptBuilder.core.rel.eq([MolScriptBuilder.struct.atomProperty.macromolecular.label_asym_id(), domain.chainId]),
            'residue-test': MolScriptBuilder.core.logic.or(rangeSubexprs)
        });
        return await this.makeComponent(structure, {
            type: { name: 'expression', params: expression },
            label: label,
        });
    }

    /** Create components from a stucture, based on chainId (auth_asym_id) and residue ranges */
    protected async makeDomains(structure: StructureObjSelector, domains: { [label: string]: DomainRanges }): Promise<Disposable<{ [label: string]: StructureObjSelector }>> {
        const selections: { [label: string]: Disposable<StructureObjSelector> } = {};
        for (const label in domains) {
            const selection = await this.makeDomain(structure, domains[label], label);
            if (Disposable.hasValue(selection)) {
                selections[label] = selection;
            }
        }
        return Disposable.combine(selections);
    }



    // VISUALS

    private async makeVisualsFromComponents(components: Components): Promise<Disposable<ComponentVisuals>> {
        const polymerCartoon = await this.makeCartoon(components.polymer, ['polymerCartoon']);
        const branchedCarbohydrate = await this.makeCarbohydrate(components.branched, ['branchedCarbohydrate']);
        const branchedSticks = await this.makeBallsAndSticks(components.branched, ['branchedSticks']);
        await this.setOpacity(branchedSticks.value, BRANCHED_STICKS_OPACITY);
        const ligandSticks = await this.makeBallsAndSticks(components.ligand, ['ligandSticks']);
        const ionSticks = await this.makeBallsAndSticks(components.ion, ['ionSticks']);

        return Disposable.combine({
            polymerCartoon,
            branchedCarbohydrate,
            branchedSticks,
            ligandSticks,
            ionSticks,
        });
    }

    /** Like makeVisualsForComponents but for multiple structures or structure parts */
    private async makeVisualsFromComponentsMulti(components: { [label: string]: Components }): Promise<Disposable<{ [entityId: string]: ComponentVisuals }>> {
        const visuals: { [label: string]: Disposable<ComponentVisuals> } = {};
        for (const struct in components) {
            visuals[struct] = await this.makeVisualsFromComponents(components[struct]);
        }
        return Disposable.combine(visuals);
    }

    /** Create visuals like polymer cartoon, ligand balls-and-sticks etc., for a structure or its part */
    protected async makeVisuals(structure: StructureObjSelector): Promise<Disposable<ComponentVisuals>> {
        const components = await this.makeComponents(structure);
        const visuals = await this.makeVisualsFromComponents(components.value);
        return { value: visuals.value, dispose: components.dispose };
    }

    /** Like makeVisuals but for multiple structures or structure parts */
    protected async makeVisualsMulti(entities: { [entityId: string]: StructureObjSelector }): Promise<Disposable<{ [entityId: string]: ComponentVisuals }>> {
        const components = await this.makeComponentsMulti(entities);
        const visuals = await this.makeVisualsFromComponentsMulti(components.value);
        return { value: visuals.value, dispose: components.dispose };
    }

    private async makeVisual(structure: StructureObjSelector | null, params: Partial<VisualParams>, tags?: string[]): Promise<Disposable<VisualObjSelector | null>> {
        if (!structure) {
            return {
                value: null,
                dispose: () => { },
            };
        }
        const visual = await this.plugin.build().to(structure).apply(StructureRepresentation3D, params, { tags: tags }).commit();
        return {
            value: visual,
            dispose: () => this.plugin.build().delete(visual).commit(),
        };
    }

    private async makeCartoon(structure: StructureObjSelector | null, tags?: string[]) {
        return await this.makeVisual(structure, {
            type: { name: 'cartoon', params: { alpha: 1 } },
            colorTheme: { name: 'unit-index', params: {} }, // sequence-id if there is only 1 chain ?
        }, tags);
    }

    private async makeBallsAndSticks(structure: StructureObjSelector | null, tags?: string[]) {
        return await this.makeVisual(structure, {
            type: { name: 'ball-and-stick', params: { sizeFactor: BALL_SIZE_FACTOR, sizeAspectRatio: 0.5 } },
            colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'element-symbol', params: {} } } }, // in original: carbonColor: chain-id
            sizeTheme: { name: 'physical', params: {} },
        }, tags);
    }

    private async makeCarbohydrate(structure: StructureObjSelector | null, tags?: string[]) {
        return await this.makeVisual(structure, {
            type: { name: 'carbohydrate', params: {} },
            colorTheme: { name: 'carbohydrate-symbol', params: {} },
            sizeTheme: { name: 'uniform', params: { value: 1 } },
        }, tags);
    }

    private async setOpacity(visual: VisualObjSelector | null, alpha: number) {
        if (visual && visual.cell) {
            await this.plugin.build().to(visual).update(visual.cell.transform.transformer, (old: any) => ({
                ...old,
                type: { ...old.type, params: { ...old.type.params, alpha: alpha } },
            })).commit();
            // TODO implement object deep merging?
        }
    }

    protected async setColorByEntity(visual: Visuals, options?: { ignoreElementColors: boolean }) {
        if (Array.isArray(visual)) {
            for (const vis of visual) {
                await this.setColorByEntity(vis, options); // Could be done async
            }
            return;
        }
        if (visual && visual.cell) {
            await this.plugin.build().to(visual).update(visual.cell.transform.transformer, (old: any) => ({
                ...old,
                colorTheme:
                    (old.type.name === 'ball-and-stick' && !options?.ignoreElementColors) ?
                        { name: 'element-symbol', params: { carbonColor: { name: 'entity-id', params: {} } } }
                        : { name: 'entity-id', params: {} },
            })).commit();
            // TODO implement object deep merging? see deepClone in mol-util/object.ts
        }
    }

    protected async updateVisual(visuals: Visuals, change: (oldParams: VisualParams, tags: string[]) => VisualParams): Promise<void> {
        if (!Array.isArray(visuals)) {
            visuals = [visuals];
        }
        const update = this.plugin.build();
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

    protected setFaded(visual: Visuals): Promise<void> {
        return this.updateVisual(visual, (old, tags) => ({
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


    protected setHighlight(visual: Visuals): Promise<void> {
        return this.updateVisual(visual, (old, tags) => ({
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

    protected setVisible(nodes: StateObjectSelector | (StateObjectSelector | null)[], visible: boolean): void {
        if (!Array.isArray(nodes)) {
            nodes = [nodes];
        }
        for (const node of nodes) {
            if (node && node.cell) {
                setSubtreeVisibility(this.plugin.state.data, node.cell.transform.ref, !visible); // true means hide, ¯\_(ツ)_/¯
            }
        }
    }

    protected adjustCamera(change: (s: Camera.Snapshot) => Camera.Snapshot) {
        if (!this.plugin.canvas3d) throw new Error('this.plugin.canvas3d is undefined');
        this.plugin.canvas3d.commit(true);
        const oldSnapshot = this.plugin.canvas3d.camera.getSnapshot();
        const newSnapshot = change(oldSnapshot);
        this.plugin.canvas3d.camera.setState(newSnapshot);
        const checkSnapshot = this.plugin.canvas3d.camera.getSnapshot();
        if (!Camera.areSnapshotsEqual(newSnapshot, checkSnapshot)) {
            console.error('Error: The camera has not been adjusted correctly.');
            console.error('Required:');
            console.error(newSnapshot);
            console.error('Real:');
            console.error(checkSnapshot);
            throw new Error(`AssertionError: The camera has not been adjusted correctly.`);
        }
    }

    protected zoomAll(zoomout: number = ZOOMOUT) {
        this.plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
        this.adjustCamera(s => cameraZoom(s, zoomout));
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
