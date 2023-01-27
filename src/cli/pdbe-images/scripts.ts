import path from 'path';
import { Camera } from '../../mol-canvas3d/camera';
import { Mat3, Vec3 } from '../../mol-math/linear-algebra';
import { ModelSymmetry } from '../../mol-model-formats/structure/property/symmetry';
import { RootStructureDefinition } from '../../mol-plugin-state/helpers/root-structure';
import { StructureComponentParams } from '../../mol-plugin-state/helpers/structure-component';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { Download, ParseCif } from '../../mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { PluginContext } from '../../mol-plugin/context';
import { HeadlessPluginContext } from '../../mol-plugin/headless-plugin-context';
import { ViewportScreenshotHelper } from '../../mol-plugin/util/viewport-screenshot';
import { StateObject, StateObjectSelector } from '../../mol-state';
import { ParamDefinition } from '../../mol-util/param-definition';
import { structureLayingRotation } from './orient';



export async function loadStructureCustom(plugin: PluginContext, url: string) {

    if (StructureFromModel.definition.params) {
        const f = StructureFromModel.definition.params(undefined, plugin);
        console.log(StructureFromModel.definition.params);
        console.log(f);
    }
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
    // console.log('polymer', !(polymer.data?.isEmpty), ', ligand', !(ligand.data?.isEmpty), ', branched', !(branched.data?.isEmpty));
    // console.log(polymer.data, ligand.data, branched.data);
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
    adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, Rs), 0.7));

    // TODO custom camera position and rotation
    // plugin.managers.camera.focusSphere(Sphere3D.create(Vec3.create(0,10,10), 20));
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
        const Rs = structureLayingRotation(structure.data!);
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
        // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, Rs), 0.7));
        // await saveFunction('entry');
        // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
        // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, Mat3.mul(Mat3(), rotationMatrices.rotY270, Rs)), 0.7));
        // await saveFunction('entry-side');
        // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
        // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, Mat3.mul(Mat3(), rotationMatrices.rotX90, Rs)), 0.7));
        // await saveFunction('entry-top');
        await save3sides(plugin, saveFunction, 'entry', Rs, 0.7);
    });

    const assemblies = ModelSymmetry.Provider.get(model.data!)?.assemblies ?? [];
    for (const ass of assemblies) {
        await using(makeStructure(plugin, model, { type: { name: 'assembly', params: { id: ass.id } } }), async structure => {
            const rotation = structureLayingRotation(structure.data!);
            // TODO laying rotation for assemblies! take transform into account
            console.log('R:', rotation);
            const polymer = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'polymer' } });
            const ligand = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'ligand' } });
            const branched = await createStructureComponent(plugin, structure, { type: { name: 'static', params: 'branched' } });
            if (polymer) {
                await plugin.build().to(polymer.ref).apply(StructureRepresentation3D, {
                    type: { name: 'cartoon', params: { alpha: 1 } },
                    // colorTheme: { name: 'uniform', params: { value: Color.fromNormalizedRgb(0.4, 0.5, 1) } },
                    // colorTheme: { name: 'sequence-id', params: {} },
                    colorTheme: { name: 'unit-index', params: {} }, // unit-index = chain instance, chain-id, entity-id
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
            // adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, r2), 0.7));
            // // plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
            // await saveFunction(`assembly-${ass.id}-side`);
            await save3sides(plugin, saveFunction, `assembly-${ass.id}`, rotation, 0.7);
    });
    }
    await saveFunction('disposed');
}

async function save3sides(plugin: PluginContext, saveFunction: (name: string) => any, name: string, rotation: Mat3 = Mat3.identity(), zoomout: number = 1) {
    plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
    adjustCamera(plugin, s => cameraZoom(s, zoomout));
    // TODO move zoom elsewhere (default zoom might depend on visualization!!! -> bad alignment)

    adjustCamera(plugin, s => cameraSetRotation(s, rotation));
    await saveFunction(name + '-front');
    adjustCamera(plugin, s => cameraSetRotation(s, Mat3.mul(Mat3(), rotationMatrices.rotY270, rotation)));
    await saveFunction(name + '-side');
    adjustCamera(plugin, s => cameraSetRotation(s, Mat3.mul(Mat3(), rotationMatrices.rotX90, rotation)));
    await saveFunction(name + '-top');
}

type StructureParams = ParamDefinition.Values<ReturnType<typeof RootStructureDefinition.getParams>>

async function makeStructure(plugin: PluginContext, model: StateObjectSelector, params: Partial<StructureParams>): Promise<Disposable<StateObjectSelector<PluginStateObject.Molecule.Structure, any>>> {
    const structure = await plugin.build().to(model.ref).apply(StructureFromModel, params).commit();
    return {
        value: structure,
        dispose: () => plugin.build().delete(structure).commit(),
    }
}

interface Disposable<T> {
    value: T,
    dispose: () => any,
}

export async function using<R, Y>(resource: Promise<Disposable<R>> | Disposable<R>, func: (resource: R) => Promise<Y> | Y) {
    const awaitedResource = await resource;
    try {
        return await func(awaitedResource.value);
    } finally {
        await awaitedResource.dispose();
    }
}

const rotationMatrices = {
    eye: Mat3.create(1, 0, 0, 0, 1, 0, 0, 0, 1), // column-wise
    rotX90: Mat3.create(1, 0, 0, 0, 0, 1, 0, -1, 0), // column-wise
    rotY90: Mat3.create(0, 0, -1, 0, 1, 0, 1, 0, 0), // column-wise
    rotZ90: Mat3.create(0, 1, 0, -1, 0, 0, 0, 0, 1), // column-wise
    rotX270: Mat3.create(1, 0, 0, 0, 0, -1, 0, 1, 0),
    rotY270: Mat3.create(0, 0, 1, 0, 1, 0, -1, 0, 0),
    rotZ270: Mat3.create(0, -1, 0, 1, 0, 0, 0, 0, 1),
    front: Mat3.create(1, 0, 0, 0, 1, 0, 0, 0, 1), // = eye
    top: Mat3.create(1, 0, 0, 0, 0, 1, 0, -1, 0), // = rotX90
    side: Mat3.create(0, 0, 1, 0, 1, 0, -1, 0, 0), // view from right = rotY270
};
/** Combine multiple rotation matrices in the order as they are applied */
function combineRotations(...matrices: Mat3[]) {
    // First applied rotation is the rightmost in the product
    const result = Mat3.identity();
    for (const mat of matrices) {
        Mat3.mul(result, mat, result);
    }
    return result;
}

function adjustCamera_test(plugin: PluginContext) {
    // const combo = combineRotations(rotationMatrices.rotX90, rotationMatrices.rotY90);
    const combo = rotationMatrices.rotZ90;
    adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, combo), 0.7));
}
let stamp = 0;
function adjustCamera(plugin: PluginContext, change: (s: Camera.Snapshot) => Camera.Snapshot) {
    if (!plugin.canvas3d) throw new Error('plugin.canvas3d is undefined');
    plugin.canvas3d.commit(true);
    const oldSnapshot = plugin.canvas3d.camera.getSnapshot();
    const newSnapshot = change(oldSnapshot);
    plugin.canvas3d.camera.setState(newSnapshot);
    // plugin.canvas3d.commit(true);
    const checkSnapshot = plugin.canvas3d.camera.getSnapshot();
    if (!Camera.areSnapshotsEqual(newSnapshot, checkSnapshot)) {
        console.error('Error: The camera has not been adjusted correctly.');
        console.error('Required:');
        console.error(newSnapshot);
        console.error('Real:');
        console.error(checkSnapshot);
        throw new Error(`AssertionError: The camera has not been adjusted correctly.`);
    }
}
function setCameta(plugin: PluginContext, rotation: Mat3, zoomout: number) {
    // TODO allow changing target
}

function cameraZoom(old: Camera.Snapshot, zoomout: number): Camera.Snapshot {
    let relPosition = Vec3.sub(Vec3(), old.position, old.target);
    relPosition = Vec3.scale(relPosition, relPosition, zoomout);
    const newPosition = Vec3.add(Vec3(), old.target, relPosition);
    return { ...old, position: newPosition };
}
function cameraSetRotation(old: Camera.Snapshot, rotation: Mat3): Camera.Snapshot {
    const cameraRotation = Mat3.invert(Mat3(), rotation);
    const dist = Vec3.distance(old.position, old.target);
    const relPosition = Vec3.transformMat3(Vec3(), Vec3.create(0, 0, dist), cameraRotation);
    const newUp = Vec3.transformMat3(Vec3(), Vec3.create(0, 1, 0), cameraRotation);
    const newPosition = Vec3.add(Vec3(), old.target, relPosition);
    return { ...old, position: newPosition, up: newUp };
}

export async function getImage(plugin: PluginContext, resolution: [number, number]) {
    const helper = plugin.helpers.viewportScreenshot ?? new ViewportScreenshotHelper(plugin);
    helper.values.resolution = { name: 'custom', params: { width: resolution[0], height: resolution[1] } };
    helper.values.transparent = true;
    const data = await helper.getImageDataUri();
    return data.split(',', 2)[1]; // remove MIME prefix
}

export async function save(plugin: HeadlessPluginContext, directory: string, prefix: string) {
    await plugin.saveImage(path.join(directory, prefix + '.png'));
    await plugin.saveStateSnapshot(path.join(directory, prefix + '.molj'));
    // TODO replace URLs in snapshot here
}