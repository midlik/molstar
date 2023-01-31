import { ModelSymmetry } from '../../mol-model-formats/structure/property/symmetry';
import { ChainIndex, Model } from '../../mol-model/structure';
import { RootStructureDefinition } from '../../mol-plugin-state/helpers/root-structure';
import { StructureComponentParams } from '../../mol-plugin-state/helpers/structure-component';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { Download, ParseCif } from '../../mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { PluginContext } from '../../mol-plugin/context';
import { StateObjectSelector } from '../../mol-state';
import { ParamDefinition } from '../../mol-util/param-definition';
import { Structure } from '../../mol-model/structure';
import { mmCIF_Schema } from '../../mol-io/reader/cif/schema/mmcif';
import { type Entities } from '../../mol-model/structure/model/properties/common';

import { PDBeAPI } from './api';
import { adjustCamera, cameraSetRotation, cameraZoom, Disposable, save3sides, using, ZOOMOUT } from './helpers';
import { structureLayingRotation } from './orient';
import { MolScriptBuilder } from '../../mol-script/language/builder';


const BRANCHED_STICKS_OPACITY = 0.5;


export async function loadStructureCustom(plugin: PluginContext, url: string) {
    console.log('url:', url);
    const model = await plugin.build().toRoot()
        .apply(Download, { url, isBinary: true })
        .apply(ParseCif)
        .apply(TrajectoryFromMmCif)
        .apply(ModelFromTrajectory).commit();
    const p = RootStructureDefinition.getParams();
    console.log(p);
    const structure = await plugin.build().to(model.ref)
        .apply(StructureFromModel).commit(); //, {'type': {name: 'assembly',...}} can be done here
    const Rs = structureLayingRotation(structure.data!);
    // const polymer = await plugin.build().to(structure.ref).apply(StructureComponent, { type: { name: 'static', params: 'polymer' } }).commit();
    // const ligand = await plugin.build().to(structure.ref).apply(StructureComponent, { type: { name: 'static', params: 'ligand' } }).commit();
    // const branched = await plugin.build().to(structure.ref).apply(StructureComponent, { type: { name: 'static', params: 'branched' } }).commit();
    const polymer = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'polymer' } });
    const ligand = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'ligand' } });
    const branched = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'branched' } });
    if (polymer) {
        await plugin.build().to(polymer.ref).apply(StructureRepresentation3D, {
            type: { name: 'cartoon', params: { alpha: 1 } },
            // colorTheme: { name: 'uniform', params: { value: Color.fromNormalizedRgb(0.4, 0.5, 1) } },
            colorTheme: { name: 'sequence-id', params: {} },
        }).commit();
    }
    if (ligand) {
        await plugin.build().to(ligand.ref).apply(StructureRepresentation3D, {
            type: { name: 'ball-and-stick', params: { sizeFactor: 1 } },
            colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'element-symbol', params: {} } } },
            sizeTheme: { name: 'physical', params: {} },
        }).commit();
    }
    plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
    // adjustCamera_test(plugin);
    adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, Rs), ZOOMOUT));
}
async function createStructureComponent(plugin: PluginContext, structure: StateObjectSelector, params: Partial<StructureComponentParams>): Promise<StateObjectSelector<PluginStateObject.Molecule.Structure, any> | null> {
    const result = await plugin.build().to(structure.ref).apply(StructureComponent, params).commit();
    if (result.data && !result.data.isEmpty) {
        return result;
    } else {
        await plugin.build().delete(result.ref).commit();
        return null;
    }
}

export async function processUrl(plugin: PluginContext, url: string, saveFunction: (name: string) => any, api: PDBeAPI, pdbId: string) {
    console.log('url:', url);
    const model = await plugin.build().toRoot()
        .apply(Download, { url, isBinary: true })
        .apply(ParseCif)
        .apply(TrajectoryFromMmCif)
        .apply(ModelFromTrajectory).commit();
    await generateAll(plugin, model, saveFunction, api, pdbId);
    // TODO custom camera position and rotation
    // plugin.managers.camera.focusSphere(Sphere3D.create(Vec3.create(0,10,10), 20));
}

async function generateAll(plugin: PluginContext, model: StateObjectSelector, saveFunction: (name: string) => any, api: PDBeAPI, pdbId: string) {
    await using(makeStructure(plugin, model, {}), async structure => {
        await using(makeComponents(plugin, structure), async components => {
            const rotation = structureLayingRotation(structure.data!);
            const polymerCartoon = await makeCartoon(plugin, components.polymer);
            const ligandSticks = await makeBallsAndSticks(plugin, components.ligand);
            const branchedCarbohydrate = await makeCarbohydrate(plugin, components.branched);
            const branchedSticks = await makeBallsAndSticks(plugin, components.branched);
            await setOpacity(plugin, branchedSticks.value, BRANCHED_STICKS_OPACITY);
            const visuals = [polymerCartoon.value, ligandSticks.value, branchedCarbohydrate.value, branchedSticks.value];

            await save3sides(plugin, saveFunction, 'entry-by-chain', rotation, ZOOMOUT);

            await setColorByEntity(plugin, visuals);
            await save3sides(plugin, saveFunction, 'entry-by-entity', rotation, ZOOMOUT);

            // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
            // // adjustCamera_test(plugin);
            // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, Rs), ZOOMOUT));
            // await saveFunction('entry');
            // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
            // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, Mat3.mul(Mat3(), rotationMatrices.rotY270, Rs)), ZOOMOUT));
            // await saveFunction('entry-side');
            // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
            // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, Mat3.mul(Mat3(), rotationMatrices.rotX90, Rs)), ZOOMOUT));
            // await saveFunction('entry-top');

            // console.log('MODEL');
            // findEntities(structure.data!.model);
            // for (let unit of structure.data?.units ?? []) {
            //     // unit = {...unit} as any; // debug
            //     // delete (unit as any).model; // debug
            //     console.log('unit', unit.id, 'chain', unit.chainGroupId, unit.model.atomicHierarchy.chainAtomSegments.index[unit.elements[0]], 'elem', unit.elements[0],);
            //     // console.log(unit, '\n');
            // }
            // const chains = structure.data!.model.atomicHierarchy.chains;
            // for (let i = 0; i < chains._rowCount; i++) {
            //     console.log(i, 'chain', chains.label_asym_id.value(i), chains.label_entity_id.value(i));
            // }
        });
    });

    const assemblies = ModelSymmetry.Provider.get(model.data!)?.assemblies ?? [];
    const prefferedAssembly = await api.getPrefferedAssembly(pdbId); // TODO allow local API and/or API-less mode?
    for (const ass of assemblies) {
        await using(makeStructure(plugin, model, { type: { name: 'assembly', params: { id: ass.id } } }), async structure => {
            const rotation = structureLayingRotation(structure.data!);

            await using(makeComponents(plugin, structure), async components => {
                const polymerCartoon = await makeCartoon(plugin, components.polymer);
                const ligandSticks = await makeBallsAndSticks(plugin, components.ligand);
                const branchedCarbohydrate = await makeCarbohydrate(plugin, components.branched);
                const branchedSticks = await makeBallsAndSticks(plugin, components.branched);
                await setOpacity(plugin, branchedSticks.value, BRANCHED_STICKS_OPACITY);
                const visuals = [polymerCartoon.value, ligandSticks.value, branchedCarbohydrate.value, branchedSticks.value];

                await save3sides(plugin, saveFunction, `assembly-${ass.id}-by-chain`, rotation, ZOOMOUT);

                await setColorByEntity(plugin, visuals);
                await save3sides(plugin, saveFunction, `assembly-${ass.id}-by-entity`, rotation, ZOOMOUT);

            });

            if (ass.id === prefferedAssembly.assembly_id || true) { // DEBUG
                // TODO selected and other polymer/ligand/cartoon
                const entityInfo = getEntityInfo(structure.data!);
                console.log('Assembly', ass.id, 'entities:', entityInfo);

                await using(makeComponents(plugin, structure), async components => {
                    const polymerCartoon = await makeCartoon(plugin, components.polymer);
                    const ligandSticks = await makeBallsAndSticks(plugin, components.ligand);
                    const branchedCarbohydrate = await makeCarbohydrate(plugin, components.branched);
                    const branchedSticks = await makeBallsAndSticks(plugin, components.branched);
                    await setOpacity(plugin, branchedSticks.value, BRANCHED_STICKS_OPACITY);
                    const visuals = [polymerCartoon.value, ligandSticks.value, branchedCarbohydrate.value, branchedSticks.value];

                    await save3sides(plugin, saveFunction, `preferred-assembly-${ass.id}-by-chain`, rotation, ZOOMOUT);

                    await setColorByEntity(plugin, visuals);
                    await save3sides(plugin, saveFunction, `preferred-assembly-${ass.id}-by-entity`, rotation, ZOOMOUT);
                });
                // await using(makeEntitySelection(plugin, structure, '1'), async sel => {
                //     await save3sides(plugin, saveFunction, `preferred-assembly-${ass.id}-selection`, rotation, ZOOMOUT);
                // });
                await using(makeSelectionsByEntity(plugin, structure), async sels => {
                    await save3sides(plugin, saveFunction, `preferred-assembly-${ass.id}-selections`, rotation, ZOOMOUT);
                });

            }

            // console.log('ASSEMBLY', ass.id);
            // findEntities(structure.data!.model);
            // for (let unit of structure.data?.units ?? []) {
            //     // unit = {...unit} as any; // debug
            //     // delete (unit as any).model; // debug
            //     const firstElementIdx = unit.elements[0];
            //     const chainIdx = unit.model.atomicHierarchy.chainAtomSegments.index[firstElementIdx];
            //     const entityId = unit.model.atomicHierarchy.chains.label_entity_id.value(chainIdx);
            //     console.log('unit', unit.id, 'chain', unit.chainGroupId, unit.model.atomicHierarchy.chainAtomSegments.index[unit.elements[0]], 'elem', unit.elements[0],);
            //     // console.log(unit, '\n');
            // }
            // const chains = structure.data!.model.atomicHierarchy.chains;
            // for (let i = 0; i < chains._rowCount; i++) {
            //     console.log(i, 'chain', chains.label_asym_id.value(i), chains.label_entity_id.value(i));
            // }
        });
    }
    await saveFunction('disposed');

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

type EntityType = ReturnType<Entities['data']['type']['value']>

function getEntityInfo(structure: Structure) {
    const entities = structure.model.entities;
    const ent: { [entityId: string]: { description: string[], type: EntityType, chains: ChainIndex[] } } = {};

    for (let i = 0; i < entities.data._rowCount; i++) {
        const id = entities.data.id.value(i);
        const typ = entities.data.type.value(i);
        const desc = entities.data.pdbx_description.value(i);
        ent[id] = { description: desc, type: typ, chains: [] };
    }

    for (let unit of structure.units ?? []) {
        const firstElementIdx = unit.elements[0];
        const chainIdx = unit.model.atomicHierarchy.chainAtomSegments.index[firstElementIdx];
        const entityId = unit.model.atomicHierarchy.chains.label_entity_id.value(chainIdx);
        ent[entityId].chains.push(chainIdx);
    }
    return ent;
}

type ModelObjSelector = StateObjectSelector<PluginStateObject.Molecule.Model, any>
type StructureObjSelector = StateObjectSelector<PluginStateObject.Molecule.Structure, any>
type VisualObjSelector = StateObjectSelector<PluginStateObject.Molecule.Structure.Representation3D, any>

type StructureParams = ParamDefinition.Values<ReturnType<typeof RootStructureDefinition.getParams>>
type VisualParams = ReturnType<typeof StructureRepresentation3D.createDefaultParams>

async function makeStructure(plugin: PluginContext, model: ModelObjSelector, params: Partial<StructureParams>): Promise<Disposable<StructureObjSelector>> {
    const structure = await plugin.build().to(model.ref).apply(StructureFromModel, params).commit();
    return {
        value: structure,
        dispose: () => plugin.build().delete(structure).commit(),
    };
}

async function makeComponents(plugin: PluginContext, structure: StructureObjSelector) {
    const polymer = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'polymer' } });
    const ligand = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'ligand' } });
    const branched = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'branched' } });
    const components = { polymer, ligand, branched };
    return {
        value: components,
        dispose: async () => {
            const update = plugin.build();
            for (const key in components) {
                const component = components[key as keyof typeof components];
                if (component) {
                    update.delete(component);
                }
            }
            await update.commit();
        }
    };
}

async function makeEntitySelection(plugin: PluginContext, structure: StructureObjSelector, entityId: string) {
    const sel = MolScriptBuilder.struct.generator.atomGroups({
        'entity-test': MolScriptBuilder.core.rel.eq([
            MolScriptBuilder.struct.atomProperty.macromolecular.label_entity_id(),
            entityId,
        ])
    });
    const selection = await createStructureComponent(plugin, structure, { type: { name: 'expression', params: sel } });
    return selection ?
        {
            value: selection,
            dispose: () => plugin.build().delete(selection).commit(),
        }
        : {
            value: null,
            dispose: () => { },
        };
}
async function makeSelectionsByEntity(plugin: PluginContext, structure: StructureObjSelector) {
    const info = getEntityInfo(structure.data!);
    const selections: { [entityId: string]: StateObjectSelector } = {};
    for (const entityId in info) {
        const expression = MolScriptBuilder.struct.generator.atomGroups({
            'entity-test': MolScriptBuilder.core.rel.eq([
                MolScriptBuilder.struct.atomProperty.macromolecular.label_entity_id(),
                entityId,
            ])
        });
        const selection = await createStructureComponent(plugin, structure, { type: { name: 'expression', params: expression } });
        if (selection) {
            selections[entityId] = selection;
        }
    }
    return {
        value: selections,
        dispose: async () => {
            const update = plugin.build();
            for (const key in selections) {
                const component = selections[key as keyof typeof selections];
                if (component) {
                    update.delete(component);
                }
            }
            await update.commit();
        } // TODO this code repeats -> factor out
    }
}


async function makeVisual(plugin: PluginContext, structure: StructureObjSelector | null, params: Partial<VisualParams>): Promise<Disposable<VisualObjSelector | null>> {
    if (!structure) {
        return {
            value: null,
            dispose: () => { },
        }
    }
    const visual = await plugin.build().to(structure).apply(StructureRepresentation3D, params).commit();
    return {
        value: visual,
        dispose: () => plugin.build().delete(visual).commit(),
    }
}

async function makeCartoon(plugin: PluginContext, structure: StructureObjSelector | null) {
    return await makeVisual(plugin, structure, {
        type: { name: 'cartoon', params: { alpha: 1 } },
        colorTheme: { name: 'unit-index', params: {} }, // sequence-id if there is only 1 chain ?
    });
}

async function makeBallsAndSticks(plugin: PluginContext, structure: StructureObjSelector | null) {
    return await makeVisual(plugin, structure, {
        type: { name: 'ball-and-stick', params: { sizeFactor: 0.25, sizeAspectRatio: 0.5 } },
        colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'element-symbol', params: {} } } }, // in original: carbonColor: chain-id
        sizeTheme: { name: 'physical', params: {} },
    });
}

async function makeCarbohydrate(plugin: PluginContext, structure: StructureObjSelector | null) {
    return await makeVisual(plugin, structure, {
        type: { name: 'carbohydrate', params: {} },
        colorTheme: { name: 'carbohydrate-symbol', params: {} },
        sizeTheme: { name: 'uniform', params: { value: 1 } },
    });
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

async function setColorByEntity(plugin: PluginContext, visual: VisualObjSelector | null | (VisualObjSelector | null)[], options?: { ignoreElementColors: boolean }) {
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
