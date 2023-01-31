import fs from 'fs';
import path from 'path';

import { Camera } from '../../mol-canvas3d/camera';
import { Mat3, Vec3 } from '../../mol-math/linear-algebra';
import { PluginStateSnapshotManager } from "../../mol-plugin-state/manager/snapshots";
import { PluginContext } from "../../mol-plugin/context";
import { HeadlessPluginContext } from '../../mol-plugin/headless-plugin-context';


/** Throw an error when a warning is issued. */
const FAIL_ON_WARNING = true;


export const ZOOMOUT = 0.7;


export interface Disposable<T> {
    value: T,
    dispose: () => any,
}

/** Apply `func` to `resource`, then dispose it (a la context manager in Python) */
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

export function adjustCamera(plugin: PluginContext, change: (s: Camera.Snapshot) => Camera.Snapshot) {
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

export function adjustCamera_test(plugin: PluginContext) {
    // const combo = combineRotations(rotationMatrices.rotX90, rotationMatrices.rotY90);
    const combo = rotationMatrices.rotZ90;
    adjustCamera(plugin, s => cameraZoom(cameraSetRotation(s, combo), ZOOMOUT));
}

export function cameraZoom(old: Camera.Snapshot, zoomout: number): Camera.Snapshot {
    let relPosition = Vec3.sub(Vec3(), old.position, old.target);
    relPosition = Vec3.scale(relPosition, relPosition, zoomout);
    const newPosition = Vec3.add(Vec3(), old.target, relPosition);
    return { ...old, position: newPosition };
}

export function cameraSetRotation(old: Camera.Snapshot, rotation: Mat3): Camera.Snapshot {
    const cameraRotation = Mat3.invert(Mat3(), rotation);
    const dist = Vec3.distance(old.position, old.target);
    const relPosition = Vec3.transformMat3(Vec3(), Vec3.create(0, 0, dist), cameraRotation);
    const newUp = Vec3.transformMat3(Vec3(), Vec3.create(0, 1, 0), cameraRotation);
    const newPosition = Vec3.add(Vec3(), old.target, relPosition);
    return { ...old, position: newPosition, up: newUp };
}


export class NaughtySaver {
    constructor(
        public readonly plugin: HeadlessPluginContext,
        public readonly directory: string,
        /** If given this URL will replace the real URL in Download nodes in MOLJ state */
        public readonly urlInState?: string,
    ) { }

    async save(name: string) {
        await this.plugin.saveImage(path.join(this.directory, name + '.png'));

        const snapshot = this.plugin.getStateSnapshot();
        if (this.urlInState) {
            NaughtySaver.replaceUrlInState(snapshot, this.urlInState);
        }
        const snapshot_json = JSON.stringify(snapshot, null, 2);
        await new Promise<void>(resolve => fs.writeFile(path.join(this.directory, name + '.molj'), snapshot_json, () => resolve()));
        // await this.plugin.saveStateSnapshot(path.join(this.directory, name + '.molj'));
    }
    
    static replaceUrlInState(state: PluginStateSnapshotManager.StateSnapshot, newUrl: string) {
        for (const entry of state.entries) {
            for (const transform of entry.snapshot.data?.tree.transforms ?? []) {
                if (transform.transformer === 'ms-plugin.download') {
                    transform.params.url = newUrl;
                }
            }
        }
    }
}


export async function save3sides(plugin: PluginContext, saveFunction: (name: string) => any, name: string, rotation: Mat3 = Mat3.identity(), zoomout: number = 1) {
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

export async function save1side(plugin: PluginContext, saveFunction: (name: string) => any, name: string, rotation: Mat3 = Mat3.identity(), zoomout: number = 1) {
    plugin.managers.camera.reset(); // needed when camera.manualReset=true in canvas3D props
    adjustCamera(plugin, s => cameraZoom(s, zoomout));
    // TODO move zoom elsewhere (default zoom might depend on visualization!!! -> bad alignment)

    adjustCamera(plugin, s => cameraSetRotation(s, rotation));
    await saveFunction(name);
}

export function warn(...args: any[]){
    console.warn('WARNING:', ...args);
    if (FAIL_ON_WARNING) {
        throw new Error(`Warning thrown and FAIL_ON_WARNING===true (${args})`);
    }
}