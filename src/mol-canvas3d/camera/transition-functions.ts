/**
 * Copyright (c) 2024 Mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Adam Midlik <midlik@gmail.com>
 */

import { lerp } from '../../mol-math/interpolate';
import { Quat, Vec3 } from '../../mol-math/linear-algebra';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { Camera } from '../camera';
import { CameraTransitionManager } from './transition';


export const CameraTransitionParams = {
    shape: PD.MappedStatic('linear', {
        'linear': PD.EmptyGroup(),
        'linear-size-relative': PD.EmptyGroup(),
        'leaping': PD.Group({
            smart: PD.Boolean(true, { description: 'Decrease leaping for transitions between near places.' })
        }),
    }),
    ease: PD.Group({
        easeIn: PD.Numeric(0, { min: 0, max: 1, step: 0.01 }, { description: 'Length of accelerating phase of the transition, relative to total transition duration. easeIn+easeOut must be <= 1.' }),
        easeOut: PD.Numeric(0, { min: 0, max: 1, step: 0.01 }, { description: 'Length of decelerating phase of the transition, relative to total transition duration. easeIn+easeOut must be <= 1.' }),
    }),
};
export type CameraTransitionParams = typeof CameraTransitionParams;
export type CameraTransitionProps = PD.ValuesFor<CameraTransitionParams>;

// TODO continue here, allowing `CameraTransitionProps` as `transition` in `CameraTransitionManager.apply` and passing from `Camera.setState` in src/mol-canvas3d/camera.ts
export function getTransitionFunction(props: CameraTransitionProps): CameraTransitionManager.TransitionFunc {
    const ease = (t: number) => easeAdjustment(t, props.ease.easeIn, props.ease.easeOut);
    const shape = getTransitionShapeFunction(props.shape);
    return (out: Camera.Snapshot, t: number, source: Camera.Snapshot, target: Camera.Snapshot) => shape(out, ease(t), source, target);
}
function getTransitionShapeFunction(props: CameraTransitionProps['shape']): CameraTransitionManager.TransitionFunc {
    if (props.name === 'linear') return defaultTransition_linear;
    if (props.name === 'linear-size-relative') return defaultTransition_linear_constRelSpeed;
    if (props.name === 'leaping') return defaultTransition_leaping;
    throw new Error(`Unknown transition shape: ${(props as CameraTransitionProps['shape']).name}`);
}


const _rotUp = Quat.identity();
const _rotDist = Quat.identity();

const _sourcePosition = Vec3();
const _targetPosition = Vec3();


export const defaultTransition_linear = CameraTransitionManager.defaultTransition;

export function defaultTransition_linear_constRelSpeed(out: Camera.Snapshot, t: number, source: Camera.Snapshot, target: Camera.Snapshot): void {
    const distSource = Vec3.distance(source.target, source.position);
    const distTarget = Vec3.distance(target.target, target.position);
    const q = constRelSpeedQuotientAdj_linRadIntp(t, distSource, distTarget);
    // console.log('adj', q, t, `, R ${distSource}->${distTarget}`)
    // TODO calculate from vis.radius, not dist
    // TODO only apply constRelSpeedLinRadIntpT2Q to position and distance interpolation, not needed for angles
    return defaultTransition_linear(out, q, source, target);
}

export function defaultTransition_leaping(out: Camera.Snapshot, t: number, source: Camera.Snapshot, target: Camera.Snapshot): void {
    Camera.copySnapshot(out, target);

    // Rotate up
    Quat.slerp(_rotUp, Quat.Identity, Quat.rotationTo(_rotUp, source.up, target.up), t);
    Vec3.transformQuat(out.up, source.up, _rotUp);

    // Interpolate target
    Vec3.lerp(out.target, source.target, target.target, t);

    const shift = Vec3.distance(source.target, target.target);

    // Interpolate radius
    out.radius = swellingRadiusInterpolationSmart(source.radius, target.radius, shift, t);
    // TODO take change of `clipFar` into account
    out.radiusMax = swellingRadiusInterpolationSmart(source.radiusMax, target.radiusMax, shift, t);

    // Interpolate fov & fog
    out.fov = lerp(source.fov, target.fov, t);
    out.fog = lerp(source.fog, target.fog, t);
    // TODO fix Canvas3D.setProps() setting FOV instantly before transition starts!

    // Interpolate distance (indirectly via visible sphere radius)
    const rVisSource = visibleSphereRadius(source);
    const rVisTarget = visibleSphereRadius(target);
    const rVis = swellingRadiusInterpolationSmart(rVisSource, rVisTarget, shift, t);
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

/** Compute relative transition quotient from relative time, for ease-in/ease-out effect.
 * `ease = [0.5, 0.5]` gives a curve very similar to "ease-in-out" aka "cubic-bezier(.42,0,.58,1)" in CSS */
function easeAdjustment(t: number, easeIn: number, easeOut: number): number {
    const vMax = 1 / (1 - 0.5 * easeIn - 0.5 * easeOut);
    if (t < easeIn) {
        // Ease-in phase
        return 0.5 * vMax * t ** 2 / easeIn;
    } else if (t <= 1 - easeOut) {
        // Linear phase
        return 0.5 * vMax * easeIn + (t - easeIn) * vMax;
    } else {
        // Ease-out phase
        return 1 - 0.5 * vMax * (1 - t) ** 2 / easeOut;
    }
}

/** Sphere radius "interpolation" method which increases the radius during transition so that for some t (0<=t<=1) the interpolated sphere will contain both source and target spheres.
 * `r0`, `r1` - radius of source (t=0) and target (t=1) sphere;
 * `dist` - distance between centers of source and target sphere. */
function swellingRadiusInterpolationCubic(r0: number, r1: number, dist: number, t: number): number {
    if (dist === 0) {
        return lerp(r0, r1, t);
    }
    if (r1 >= dist + r0) { // Sphere 1 fully contains sphere 0
        const alpha = dist / (r1 - r0);
        return lerp(r0, r1, niceCubic(t, alpha));
    }
    if (r0 >= dist + r1) { // Sphere 0 fully contains sphere 1
        const alpha = dist / (r0 - r1);
        return lerp(r1, r0, niceCubic(1 - t, alpha));
    }
    const tmax = (dist - r0 + r1) / 2 / dist;
    const rmax = (dist + r0 + r1) / 2;
    if (t <= tmax) {
        return lerp(r0, rmax, niceCubic(t / tmax));
    } else {
        return lerp(r1, rmax, niceCubic((1 - t) / (1 - tmax)));
    }
}
/** Sphere radius "interpolation" method similar to swellingRadiusInterpolationCubic,
 * but swells less when source and target sphere overlap, and becomes linear when either sphere contains the center of the other
 * (this is to avoid disturbing zoom-out when the source and target are near). */
function swellingRadiusInterpolationSmart(r0: number, r1: number, dist: number, t: number): number {
    const overlapFactor = relativeSphereOverlap(r0, r1, dist);
    if (overlapFactor <= 0) return swellingRadiusInterpolationCubic(r0, r1, dist, t); // spheres not overlapping
    if (overlapFactor >= 1) return lerp(r0, r1, t); // either sphere contains the center of the other
    return lerp(swellingRadiusInterpolationCubic(r0, r1, dist, t), lerp(r0, r1, t) + (1 - overlapFactor), overlapFactor);
}
/** Arbitrary measure of how much two spheres overlap (>0 when spheres do not overlap, >=1 when at least of the spheres contains the center of the other) */
function relativeSphereOverlap(r0: number, r1: number, dist: number): number {
    const overlap = r0 + r1 - dist;
    if (r0 === 0 || r1 === 0) {
        return overlap >= 0 ? Infinity : -Infinity;
    }
    return overlap / Math.min(r0, r1);
}
/** Auxiliary cubic function that goes from y(0)=0 to y(1)=1.
 * When alpha=1, it is a curve with inflection point in 0 and stationary point in 1.
 * When alpha=0, it becomes a linear function. */
function niceCubic(x: number, alpha: number = 1) {
    return (1 + 0.5 * alpha) * x - 0.5 * alpha * x ** 3;
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

/** This adjustment to transition quotient (0-1) ensures that transition speed relative to radius is constant during the transition.
 * Only to be applied to position and radius interpolation, not needed for angles.
 * This function assumes linear interpolation of radius. For other interpolation methods, more complicated formula will be needed. */
function constRelSpeedQuotientAdj_linRadIntp(t: number, r0: number, r1: number): number {
    if (Math.abs((r0 - r1) / (r0 + r1)) <= 1e-3) {
        // Special case for r0===r1
        return t;
    }
    return r0 / (r1 - r0) * ((r1 / r0) ** t - 1); // = a / b * ((1 + b / a) ** t - 1), where a = r0, b = r1 - r0
}
