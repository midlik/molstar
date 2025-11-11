import { Sphere3D } from '../../mol-math/geometry';
import { Vec3 } from '../../mol-math/linear-algebra';
import { Structure, StructureElement, StructureProperties, Unit } from '../../mol-model/structure';
import { StructureLookup3D } from '../../mol-model/structure/structure/util/lookup3d';
import { PluginContext } from '../../mol-plugin/context';
import { Color } from '../../mol-util/color';
import { ColorLists } from '../../mol-util/color/lists';
import { loadMVS } from './load';
import { MVSData } from './mvs-data';
import { createMVSBuilder, Root } from './tree/mvs/mvs-builder';
import { ComponentExpressionT, HexColorT } from './tree/mvs/param-types';


function buildTrajectoryMvs(builder: Root, params: { pdbId: string }) {
    return builder
        // .download({ url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${params.pdbId}.bcif` })
        .download({ url: `/tmp/${params.pdbId}.bcif` })
        .parse({ format: 'bcif' });
}
function buildStructMvs(builder: Root, params: { pdbId: string }) {
    return buildTrajectoryMvs(builder, params).modelStructure();
}

const colors = ColorLists['many-distinct'].list.map(Color.fromColorListEntry);

/** Demonstration of usage of MVS builder */
export async function complexViewDemo(plugin: PluginContext, { pdbId = '1hda' }: { pdbId?: string }) {
    let builder = createMVSBuilder();
    buildStructMvs(builder, { pdbId });
    const structMVS = builder.getState();
    await loadMVS(plugin, structMVS);

    const structRef = plugin.managers.structure.hierarchy.current.structures[0];
    const structData = structRef.cell.obj?.data;
    if (!structData) throw new Error('No structure data.');

    const components = getComponentRecords(structData);
    console.log(components)
    const openingSnapshot = makeSnapshot(pdbId, 'open', { components, globalSphere: structData.boundary.sphere });
    const closingSnapshot = makeSnapshot(pdbId, 'close', { components, globalSphere: structData.boundary.sphere });
    const finalMVS = MVSData.createMultistate([openingSnapshot, closingSnapshot]);
    await loadMVS(plugin, finalMVS);
    return finalMVS;
}

function makeSnapshot(pdbId: string, animationDirection: 'open' | 'close', data: { components: ComponentRecords, globalSphere: Sphere3D }) {
    const { center: globalCenter, radius: globalRadius } = data.globalSphere;

    const builder = createMVSBuilder();
    const traj = buildTrajectoryMvs(builder, { pdbId });

    const translations: Record<string, Vec3> = {};

    const anim = builder.animation({ include_camera: true });

    const polymerColors: Record<string, Color> = {};
    let polymerColorsCounter = 0;

    const durations = {
        start: 1000,
        transition: 4000,
        linger: 1000,
    };
    for (const record of Object.values(data.components)) {
        const translation = Vec3.sub(Vec3(), record.center, globalCenter);
        // Scale:
        Vec3.setMagnitude(translation, translation, Vec3.magnitude(translation) + globalRadius);
        translations[record.key] = translation;

        let translationStart = [0, 0, 0] as [number, number, number];
        let translationEnd = translation as number[] as [number, number, number];
        if (animationDirection === 'close') [translationStart, translationEnd] = [translationEnd, translationStart];

        const structureRef = `struct-${record.key}`;
        const transformRef = `transform-${record.key}`;
        const struct = traj
            .modelStructure({ ref: structureRef })
            .transform({
                translation: translationStart,
                ref: transformRef,
            });

        anim.interpolate({
            target_ref: transformRef,
            property: 'translation',
            kind: 'vec3',
            start: translationStart,
            end: translationEnd,
            start_ms: durations.start,
            duration_ms: durations.transition,
            easing: 'cubic-in-out',
        });

        const annotUri = `data:text/plain,
        data_annotations
        loop_
        _annotations.instance_id
        _annotations.label_asym_id
        _annotations.label_seq_id
        _annotations.atom_id
        _annotations.color 
        ` + record.interfaceResidues.map(s => `${s.instance_id ?? '.'} ${s.label_asym_id ?? '.'} ${s.label_seq_id ?? '.'} ${s.atom_id ?? '.'} lightgreen`).join('\n');

        // const polymerColor = '#1b9e77';
        const entityColor = polymerColors[record.polymerEntityId] ??= (colors[(polymerColorsCounter++) % colors.length]);
        const polymerColor = Color.toHexStyle(entityColor) as HexColorT;
        const interfaceColor = Color.toHexStyle(Color.lighten(entityColor, 2)) as HexColorT;
        // const ligandColor = '#e06633';
        const ligandColor = '#ffffff';
        const ligandInterfaceColor = Color.toHexStyle(Color.lighten(Color.fromHexStyle(ligandColor), 2)) as HexColorT;
        struct
            .component({ selector: { label_asym_id: record.polymerLabelChain } })
            .representation({ type: 'surface' }) // TODO gaussian surface?
            .color({ color: polymerColor })
            .color({ color: interfaceColor, selector: record.interfaceResidues });
        // TODO to use `color` with per-atom selections, implement caching in MultilayerColorTheme, otherwise performance will suck
        // TODO to use `color_from_uri`, set preferSmoothing: false in MVSAnnotationColorTheme, otherwise performance will suck
        // .colorFromUri({
        //     uri: annotUri,
        //     format: 'cif',
        //     schema: 'all_atomic',
        // });

        struct
            .component({ selector: record.ligandLabelChains.map(label_asym_id => ({ label_asym_id })) })
            .representation({ type: 'surface' }) // TODO gaussian surface?
            .color({ color: ligandColor });
        // struct.primitives({ opacity: 0.5 }).sphere({ center: { label_asym_id: record.polymerLabelChain } });
    }
    // const prims = builder.primitives({ color: '#808080' });
    // prims.tube({
    //     start: { structure_ref: `struct-A:1_555`, expression_schema: 'all_atomic', expressions: [{ label_asym_id: 'A' }] },
    //     end: { structure_ref: `struct-B:1_555`, expression_schema: 'all_atomic', expressions: [{ label_asym_id: 'B' }] },
    //     radius: 0.5,
    // });
    // TODO - primitives in root should reference transformed structure coordinates

    const maxTranslation = Math.max(...Object.values(translations).map(Vec3.magnitude));

    const dir = Vec3.create(0, 0, -1);
    const up = Vec3.create(0, 1, 0);
    // TODO compute final camera from translated chain bounding spheres?
    builder.camera({
        ...getFocusedCamera(globalCenter, globalRadius + maxTranslation, dir, up),
        ref: 'camera',
    });

    return builder.getSnapshot({ key: `${pdbId}-${animationDirection}`, linger_duration_ms: durations.start + durations.transition + durations.linger });
}

function getFocusedCamera(center: Vec3, radius: number, direction: Vec3 = Vec3.create(0, 0, -1), up: Vec3 = Vec3.create(0, 1, 0)) {
    let offset = Vec3.setMagnitude(Vec3(), direction, 2 * radius);
    return {
        target: center as number[] as [number, number, number],
        position: Vec3.sub(offset, center, offset) as number[] as [number, number, number],
        up: up as number[] as [number, number, number],
    }
}

interface ComponentRecord {
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
interface ComponentRecords {
    [componentKey: string]: ComponentRecord,
}

const InterfaceDefinitionRadius = 5;

function unitKey(loc: StructureElement.Location): string | undefined {
    const entityType = StructureProperties.entity.type(loc);
    if (entityType === 'water') return undefined;
    const authChainId = StructureProperties.chain.auth_asym_id(loc);
    const instanceId = StructureProperties.unit.instance_id(loc);
    return `${authChainId}:${instanceId}`;
}

function getComponentRecords(struct: Structure): ComponentRecords {
    // TODO solve this for assemblies (multiple copies of one polymer chain!)
    // TODO solve this for 3d11 (key has no polymer units)
    const structureLookup = struct.lookup3d;
    const out: ComponentRecords = {};
    const loc: StructureElement.Location = StructureElement.Location.create(struct);
    for (const unit of struct.units) {
        loc.unit = unit;
        loc.element = unit.elements[0];
        const authChainId = StructureProperties.chain.auth_asym_id(loc);
        const labelChainId = StructureProperties.chain.label_asym_id(loc);
        const entityId = StructureProperties.chain.label_entity_id(loc);
        const entityType = StructureProperties.entity.type(loc);

        const key = unitKey(loc);
        if (key === undefined) continue;

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
        // selectResiduesInUnit(struct, unit, loc => StructureProperties.residue.label_seq_id(loc) % 2 === 0, record.interfaceResidues);
        // selectAtomsInUnit(struct, unit, loc => StructureProperties.atom.id(loc) % 2 === 0, record.interfaceResidues);
        // selectResiduesInUnit(struct, unit, loc => isInterface(loc, structureLookup, InterfaceDefinitionRadius), record.interfaceResidues);
        selectAtomsInUnit(struct, unit, loc => isInterface(loc, structureLookup, InterfaceDefinitionRadius), record.interfaceResidues); // TODO store separately for polymer and ligands
    }
    for (const rec of Object.values(out)) {
        if (!rec.polymerEntityId) throw new Error(`AssertionError: key ${rec.key} has no polymer units`);
    }
    return out;
}

function selectResiduesInUnit(struct: Structure, unit: Unit, predicate: (loc: StructureElement.Location) => boolean, out: ComponentExpressionT[]) {
    const loc: StructureElement.Location = StructureElement.Location.create(struct, unit, unit.elements[0]);
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

function selectAtomsInUnit(struct: Structure, unit: Unit, predicate: (loc: StructureElement.Location) => boolean, out: ComponentExpressionT[]) {
    const loc: StructureElement.Location = StructureElement.Location.create(struct, unit, unit.elements[0]);
    const instance_id = StructureProperties.unit.instance_id(loc);
    for (let i = 0; i < unit.elements.length; i++) {
        loc.element = unit.elements[i];
        const matches = predicate(loc);
        if (!matches) continue;
        const atom_id = StructureProperties.atom.id(loc);
        out.push({ instance_id, atom_id });
    }
    return out;
}

const _seenUnits = new Set<number>();
const _otherLoc = StructureElement.Location.create();

function isInterface(loc: StructureElement.Location, structureLookup: StructureLookup3D, radius: number): boolean {
    const x = StructureProperties.atom.x(loc);
    const y = StructureProperties.atom.y(loc);
    const z = StructureProperties.atom.z(loc);
    const surrounding = structureLookup.find(x, y, z, radius);
    _seenUnits.clear();
    _otherLoc.structure = loc.structure;
    const thisUnitKey = unitKey(loc);
    return surrounding.units.slice(0, surrounding.count).some((unit: Unit) => {
        if (_seenUnits.has(unit.id)) return false;
        _seenUnits.add(unit.id);
        if (unit.id === loc.unit.id) return false;
        _otherLoc.unit = unit;
        _otherLoc.element = unit.elements[0];
        const otherUnitKey = unitKey(_otherLoc);
        return otherUnitKey !== undefined && otherUnitKey !== thisUnitKey;
    });
}
