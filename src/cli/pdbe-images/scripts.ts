import { Camera } from '../../mol-canvas3d/camera';
import { Mat3, Vec3 } from '../../mol-math/linear-algebra';
import { PrincipalAxes } from '../../mol-math/linear-algebra/matrix/principal-axes';
import { Model } from '../../mol-model/structure';
import { Download, ParseCif } from '../../mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from '../../mol-plugin-state/transforms/representation';
import { PluginContext } from '../../mol-plugin/context';
import { ViewportScreenshotHelper } from '../../mol-plugin/util/viewport-screenshot';


export async function loadStructureCustom(plugin: PluginContext, url: string) {
    console.log('url:', url);
    const update = plugin.build();
    const structure = update.toRoot()
        .apply(Download, { url, isBinary: true })
        .apply(ParseCif)
        .apply(TrajectoryFromMmCif)
        .apply(ModelFromTrajectory)
        .apply(StructureFromModel);
    const polymer = structure.apply(StructureComponent, { type: { name: 'static', params: 'polymer' } });
    const ligand = structure.apply(StructureComponent, { type: { name: 'static', params: 'ligand' } });
    polymer.apply(StructureRepresentation3D, {
        type: { name: 'cartoon', params: { alpha: 1 } },
        // colorTheme: { name: 'uniform', params: { value: Color.fromNormalizedRgb(0.4, 0.5, 1) } },
        colorTheme: { name: 'sequence-id', params: {} },
    });
    ligand.apply(StructureRepresentation3D, {
        type: { name: 'ball-and-stick', params: { sizeFactor: 1 } },
        colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'element-symbol', params: {} } } },
        sizeTheme: { name: 'physical', params: {} },
    });
    await update.commit();
    plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
    adjustCamera(plugin);

    // TODO custom camera position and rotation
    // plugin.managers.camera.focusSphere(Sphere3D.create(Vec3.create(0,10,10), 20));
}
export async function loadStructureCustom2(plugin: PluginContext, url: string) {
    console.log('url:', url);
    const model = await plugin.build().toRoot()
        .apply(Download, { url, isBinary: true })
        .apply(ParseCif)
        .apply(TrajectoryFromMmCif)
        .apply(ModelFromTrajectory).commit();
    modelLayingRotation(model.data!);
    const structure = await plugin.build().to(model.ref)
        .apply(StructureFromModel).commit(); //, {'type': {name: 'assembly',...}} can be done here
    const polymer = await plugin.build().to(structure.ref).apply(StructureComponent, { type: { name: 'static', params: 'polymer' } }).commit();
    const ligand = await plugin.build().to(structure.ref).apply(StructureComponent, { type: { name: 'static', params: 'ligand' } }).commit();
    await plugin.build().to(polymer.ref).apply(StructureRepresentation3D, {
        type: { name: 'cartoon', params: { alpha: 1 } },
        // colorTheme: { name: 'uniform', params: { value: Color.fromNormalizedRgb(0.4, 0.5, 1) } },
        colorTheme: { name: 'sequence-id', params: {} },
    }).commit();
    await plugin.build().to(ligand.ref).apply(StructureRepresentation3D, {
        type: { name: 'ball-and-stick', params: { sizeFactor: 1 } },
        colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'element-symbol', params: {} } } },
        sizeTheme: { name: 'physical', params: {} },
    }).commit();
    plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
    // adjustCamera(plugin);

    // TODO custom camera position and rotation
    // plugin.managers.camera.focusSphere(Sphere3D.create(Vec3.create(0,10,10), 20));
}

function modelLayingRotation(model: Model) {
    const coords = {
        x: model.atomicConformation.x,
        y: model.atomicConformation.y,
        z: model.atomicConformation.z,
    }
    const atomIds = model.atomicHierarchy.atoms.label_atom_id;
    const alphaIndices = indicesWith(atomIds.toArray(), 'CA');
    const alphaCoords = coordsAt(coords, alphaIndices);
    console.log('alpha indices:', alphaIndices, atomIds);
    console.log(alphaCoords.x.length, alphaCoords.x);
    const axes = PrincipalAxes.calculateMomentsAxes(flattenCoords(alphaCoords));
    const normAxes = PrincipalAxes.calculateNormalizedAxes(axes);
    console.log('axes:', axes);
    console.log('normalized axes:', normAxes);
}
function indicesWith<T>(array: ArrayLike<T>, value: T): number[] {
    const indices = [];
    for (let i = 0; i < array.length; i++) {
        if (array[i] === value) {
            indices.push(i);
        }
    }
    return indices;
}
type Coords = { x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number> }
function coordsAt(coords: Coords, indices: number[]): Coords {
    return {
        x: indices.map(i => coords.x[i]),
        y: indices.map(i => coords.y[i]),
        z: indices.map(i => coords.z[i]),
    };
}
function flattenCoords(coords: Coords): number[] {
    const flat = [];
    for (let i = 0; i < coords.x.length; i++) {
        flat.push(coords.x[i], coords.y[i], coords.z[i]);
    }
    return flat;
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

function adjustCamera(plugin: PluginContext) {
    if (!plugin.canvas3d) throw new Error('plugin.canvas3d is undefined');
    plugin.canvas3d.commit(true);
    let snapshot = plugin.canvas3d.camera.getSnapshot();
    plugin.canvas3d.commit(true);
    const combo = combineRotations(rotationMatrices.rotX90, rotationMatrices.rotY90);
    snapshot = cameraSetRotation(snapshot, combo);
    snapshot = cameraZoom(snapshot, 0.8);
    // const snapshot = cameraZoom(snapshot, 1);
    plugin.canvas3d.camera.setState(snapshot);
}

function cameraZoom(old: Camera.Snapshot, zoomout: number): Camera.Snapshot {
    let relPosition = Vec3.sub(Vec3(), old.position, old.target);
    relPosition = Vec3.scale(relPosition, relPosition, zoomout);
    const newPosition = Vec3.add(Vec3(), old.target, relPosition);
    return { ...old, position: newPosition };
}
function cameraSetRotation(old: Camera.Snapshot, rotation: Mat3): Camera.Snapshot {
    const cameraRotation = Mat3.invert(Mat3(), rotation); // TODO will this work with multiple subsequent rotations???!!! probably not!
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
