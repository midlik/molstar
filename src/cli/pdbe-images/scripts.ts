import { ModelSymmetry } from '../../mol-model-formats/structure/property/symmetry';
import { Download, ParseCif } from '../../mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../mol-plugin-state/transforms/model';
import { PluginContext } from '../../mol-plugin/context';
import { StateObjectSelector } from '../../mol-state';

import { PDBeAPI } from './api';
import { adjustCamera, cameraSetRotation, cameraZoom, Disposable, save3sides, zoomAll, ZOOMOUT } from './helpers';
import { structureLayingRotation } from './orient';
import { makeComponents, makeComponentsForEntities, makeComponentVisuals, makeComponentVisualsForEntities, makeEntities, makeModel, makeStructure, setColorByEntity, setFaded, setHighlight, setVisible } from './script-helpers';
import using = Disposable.using;



export async function processUrl(plugin: PluginContext, url: string, saveFunction: (name: string) => any, api: PDBeAPI, pdbId: string) {
    console.log('url:', url);
    await using(makeModel(plugin, url), async model => {
        await generateAll(plugin, model, saveFunction, api, pdbId);
    });
}

async function generateAll(plugin: PluginContext, model: StateObjectSelector, saveFunction: (name: string) => any, api: PDBeAPI, pdbId: string) {
    await using(makeStructure(plugin, model, {}), async structure => {
        const rotation = structureLayingRotation(structure.data!);

        await using(makeComponents(plugin, structure), async components => {
            await using(makeComponentVisuals(plugin, components), async visuals => {
                zoomAll(plugin);
                await save3sides(plugin, saveFunction, 'entry-by-chain', rotation, ZOOMOUT);

                await setColorByEntity(plugin, Object.values(visuals));
                await save3sides(plugin, saveFunction, 'entry-by-entity', rotation, ZOOMOUT);
            });
        });
    });

    const assemblies = ModelSymmetry.Provider.get(model.data!)?.assemblies ?? [];
    const prefferedAssembly = await api.getPrefferedAssembly(pdbId); // TODO allow local API and/or API-less mode?

    for (const ass of assemblies) {
        await using(makeStructure(plugin, model, { type: { name: 'assembly', params: { id: ass.id } } }), async structure => {
            const rotation = structureLayingRotation(structure.data!);

            await using(makeComponents(plugin, structure), async components => {
                await using(makeComponentVisuals(plugin, components), async visuals => {
                    zoomAll(plugin);
                    await save3sides(plugin, saveFunction, `assembly-${ass.id}-by-chain`, rotation, ZOOMOUT);

                    await setColorByEntity(plugin, Object.values(visuals));
                    await save3sides(plugin, saveFunction, `assembly-${ass.id}-by-entity`, rotation, ZOOMOUT);

                    if (ass.id === prefferedAssembly.assembly_id) {
                        await setFaded(plugin, Object.values(visuals));
                        await using(makeEntities(plugin, structure), async entities => {
                            await using(makeComponentsForEntities(plugin, entities), async entityComponents => {
                                await using(makeComponentVisualsForEntities(plugin, entityComponents), async entityVisuals => {
                                    for (const entityId in entities) {
                                        await setHighlight(plugin, Object.values(entityVisuals[entityId]));
                                        setVisible(plugin, entities[entityId], false);
                                    }
                                    for (const entityId in entities) {
                                        // const theseVisuals = Object.values(entityVisuals[entityId])
                                        // const isEmpty = theseVisuals.every(vis => !vis); // this will apply for water entity
                                        const isEmpty = Object.values(entityComponents[entityId]).every(comp => !comp); // this will apply for water entity
                                        if (isEmpty) continue;
                                        setVisible(plugin, entities[entityId], true);
                                        // await setHighlight(plugin, Object.values(entityVisuals[entityId]));
                                        await save3sides(plugin, saveFunction, `preferred-assembly-${ass.id}-highlight-${entityId}`, rotation, ZOOMOUT);
                                        // await setFaded(plugin, Object.values(entityVisuals[entityId]));
                                        setVisible(plugin, entities[entityId], false);
                                    }
                                });
                            });
                        });
                    }
                });
            });


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
    // // DEBUG
    // const obj1 = { 1: 'a', 2: 'b', 3: 'cccc' };
    // const obj2 = objectMapToObjectValues(obj1, (k, v) => v + k);
    // const obj3 = objectMapToObjectValues(obj1, (k, v) => v.length + parseInt(k));
    // const arr = objectMap(obj1, (k, v) => v.length + parseInt(k));
    // const obj4 = objectMapToObject(obj1, (k, v) => [v.length + parseInt(k), k + v]);
    // console.log(obj1);
    // console.log(obj2);
    // console.log(obj3);
    // console.log(arr);
    // console.log(obj4);
}
