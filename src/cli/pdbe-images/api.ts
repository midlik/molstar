import { warn } from "./helpers";

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
        // console.log(url);
        // console.log(json);
        const assemblies = []
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