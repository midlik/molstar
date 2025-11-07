import { dir } from 'console';
import { Vec3 } from '../../mol-math/linear-algebra';
import { Structure, StructureElement, StructureProperties, Unit } from '../../mol-model/structure';
import { PluginContext } from '../../mol-plugin/context';
import { loadMVS } from './load';
import { MVSData } from './mvs-data';
import { createMVSBuilder, Root } from './tree/mvs/mvs-builder';
import { SortedArray } from '../../mol-data/int';
import { ComponentExpressionT } from './tree/mvs/param-types';
import { StructureLookup3D } from '../../mol-model/structure/structure/util/lookup3d';


function buildTrajectoryMvs(builder: Root, params: { pdbId: string }) {
    return builder
        // .download({ url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${params.pdbId}.bcif` })
        .download({ url: `/tmp/${params.pdbId}.bcif` })
        .parse({ format: 'bcif' });
}
function buildStructMvs(builder: Root, params: { pdbId: string }) {
    return buildTrajectoryMvs(builder, params).modelStructure();
}

/** Demonstration of usage of MVS builder */
export async function complexViewDemo(plugin: PluginContext, { pdbId = '1hda' }: { pdbId?: string }) {
    let builder = createMVSBuilder();
    buildStructMvs(builder, { pdbId });
    const structMVS = builder.getState();
    await loadMVS(plugin, structMVS);

    const structRef = plugin.managers.structure.hierarchy.current.structures[0];
    const structData = structRef.cell.obj?.data;
    if (!structData) throw new Error('No structure data.');

    builder = createMVSBuilder();
    const traj = buildTrajectoryMvs(builder, { pdbId });

    const chainRecords = getAuthChainRecords(structData);
    console.log(chainRecords)
    const { center: globalCenter, radius: globalRadius } = structData.boundary.sphere;

    const translations: Record<string, Vec3> = {}

    const anim = builder.animation({ include_camera: true });

    for (const record of Object.values(chainRecords)) {
        const translation = Vec3.sub(Vec3(), record.center, globalCenter);
        Vec3.setMagnitude(translation, translation, Vec3.magnitude(translation) + globalRadius);
        translations[record.key] = translation;

        const transformRef = `transform-${record.key}`;
        const struct = traj
            .modelStructure()
            .transform({
                translation: [0, 0, 0],
                ref: transformRef,
            });

        anim.interpolate({
            target_ref: transformRef,
            property: 'translation',
            kind: 'vec3',
            start: [0, 0, 0],
            end: translation,
            start_ms: 1000,
            duration_ms: 4000,
            alternate_direction: true,
            frequency: 2,
            easing: 'cubic-in-out',
        });

        struct
            .component({ selector: { label_asym_id: record.polymerLabelChain } })
            .representation({ type: 'surface' }) // TODO gaussian surface?
            .color({ color: '#1b9e77' })
            // .color({ color: 'lightgreen', selector: record.interfaceResidues }); // TODO try if color_from_uri will give better performance

        struct
            .component({ selector: record.ligandLabelChains.map(label_asym_id => ({ label_asym_id })) })
            .representation({ type: 'surface' }) // TODO gaussian surface?
            .color({ color: '#E06633' });
    }

    const maxTranslation = Math.max(...Object.values(translations).map(Vec3.magnitude));

    const direction = Vec3.create(0, 0, -1);
    const up = Vec3.create(0, 1, 0);
    // TODO compute final camera from translated chain bounding spheres
    builder.camera({
        ...getFocusedCamera(globalCenter, globalRadius + maxTranslation, direction, up),
        ref: 'camera',
    });
    // anim.interpolate({
    //     target_ref: 'camera',
    //     property: 'position',
    //     kind: 'vec3',
    //     end: getFocusedCamera(globalCenter, globalRadius + maxTranslation, direction, up).position,
    //     start_ms: 2000,
    //     duration_ms: 2000,
    // });

    const snapshot = builder.getSnapshot({ linger_duration_ms: 6000 });
    const finalMVS = MVSData.createMultistate([snapshot]);
    await loadMVS(plugin, finalMVS);
    return finalMVS;

}

function getFocusedCamera(center: Vec3, radius: number, direction: Vec3 = Vec3.create(0, 0, -1), up: Vec3 = Vec3.create(0, 1, 0)) {
    let offset = Vec3.setMagnitude(Vec3(), direction, 2 * radius);
    return {
        target: center as number[] as [number, number, number],
        position: Vec3.sub(offset, center, offset) as number[] as [number, number, number],
        up: up as number[] as [number, number, number],
    }
}

interface ChainRecord {
    key: string,
    authChainId: string,
    polymerEntityId: string,
    polymerLabelChain: string,
    ligandLabelChains: string[],
    center: Vec3,
    /** Number of polymer elements */
    size: number,
    interfaceResidues: ComponentExpressionT[],
}

function getAuthChainRecords(struct: Structure) {
    // TODO solve this for assemblies (multiple copies of one polymer chain!)
    // TODO solve this for 3d11 (key has no polymer units)
    const structureLookup = struct.lookup3d;
    const out: { [authChainId: string]: ChainRecord } = {};
    const loc: StructureElement.Location = StructureElement.Location.create(struct);
    for (const unit of struct.units) {
        loc.unit = unit;
        loc.element = unit.elements[0];
        const authChainId = StructureProperties.chain.auth_asym_id(loc);
        const labelChainId = StructureProperties.chain.label_asym_id(loc);
        const entityId = StructureProperties.chain.label_entity_id(loc);
        const entityType = StructureProperties.entity.type(loc);

        const key = authChainId;

        const record = out[key] ??= {
            key,
            authChainId,
            polymerEntityId: '',
            polymerLabelChain: '',
            ligandLabelChains: [],
            center: Vec3(),
            size: 0,
            interfaceResidues: [],
        };
        if (entityType === 'polymer') {
            if (record.polymerEntityId) throw new Error(`AssertionError: More than one polymer unit with the same key ${key}`);
            record.polymerEntityId = entityId;
            record.polymerLabelChain = labelChainId;
            record.center = unit.boundary.sphere.center; // TODO smarter center selection?
            record.size = unit.elements.length; // TODO measure size other way (n residue, n heavy atoms?)
        } else if (entityType === 'water') {
            // ignore
        } else {
            // other types consider as ligands for now
            record.ligandLabelChains.push(labelChainId);
        }
        // selectResidues(unit, loc => StructureProperties.residue.label_seq_id(loc) % 2 === 0, record.interfaceResidues);
        // selectResidues(unit, loc => isInterface(loc, structureLookup, 0), record.interfaceResidues);
    }
    for (const rec of Object.values(out)) {
        if (!rec.polymerEntityId) throw new Error(`AssertionError: key ${rec.key} has no polymer units`);
    }
    return out;
}

function selectResidues(unit: Unit, predicate: (loc: StructureElement.Location) => boolean, out: ComponentExpressionT[]) {
    const loc: StructureElement.Location = StructureElement.Location.create(undefined, unit);
    let lastSeqId = NaN;
    const instance_id = StructureProperties.unit.instance_id(loc);
    const label_asym_id = StructureProperties.chain.label_asym_id(loc);
    for (let i = 0; i < unit.elements.length; i++) {
        loc.element = unit.elements[i];
        const matches = predicate(loc);
        if (!matches) continue;
        const label_seq_id = StructureProperties.residue.label_seq_id(loc);
        if (label_seq_id === lastSeqId) continue; // avoid duplicates
        lastSeqId = label_seq_id;
        out.push({ instance_id, label_asym_id, label_seq_id });
    }
    return out;
}

// function isInterface(loc: StructureElement.Location, structureLookup: StructureLookup3D, radius: number): boolean {
//     const x = StructureProperties.atom.x(loc);
//     const y = StructureProperties.atom.y(loc);
//     const z = StructureProperties.atom.z(loc);
//     loc.unit.id;
//     const result = structureLookup.findUnitIndices(x, y, z, radius);
//     console.log(`${loc.unit.id}:`, ...result.indices)

//     return true;
// }
