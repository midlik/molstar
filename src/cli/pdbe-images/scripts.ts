import { ModelSymmetry } from '../../mol-model-formats/structure/property/symmetry';
import { RootStructureDefinition } from '../../mol-plugin-state/helpers/root-structure';
import { StructureComponentParams } from '../../mol-plugin-state/helpers/structure-component';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { Download, ParseCif } from '../../mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { PluginContext } from '../../mol-plugin/context';
import { StateObjectSelector } from '../../mol-state';
import { ParamDefinition } from '../../mol-util/param-definition';
import { adjustCamera, cameraSetRotation, cameraZoom, Disposable, save3sides, using, ZOOMOUT } from './helpers';
import { structureLayingRotation } from './orient';


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

export async function processUrl(plugin: PluginContext, url: string, saveFunction: (name: string) => any) {
    console.log('url:', url);
    const model = await plugin.build().toRoot()
        .apply(Download, { url, isBinary: true })
        .apply(ParseCif)
        .apply(TrajectoryFromMmCif)
        .apply(ModelFromTrajectory).commit();
    await generateAll(plugin, model, saveFunction);
    // TODO custom camera position and rotation
    // plugin.managers.camera.focusSphere(Sphere3D.create(Vec3.create(0,10,10), 20));
}

async function generateAll(plugin: PluginContext, model: StateObjectSelector, saveFunction: (name: string) => any) {
    await using(makeStructure(plugin, model, {}), async structure => {
        const rotation = structureLayingRotation(structure.data!);
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
        await save3sides(plugin, saveFunction, 'entry', rotation, ZOOMOUT);
    });

    const assemblies = ModelSymmetry.Provider.get(model.data!)?.assemblies ?? [];
    for (const ass of assemblies) {
        await using(makeStructure(plugin, model, { type: { name: 'assembly', params: { id: ass.id } } }), async structure => {
            const rotation = structureLayingRotation(structure.data!);
            const polymer = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'polymer' } });
            const ligand = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'ligand' } });
            const branched = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'branched' } });
            if (polymer) {
                await plugin.build().to(polymer.ref).apply(StructureRepresentation3D, {
                    type: { name: 'cartoon', params: { alpha: 1 } },
                    // colorTheme: { name: 'uniform', params: { value: Color.fromNormalizedRgb(0.4, 0.5, 1) } },
                    // colorTheme: { name: 'sequence-id', params: {} },
                    colorTheme: { name: 'unit-index', params: {} }, // unit-index = chain instance, 
                    //chain-id, entity-id
                }).commit();
            }
            if (ligand) {
                await plugin.build().to(ligand.ref).apply(StructureRepresentation3D, {
                    type: { name: 'ball-and-stick', params: { sizeFactor: 1 } },
                    colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'element-symbol', params: {} } } },
                    sizeTheme: { name: 'physical', params: {} },
                }).commit();
            }
            // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
            // // adjustCamera_test(plugin);
            // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, rotation), 1.7));
            // // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
            // await saveFunction(`assembly-${ass.id}`);
            // const r2 = Mat3.mul(Mat3(), rotation, rotationMatrices.rotY90);
            // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, r2), ZOOMOUT));
            // // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
            // await saveFunction(`assembly-${ass.id}-side`);
            await save3sides(plugin, saveFunction, `assembly-${ass.id}`, rotation, ZOOMOUT);
        });
    }
    await saveFunction('disposed');
}

type StructureParams = ParamDefinition.Values<ReturnType<typeof RootStructureDefinition.getParams>>

async function makeStructure(plugin: PluginContext, model: StateObjectSelector, params: Partial<StructureParams>): Promise<Disposable<StateObjectSelector<PluginStateObject.Molecule.Structure, any>>> {
    const structure = await plugin.build().to(model.ref).apply(StructureFromModel, params).commit();
    return {
        value: structure,
        dispose: () => plugin.build().delete(structure).commit(),
    };
}

async function makeComponents(plugin: PluginContext, structure: StateObjectSelector, params: Partial<StructureParams>) {
    const polymer = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'polymer' } });
    const ligand = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'ligand' } });
    const branched = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'branched' } });
    const components = { polymer, ligand, branched };
    return {
        value: components,
        dispose: async () => {
            const update = plugin.build();
            for (const key of components as any) {
                if (components[key as any]) {
                    update.delete(components[key]);
                }
            }
            await update;
        }
    };
}
