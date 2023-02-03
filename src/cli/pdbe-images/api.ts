import { warn } from './helpers';

export class PDBeAPI {
    // TODO implement caching

    constructor(public readonly baseUrl: string = 'https://www.ebi.ac.uk/pdbe/api') { }

    private async get(url: string) {
        const response = await fetch(url); // TODO don't use fetch
        if (!response.ok) throw new Error(`API call failed with code ${response.status} (${url})`);
        const text = await response.text();
        return JSON.parse(text);
    }
    async getAssemblies(pdbId: string): Promise<AssemblyRecord[]> {
        const url = `${this.baseUrl}/pdb/entry/summary/${pdbId}`;
        const json = await this.get(url);
        const assemblies = [];
        for (const record of json[pdbId] ?? []) {
            for (const assembly of record.assemblies) {
                assemblies.push(assembly);
            }
        }
        return assemblies;
    }
    async getPrefferedAssembly(pdbId: string): Promise<AssemblyRecord> {
        const assemblies = await this.getAssemblies(pdbId);
        if (assemblies.length === 0) {
            throw new Error(`PDB entry ${pdbId} has no assembly`);
        }
        const preferred = assemblies.filter(ass => ass.preferred);
        if (preferred.length === 0) {
            warn(`PDB entry ${pdbId} has no preferred assembly`);
            return assemblies[0];
        }
        if (preferred.length > 1) {
            warn(`PDB entry ${pdbId} has more than one preferred assembly`);
        }
        return preferred[0];
    }
    async getSiftsMappings(pdbId: string): Promise<{ [source in SiftsSource]: { [family: string]: DomainRecord[] } }> {
        const url = `${this.baseUrl}/mappings/${pdbId}`;
        const json = await this.get(url);
        const entryData = json[pdbId] ?? {};
        const result = {} as { [source in SiftsSource]: { [family: string]: DomainRecord[] } };
        for (const source of SIFTS_SOURCES) {
            result[source] = {};
            const sourceData = entryData[source] ?? {};
            for (const family in sourceData) {
                const mappings = sourceData[family].mappings;
                result[source][family] = PDBeAPI.extractDomainMappings(mappings, source, family);
            }
        }
        return result;
    }
    private static extractDomainMappings(mappings: any[], source: SiftsSource, family: string) {
        const result: { [domainId: string]: DomainRecord } = {};
        let domainCounter = 0;
        for (const mapping of mappings) {
            const domainId = mapping.domain ?? mapping.scop_id ?? `${family}_${++domainCounter}`;
            const existingDomain = result[domainId];
            const chunk: DomainChunkRecord = {
                entity_id: mapping.entity_id,
                asymID: mapping.struct_asym_id,
                chain: mapping.chain_id,
                CIFstart: mapping.start.residue_number,
                CIFend: mapping.end.residue_number,
                segment: existingDomain ? existingDomain.chunks.length + 1 : 1,
            };
            if (chunk.CIFstart > chunk.CIFend) [chunk.CIFstart, chunk.CIFend] = [chunk.CIFend, chunk.CIFstart]; // you never know with the PDBe API
            if (existingDomain) {
                existingDomain.chunks.push(chunk);
            } else {
                result[domainId] = {
                    id: domainId,
                    source: source,
                    family: family,
                    chunks: [chunk],
                };
            }
        }
        return Object.values(result).sort((a, b) => a.id < b.id ? -1 : 1);
    }
}

interface AssemblyRecord {
    /** Usually '1', '2' etc. */
    assembly_id: string,
    /** Usually 'homo' or 'hetero' */
    form: string,
    preferred: boolean,
    /** Usually 'monomer', 'tetramer' etc. */
    name: string,
}

const SIFTS_SOURCES = ['CATH', 'SCOP', 'Pfam'] as const;
export type SiftsSource = typeof SIFTS_SOURCES[number];

export interface DomainRecord {
    id: string,
    source: string
    family: string,
    chunks: DomainChunkRecord[],
}

/** Attribute names same as in the original process, therefore no consistency */
interface DomainChunkRecord {
    entity_id: string,
    /** label_asym_id */
    asymID: string,
    /** auth_asym_id */
    chain: string,
    /** label_seq_id of the first residue */
    CIFstart: number,
    /** label_seq_id of the last residue */
    CIFend: number,
    /** No idea what this was supposed to mean in the original process (probably segment no. from the API before cutting into smaller segments by removing missing residues) */
    segment: number
}

// TODO nucleic domains (see old process)
// TODO if entity-family has more instances, take the one from the best-covered (longest) chain