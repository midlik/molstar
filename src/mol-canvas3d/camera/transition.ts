/**
 * Copyright (c) 2018-2024 Mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { lerp } from '../../mol-math/interpolate';
import { Quat, Vec3 } from '../../mol-math/linear-algebra';
import { Camera } from '../camera';


export { CameraTransitionManager };

class CameraTransitionManager {
    private t = 0;

    private func: CameraTransitionManager.TransitionFunc = CameraTransitionManager.defaultTransition;
    private start = 0;
    inTransition = false;
    private durationMs = 0;
    private _source: Camera.Snapshot = Camera.createDefaultSnapshot();
    private _target: Camera.Snapshot = Camera.createDefaultSnapshot();
    private _current = Camera.createDefaultSnapshot();

    get source(): Readonly<Camera.Snapshot> { return this._source; }
    get target(): Readonly<Camera.Snapshot> { return this._target; }

    apply(to: Partial<Camera.Snapshot>, durationMs: number = 0, transition?: CameraTransitionManager.TransitionFunc) {
        if (!this.inTransition || durationMs > 0) {
            Camera.copySnapshot(this._source, this.camera.state);
        }

        if (!this.inTransition) {
            Camera.copySnapshot(this._target, this.camera.state);
        }

        Camera.copySnapshot(this._target, to);

        if (this._target.radius > this._target.radiusMax) {
            this._target.radius = this._target.radiusMax;
        }

        if (this._target.radius < 0.01) this._target.radius = 0.01;
        if (this._target.radiusMax < 0.01) this._target.radiusMax = 0.01;

        if (!this.inTransition && durationMs <= 0 || (typeof to.mode !== 'undefined' && to.mode !== this.camera.state.mode)) {
            this.finish(this._target);
            return;
        }

        this.inTransition = true;
        this.func = transition || CameraTransitionManager.defaultTransition;

        if (!this.inTransition || durationMs > 0) {
            this.start = this.t;
            this.durationMs = durationMs;
        }
    }

    tick(t: number) {
        this.t = t;
        this.update();
    }

    private finish(to: Partial<Camera.Snapshot>) {
        Camera.copySnapshot(this.camera.state, to);
        this.inTransition = false;
    }

    private update() {
        if (!this.inTransition) return;

        const normalized = Math.min((this.t - this.start) / this.durationMs, 1);
        if (normalized === 1) {
            this.finish(this._target!);
            return;
        }

        this.func(this._current, normalized, this._source, this._target);
        Camera.copySnapshot(this.camera.state, this._current);
    }

    constructor(private camera: Camera) {

    }
}

namespace CameraTransitionManager {
    export type TransitionFunc = (out: Camera.Snapshot, t: number, source: Camera.Snapshot, target: Camera.Snapshot) => void

    const _rotUp = Quat.identity();
    const _rotDist = Quat.identity();

    const _sourcePosition = Vec3();
    const _targetPosition = Vec3();

    export function defaultTransition_orig(out: Camera.Snapshot, t: number, source: Camera.Snapshot, target: Camera.Snapshot): void {
        Camera.copySnapshot(out, target);

        // Rotate up
        Quat.slerp(_rotUp, Quat.Identity, Quat.rotationTo(_rotUp, source.up, target.up), t);
        Vec3.transformQuat(out.up, source.up, _rotUp);

        // Lerp target, position & radius
        Vec3.lerp(out.target, source.target, target.target, t);

        // Interpolate distance
        const distSource = Vec3.distance(source.target, source.position);
        const distTarget = Vec3.distance(target.target, target.position);
        const dist = lerp(distSource, distTarget, t);

        // Rotate between source and targer direction
        Vec3.sub(_sourcePosition, source.position, source.target);
        Vec3.normalize(_sourcePosition, _sourcePosition);

        Vec3.sub(_targetPosition, target.position, target.target);
        Vec3.normalize(_targetPosition, _targetPosition);

        Quat.rotationTo(_rotDist, _sourcePosition, _targetPosition);
        Quat.slerp(_rotDist, Quat.Identity, _rotDist, t);

        Vec3.transformQuat(_sourcePosition, _sourcePosition, _rotDist);
        Vec3.scale(_sourcePosition, _sourcePosition, dist);

        Vec3.add(out.position, out.target, _sourcePosition);

        // Interpolate radius
        out.radius = lerp(source.radius, target.radius, t);
        // TODO take change of `clipFar` into account
        out.radiusMax = lerp(source.radiusMax, target.radiusMax, t);

        // Interpolate fov & fog
        out.fov = lerp(source.fov, target.fov, t);
        out.fog = lerp(source.fog, target.fog, t);
    }

    export function defaultTransition(out: Camera.Snapshot, t: number, source: Camera.Snapshot, target: Camera.Snapshot): void {
        const ALPHA = 1; // 0 - equivalent to position interpolation (unless FOV changes), 1 - focuses union of source and target focus spheres in the middle of transition
        // TODO make alpha customizable

        Camera.copySnapshot(out, target);

        // Rotate up
        Quat.slerp(_rotUp, Quat.Identity, Quat.rotationTo(_rotUp, source.up, target.up), t);
        Vec3.transformQuat(out.up, source.up, _rotUp);

        // Lerp target, position & radius
        Vec3.lerp(out.target, source.target, target.target, t);

        const shift = Vec3.distance(source.target, target.target);

        // Interpolate radius
        out.radius = swellingRadiusInterpolation(source.radius, target.radius, shift, ALPHA, t);
        // TODO take change of `clipFar` into account
        out.radiusMax = swellingRadiusInterpolation(source.radiusMax, target.radiusMax, shift, ALPHA, t);

        // Interpolate fov & fog
        out.fov = lerp(source.fov, target.fov, t);
        out.fog = lerp(source.fog, target.fog, t);
        // TODO fix Canvas3D.setProps() setting FOV instantly before transition starts!

        // Interpolate distance (indirectly via visible sphere radius)
        const rVisSource = visibleSphereRadius(source);
        const rVisTarget = visibleSphereRadius(target);
        const rVis = swellingRadiusInterpolation(rVisSource, rVisTarget, shift, ALPHA, t);
        const dist = cameraTargetDistance(rVis, out.mode, out.fov);

        // Rotate between source and targer direction
        Vec3.sub(_sourcePosition, source.position, source.target);
        Vec3.normalize(_sourcePosition, _sourcePosition);

        Vec3.sub(_targetPosition, target.position, target.target);
        Vec3.normalize(_targetPosition, _targetPosition);

        Quat.rotationTo(_rotDist, _sourcePosition, _targetPosition);
        Quat.slerp(_rotDist, Quat.Identity, _rotDist, t);

        Vec3.transformQuat(_sourcePosition, _sourcePosition, _rotDist);
        Vec3.scale(_sourcePosition, _sourcePosition, dist);

        Vec3.add(out.position, out.target, _sourcePosition);
    }
}


/** Sphere radius "interpolation" method that increases radius in the middle of transition.
 * `r0`, `r1` - radius of source (t=0) and target (t=1) sphere;
 * `dist` - distance between centers of source and target sphere;
 * `alpha` - swell parameter (0 = no swell = linear interpolation, 1 = sphere for t=0.5 will be circumscribed to source and radius spheres */
function swellingRadiusInterpolation(r0: number, r1: number, dist: number, alpha: number, t: number): number {
    const a = -2 * alpha * dist;
    const b = -a - r0 + r1;
    const c = r0;
    return a * t ** 2 + b * t + c;
}

/** Return the radius of the largest sphere centered in camera.target which is fully in FOV */
function visibleSphereRadius(camera: Camera.Snapshot): number {
    const distance = Vec3.distance(camera.target, camera.position);
    if (camera.mode === 'orthographic')
        return distance * Math.tan(camera.fov / 2);
    else // perspective
        return distance * Math.sin(camera.fov / 2);
}
/** Return the distance of camera from the center of a sphere with radius `visRadius` so that the sphere just fits into FOV */
function cameraTargetDistance(visRadius: number, mode: Camera.Mode, fov: number): number {
    if (mode === 'orthographic')
        return visRadius / Math.tan(fov / 2);
    else // perspective
        return visRadius / Math.sin(fov / 2);
}
