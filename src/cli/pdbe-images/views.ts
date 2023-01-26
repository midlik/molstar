type ModelType = 'pdb' | 'alphafold'
// 1 type can have multiple instances (e.g. individual PDB IDs)


type StructureType = 'entry' | 'assembly' | 'preferred_assembly' | 'entity' | 'ligand_environment'
// 1 type can have multiple instances (e.g. 2 assemblies, 4 entities...)


type ComponentsType = 'polymer_ligand' | 'selected_polymer' | 'selected_ligand' | 'selected_domains'
// 1 type can have multiple instances (e.g. 2 selectable entities or domains)
// polymer_ligand could be just a special case of selected_polymer_ligand


type VisualsType = 'all_by_chain' | 'all_by_entity' | 'all_by_b_factor' | 'all_by_validation' | 'highlight_entity' | 'highlight_domains'
// 1 type can only have 1 instance, I think
// difference between highlight_entity and highlight_domains: highlight_domains can have multiple domains highlighted in different colors
// again, highlight_entity could be just a special case of highlight_domains


type CameraType = 'front' | 'side' | 'top'
// 1 type can only have 1 instance, I think

// what about trajectories (multiple models in PDB entry?)



type DefinitionLayer = keyof DefinitionLayerTypes

type DefinitionLayerTypes = {
    'model': ModelType,
    'structure': StructureType,
    'components': ComponentsType,
    'visuals': VisualsType,
    'camera': CameraType,
}

const lay: DefinitionLayer = 'components'

const x: DefinitionLayerTypes['model'] = 'pdb'

