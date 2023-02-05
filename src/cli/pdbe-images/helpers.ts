import fs from 'fs';
import path from 'path';

import { Camera } from '../../mol-canvas3d/camera';
import { Mat3, Vec3 } from '../../mol-math/linear-algebra';
import { PluginStateSnapshotManager } from '../../mol-plugin-state/manager/snapshots';
import { PluginContext } from '../../mol-plugin/context';
import { HeadlessPluginContext } from '../../mol-plugin/headless-plugin-context';


/** Throw an error when a warning is issued. */
const FAIL_ON_WARNING = false;




export interface Disposable<T> {
    value: T,
    /** Should be awaited */
    dispose: () => any,
}

export namespace Disposable {
    /** Apply `func` to `resource`, then dispose it (a la context manager in Python) */
    export async function using<R, Y>(resource: Promise<Disposable<R>> | Disposable<R>, func: (resource: R) => Promise<Y> | Y) {
        const awaitedResource = await resource;
        try {
            return await func(awaitedResource.value);
        } finally {
            await awaitedResource.dispose();
        }
    }

    export function combine<K extends string | number, V>(disposables: { [key in K]: Disposable<V> }): Disposable<{ [key in K]: V }> {
        return {
            value: objectMapToObjectValues(disposables, (key, disp) => disp.value),
            dispose: () => Promise.all(objectMap(disposables, (key, disp) => disp.dispose())),
        };
    }

    export function hasValue<T>(disposable: Disposable<T | null | undefined>): disposable is Disposable<T> {
        return disposable.value !== null && disposable.value !== undefined;
    }
}


export function objForEach<K extends string | number, V>(obj: { [key in K]: V }, func: (key: string, value: V) => any): void {
    for (const key in obj) {
        const value = obj[key];
        func(key, value);
    }
}

export async function objForEachAsync<K extends string | number, V>(obj: { [key in K]: V }, func: (key: string, value: V) => Promise<any>): Promise<void> {
    for (const key in obj) {
        const value = obj[key];
        await func(key, value);
    }
}

export function objectMap<K extends string | number, V, V2>(obj: { [key in K]: V }, func: (key: string, value: V) => V2): V2[] {
    const result: V2[] = [];
    for (const key in obj) {
        const value = obj[key];
        result.push(func(key, value));
    }
    return result;
}

export function objectMapToObject<K extends string | number, V, K2 extends string | number, V2>(obj: { [key in K]: V }, func: (key: string, value: V) => [K2, V2]): { [key in K2]: V2 } {
    const result: { [key: string | number]: V2 } = {};
    for (const key in obj) {
        const value = obj[key];
        const [newKey, newValue] = func(key, value);
        result[newKey] = newValue;
    }
    return result as { [key in K2]: V2 };
}

export function objectMapToObjectValues<K extends string | number, V, V2>(obj: { [key in K]: V }, func: (key: string, value: V) => V2): { [key in K]: V2 } {
    const result: { [key: string | number]: V2 } = {};
    for (const key in obj) {
        const value = obj[key];
        result[key] = func(key, value);
    }
    return result as { [key in K]: V2 };
}

export async function objectMapToObjectValuesAsync<K extends string | number, V, V2>(obj: { [key in K]: V }, func: (key: string, value: V) => Promise<V2>): Promise<{ [key in K]: V2 }> {
    const result: { [key: string | number]: V2 } = {};
    for (const key in obj) {
        const value = obj[key];
        result[key] = await func(key, value);
    }
    return result as { [key in K]: V2 };
}


export const ROTATION_MATRICES = {
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

export function warn(...args: any[]) {
    console.warn('WARNING:', ...args);
    if (FAIL_ON_WARNING) {
        throw new Error(`Warning thrown and FAIL_ON_WARNING===true (${args})`);
    }
}