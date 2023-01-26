import { SortedArray } from '../../mol-data/int';
import { Mat3, Vec3 } from '../../mol-math/linear-algebra';
import { PrincipalAxes } from '../../mol-math/linear-algebra/matrix/principal-axes';
import { Model, Structure } from '../../mol-model/structure';
import { round } from '../../mol-util';


type Coords = {
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    z: ArrayLike<number>
}


export function modelLayingRotation(model: Model): Mat3 {
    // TODO what about ligand and their "order" in the model or multi-chain assemblies?
    // and water!!!
    const coords = {
        x: model.atomicConformation.x,
        y: model.atomicConformation.y,
        z: model.atomicConformation.z,
    };
    const atomElements = model.atomicHierarchy.atoms.type_symbol.toArray() as any as string[];
    const heavyIndices = indicesNotWith(atomElements, 'H');
    const heavyCoords = coordsAt(coords, heavyIndices);
    if (heavyCoords.x.length < 3) {
        return Mat3.identity();
    }
    const flatCoords = flattenCoords(heavyCoords);
    return layingRotation(flatCoords);
    // console.log('nAtoms:', flatCoords.length / 3);
    // console.time('PCA');
    // const axes = PrincipalAxes.calculateMomentsAxes(flatCoords);
    // const normAxes = PrincipalAxes.calculateNormalizedAxes(axes);
    // console.timeEnd('PCA');
    // const R = mat3FromRows(normAxes.dirA, normAxes.dirB, normAxes.dirC);
    // avoidMirrorRotation(R); // The SVD implementation seems to always provide proper rotation, but just to be sure
    // console.time('Flip');
    // const flip = canonicalFlip(flatCoords, R, axes.origin);
    // Mat3.mul(R, flip, R);
    // console.timeEnd('Flip');
    // const checkFlip = canonicalFlip(flatCoords, R, axes.origin); // debug, TODO remove once tested on a larger dataset
    // if (!Mat3.areEqual(checkFlip, Mat3.identity(), 1e-12)) throw new Error('Needed flip after flipping is not identity');
    // return R;
}

export function structureLayingRotation(structure: Structure): Mat3 {
    const flatCoords = selectMainCoords(structure);
    console.log('n:', flatCoords.length / 3);
    logCoords(flatCoords);
    return layingRotation(flatCoords);
}

function layingRotation(flatCoords: number[]): Mat3 {
    console.log('nAtoms:', flatCoords.length / 3);
    console.time('PCA');
    const axes = PrincipalAxes.calculateMomentsAxes(flatCoords);
    const normAxes = PrincipalAxes.calculateNormalizedAxes(axes);
    console.timeEnd('PCA');
    const R = mat3FromRows(normAxes.dirA, normAxes.dirB, normAxes.dirC);
    avoidMirrorRotation(R); // The SVD implementation seems to always provide proper rotation, but just to be sure
    console.time('Flip');
    const flip = canonicalFlip(flatCoords, R, axes.origin);
    Mat3.mul(R, flip, R);
    console.timeEnd('Flip');
    const checkFlip = canonicalFlip(flatCoords, R, axes.origin); // debug, TODO remove once tested on a larger dataset
    if (!Mat3.areEqual(checkFlip, Mat3.identity(), 1e-12)) throw new Error('Needed flip after flipping is not identity');
    return R;
}

/** Try these selection strategies until having at least `minAtoms` atoms:
 * 1. only "polymer" atoms (e.g. C-alpha and O3')
 * 2. all non-hydrogen atoms with exception of water (HOH)
 * 3. all atoms 
 * Return the coordinates in a flattened array (in triples) */
 function selectMainCoords(struct: Structure, minAtoms: number = 3): number[] {
    // TODO check how unit.polymerElements works for sugars, 6q4r? --> sugars not in polymerElements
    // TODO check how the old process treats non-polymer in orient
    // TODO try on altIds / multiple models (NMR)
    // const atomId = unit.model.atomicHierarchy.atoms.label_atom_id.toArray();
    let coords = selectCACoords(struct);
    if (coords.length >= 3 * minAtoms) return coords;

    coords = selectHeavyCoords(struct);
    if (coords.length >= 3 * minAtoms) return coords;

    coords = selectAllCoords(struct);
    return coords;
}

/** Select coordinates of C-alpha and O3' atoms */
function selectCACoords(struct: Structure): number[] {
    const coords: number[] = [];
    for (const unit of struct.units) {
        // console.log('unit', unit.id);
        // console.log(unit.elements)
        // console.log(unit.polymerElements);
        const { x, y, z } = unit.model.atomicConformation;
        for (let i = 0; i < unit.polymerElements.length; i++) {
            const index = unit.polymerElements[i];
            coords.push(x[index], y[index], z[index]);
        }
    }
    return coords;
}
/** Select coordinates of non-hydrogen atoms, excluding water */
function selectHeavyCoords(struct: Structure): number[] {
    const coords: number[] = [];
    for (const unit of struct.units) {
        const { x, y, z } = unit.model.atomicConformation;
        for (let i = 0; i < unit.elements.length; i++) {
            const index = unit.elements[i];
            const compound = unit.model.atomicHierarchy.atoms.label_comp_id.value(index);
            const element = unit.model.atomicHierarchy.atoms.type_symbol.value(index);
            if (element !== 'H' && compound !== 'HOH') {
                coords.push(x[index], y[index], z[index]);
            }
        }
    }
    return coords;
}
/** Select coordinates of all atoms */
function selectAllCoords(struct: Structure): number[] {
    const coords: number[] = [];
    for (const unit of struct.units) {
        const { x, y, z } = unit.model.atomicConformation;
        for (let i = 0; i < unit.elements.length; i++) {
            const index = unit.elements[i];
            coords.push(x[index], y[index], z[index]);
        }
    }
    return coords;
}

function logCoords(coords: number[]){
    for (let i = 0; i < coords.length; i+=3){
        console.log(round(coords[i], 3), round(coords[i+1], 3), round(coords[i+2], 3));
    }
}

function logStructureInfo(structure: Structure) {
    console.log('structure', structure.label);
    for (const unit of structure.units) {
        // unit.
        console.log('unit', unit.id);
        console.log(unit.elements)
        console.log(unit.polymerElements);
        // TODO check how unit.polymerElements works for sugars, 6q4r? --> sugars not in polymerElements
        // TODO check how the old process treats non-polymer in orient
        // const atomId = unit.model.atomicHierarchy.atoms.label_atom_id.toArray();
        for (let i = 0; i < unit.elements.length; i++) {
            const index = unit.elements[i];
            const atomName = unit.model.atomicHierarchy.atoms.label_atom_id.value(index);
            const resn = unit.model.atomicHierarchy.atoms.label_comp_id.value(index);
            const symbol = unit.model.atomicHierarchy.atoms.type_symbol.value(index);
            console.log('    atom', index, atomName, resn, symbol);
        }
    }
}

/** Return a rotation matrix that should be applied to coords (after being rotated by `rotation`) to ensure a deterministic "canonical" rotation.
 *  One of 4 possible results is selected so that: 
 *    1) starting and ending coordinates tend to be more in front (z > 0), middle more behind (z < 0).
 *    2) starting coordinates tend to be more left-top (x < y), ending more right-bottom (x > y).
 *  Provided `origin` parameter MUST be the mean of the coords, otherwise it will not work! 
 */
function canonicalFlip(flatCoords: number[], rotation: Mat3 = Mat3.identity(), origin: Vec3 = Vec3.zero()): Mat3 {
    const pcaX = Vec3.create(Mat3.getValue(rotation, 0, 0), Mat3.getValue(rotation, 0, 1), Mat3.getValue(rotation, 0, 2));
    const pcaY = Vec3.create(Mat3.getValue(rotation, 1, 0), Mat3.getValue(rotation, 1, 1), Mat3.getValue(rotation, 1, 2));
    const pcaZ = Vec3.create(Mat3.getValue(rotation, 2, 0), Mat3.getValue(rotation, 2, 1), Mat3.getValue(rotation, 2, 2));
    const n = Math.floor(flatCoords.length / 3);
    const v = Vec3();
    let xCum = 0;
    let yCum = 0;
    let zCum = 0;
    const check = Vec3.zero(); // debug, TODO remove once tested on a larger dataset
    for (let i = 0; i < n; i++) {
        Vec3.fromArray(v, flatCoords, 3 * i);
        Vec3.sub(v, v, origin);
        Vec3.add(check, check, v);
        xCum += i * Vec3.dot(v, pcaX);
        yCum += i * Vec3.dot(v, pcaY);
        zCum += veeSlope(i, n) * Vec3.dot(v, pcaZ);
    }
    const wrongFrontBack = zCum < 0;
    const wrongLeftTopRightBottom = wrongFrontBack ? xCum + yCum < 0 : xCum - yCum < 0;
    if (Vec3.dot(check, check) > 1e-6) throw new Error(`Assertion error: Sum of centered coords is not zero: ${check}`);
    if (wrongLeftTopRightBottom && wrongFrontBack) {
        return Mat3.create(-1, 0, 0, 0, 1, 0, 0, 0, -1); // flip around Y (= around X then Z)
    } else if (wrongFrontBack) {
        return Mat3.create(1, 0, 0, 0, -1, 0, 0, 0, -1); // flip around X
    } else if (wrongLeftTopRightBottom) {
        return Mat3.create(-1, 0, 0, 0, -1, 0, 0, 0, 1); // flip around Z
    } else {
        return Mat3.identity();
    }
}

function veeSlope(i: number, n: number) {
    const mid = Math.floor(n / 2);
    if (i < mid) {
        if (n % 2) return mid - i;
        else return mid - i - 1;
    } else {
        return i - mid;
    }
}

function mat3FromRows(row0: Vec3, row1: Vec3, row2: Vec3): Mat3 {
    const m = Mat3();
    Mat3.setValue(m, 0, 0, row0[0]);
    Mat3.setValue(m, 0, 1, row0[1]);
    Mat3.setValue(m, 0, 2, row0[2]);
    Mat3.setValue(m, 1, 0, row1[0]);
    Mat3.setValue(m, 1, 1, row1[1]);
    Mat3.setValue(m, 1, 2, row1[2]);
    Mat3.setValue(m, 2, 0, row2[0]);
    Mat3.setValue(m, 2, 1, row2[1]);
    Mat3.setValue(m, 2, 2, row2[2]);
    return m;
}

/** Check if a rotation matrix includes mirroring and invert Z axis in such case, to ensure a proper rotation (in-place). */
function avoidMirrorRotation(rot: Mat3) {
    if (Mat3.determinant(rot) < 0) {
        Mat3.setValue(rot, 2, 0, -Mat3.getValue(rot, 2, 0));
        Mat3.setValue(rot, 2, 1, -Mat3.getValue(rot, 2, 1));
        Mat3.setValue(rot, 2, 2, -Mat3.getValue(rot, 2, 2));
    }
}

function logMatrix(R: Mat3) {
    console.log(Mat3.getValue(R, 0, 0), Mat3.getValue(R, 0, 1), Mat3.getValue(R, 0, 2));
    console.log(Mat3.getValue(R, 1, 0), Mat3.getValue(R, 1, 1), Mat3.getValue(R, 1, 2));
    console.log(Mat3.getValue(R, 2, 0), Mat3.getValue(R, 2, 1), Mat3.getValue(R, 2, 2));
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
function indicesNotWith<T>(array: ArrayLike<T>, value: T): number[] {
    const indices = [];
    for (let i = 0; i < array.length; i++) {
        if (array[i] !== value) {
            indices.push(i);
        }
    }
    return indices;
}

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
