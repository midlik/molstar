import * as fs from 'fs';

import { Viewer } from '../../../apps/viewer';
import { Camera } from '../../../mol-canvas3d/camera';
import { Sphere3D } from '../../../mol-math/geometry';
import { Mat3, Vec3 } from '../../../mol-math/linear-algebra';
import { Download, ParseCif, RawData, ReadFile } from '../../../mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from '../../../mol-plugin-state/transforms/representation';
import { PluginUIContext } from '../../../mol-plugin-ui/context';
import { PluginCommands } from '../../../mol-plugin/commands';
import { PluginContext } from '../../../mol-plugin/context';
import { ViewportScreenshotHelper } from '../../../mol-plugin/util/viewport-screenshot';
import { Color } from '../../../mol-util/color';
import { sleep } from '../../../mol-util/sleep';

import { Script } from './types';


export const scripts = {
    /**Blabla */
    s1:
        new Script(
            async (viewer: Viewer, pdbid: string) => {
                // throw new Error('Debug');
                // await sleep(5000);
                console.log('balbalbalbalablab');
                // await viewer.loadStructureFromUrl(`https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbid}.bcif`, 'mmcif', true);
                // await loadStructureCustom(viewer.plugin, `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbid}.bcif`);
                await loadStructureCustom(viewer.plugin, `file:///home/adam/${pdbid}.bcif`);
                // await sleep(500);
                // TODO await/force auto-zoom, before making snapshot!
                const image = await getImage(viewer.plugin, [800, 800]);
                // await viewer.loadStructureFromUrl(`https://www.ebi.ac.uk/pdbe/entry-files/download/2nnj.bcif`, 'mmcif', true);
                // const image2 = await getImage(viewer.plugin, [800, 800]);
                const molj = getStateSnapshot(viewer.plugin);
                await viewer.plugin.clear();
                return { molj, image };

            }
        ).withAfter(
            (args, result) => {
                fs.writeFileSync('/home/adam/test-state.molj', result.molj);
                fs.writeFileSync('/home/adam/test-image.png', result.image, 'base64');
                // fs.writeFileSync('/home/adam/test-image2.png', result.image2, 'base64');
                return result;
            }
        ),
    /**Blabla again */
    s2: new Script(
        async (viewer: Viewer, s: string) => {

            return s + s;
        },
    ),
};

export async function loadStructureCustom(plugin: PluginContext, url: string) {
    console.log('url:', url);
    // const data = fs.readFileSync(url); // DEBUG
    const update = plugin.build();
    const data = update.toRoot()
        // .apply(RawData, { data: data }) // DEBUG
        .apply(Download, { url, isBinary: true }) // TODO uncomment
    const structure = data
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
    // TODO test Asset caching in NodeJS
    // TODO custom camera position and rotation
    // plugin.managers.camera.focusSphere(Sphere3D.create(Vec3.create(0,10,10), 20));
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
}
/** Combine multiple rotation matrices in the order as they are applied */
function combineRotations(...matrices: Mat3[]) {
    // First applied rotation is the rightmost in the product
    let result = Mat3.identity();
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
    // const snapshot = cameraZoom(snapshot, 1);
    plugin.canvas3d.camera.setState(snapshot);
}

function cameraZoom(old: Camera.Snapshot, zoomout: number): Camera.Snapshot {
    let relPosition = Vec3.sub(Vec3(), old.position, old.target);
    relPosition = Vec3.scale(relPosition, relPosition, zoomout);
    const newPosition = Vec3.add(Vec3(), old.target, relPosition);
    return { ...old, position: newPosition };
}
/** Don't use, won't work with multiple subsequent rotations!!! TODO remove this function */
function cameraTurn(old: Camera.Snapshot, rotation: Mat3): Camera.Snapshot {
    const cameraRotation = Mat3.invert(Mat3(), rotation);
    let relPosition = Vec3.sub(Vec3(), old.position, old.target);
    relPosition = Vec3.transformMat3(relPosition, relPosition, cameraRotation);
    const newPosition = Vec3.add(Vec3(), old.target, relPosition);
    const newUp = Vec3.transformMat3(Vec3(), old.up, cameraRotation);
    return { ...old, position: newPosition, up: newUp };
}
function cameraSetRotation(old: Camera.Snapshot, rotation: Mat3): Camera.Snapshot {
    const cameraRotation = Mat3.invert(Mat3(), rotation); // TODO will this work with multiple subsequent rotations???!!! probably not!
    const dist = Vec3.distance(old.position, old.target);
    const relPosition = Vec3.transformMat3(Vec3(), Vec3.create(0, 0, dist), cameraRotation);
    const newUp = Vec3.transformMat3(Vec3(), Vec3.create(0, 1, 0), cameraRotation);
    const newPosition = Vec3.add(Vec3(), old.target, relPosition);
    return { ...old, position: newPosition, up: newUp };
}

function getStateSnapshot(plugin: PluginContext) {
    return JSON.stringify(plugin.managers.snapshot.getStateSnapshot({ params: {} }), null, 2);
}

export async function getImage(plugin: PluginContext, resolution: [number, number]) {
    const helper = plugin.helpers.viewportScreenshot ?? new ViewportScreenshotHelper(plugin);
    helper.values.resolution = { name: 'custom', params: { width: resolution[0], height: resolution[1] } };
    helper.values.transparent = true;
    const data = await helper.getImageDataUri();
    return data.split(',', 2)[1]; // remove MIME prefix
}