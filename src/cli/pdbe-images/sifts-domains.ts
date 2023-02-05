/** These are some insanely-looking functions which reorganize/filter SIFTS domain to fit our weird requirements:
 * For each combination of source-family-entity we want the total number of domain instances but then only select one chain and visualize its domains.
 * The visualization should be done chain by chain, so we can reuse the chain visual. 
 */


import { Model, Structure } from '../../mol-model/structure';
import { DomainRecord } from './api';
import { objForEach } from './helpers';

/** Reorganize domains from source-family to source-family-entity */
export function sortDomainsByEntity(domains: { [source: string]: { [family: string]: DomainRecord[] } }) {
    const result = {} as { [source: string]: { [family: string]: { [entityId: string]: DomainRecord[] } } };
    objForEach(domains, (source, sourceDomains) => {
        objForEach(sourceDomains, (family, familyDomains) => {
            for (const domain of familyDomains) {
                const entityId = domain.chunks[0].entity_id;
                (((result[source] ??= {})[family] ??= {})[entityId] ??= []).push(domain);
            }
        });
    });
    return result;
}

/** For each combination of source-family-entity, select only domains from one chain (the longest chain).
 * TODO: implement really taking the longest chain, not just the first
 */
export function selectBestChainForDomains(domains: { [source: string]: { [family: string]: { [entityId: string]: DomainRecord[] } } }, chainCoverages?: { [chainId: string]: number }) {
    const result = {} as { [source: string]: { [family: string]: { [entityId: string]: DomainRecord[] } } };
    objForEach(domains, (source, sourceDomains) => {
        objForEach(sourceDomains, (family, familyDomains) => {
            objForEach(familyDomains, (entityId, entityDomains) => {
                const chainIds = entityDomains.map(dom => dom.chunks[0].asymID);
                const uniqueChainIds = Array.from(new Set(chainIds));
                let selectedChain = uniqueChainIds[0];
                if (chainCoverages) {
                    for (const other of uniqueChainIds) {
                        if (chainCoverages[other] > chainCoverages[selectedChain]) selectedChain = other;
                    }
                }
                const selectedDomains = entityDomains.filter(dom => dom.chunks[0].asymID === selectedChain);
                ((result[source] ??= {})[family] ??= {})[entityId] = selectedDomains;
            });
        });
    });
    return result;
}

/** Reorganize domains from source-family-entity to chain-source-family */
export function sortDomainsByChain(domains: { [source: string]: { [family: string]: { [entityId: string]: DomainRecord[] } } }) {
    const result = {} as { [chainId: string]: { [source: string]: { [family: string]: DomainRecord[] } } };
    objForEach(domains, (source, sourceDomains) => {
        objForEach(sourceDomains, (family, familyDomains) => {
            objForEach(familyDomains, (entityId, entityDomains) => {
                for (const dom of entityDomains) {
                    const chainId = dom.chunks[0].asymID;
                    (((result[chainId] ??= {})[source] ??= {})[family] ??= []).push(dom);
                }
            });
        });
    });
    return result;
}

/** For each combination of source-family-entity, count the number of domains */
export function countDomains(domains: { [source: string]: { [family: string]: { [entityId: string]: DomainRecord[] } } }) {
    const result = {} as { [source: string]: { [family: string]: { [entityId: string]: number } } };
    objForEach(domains, (source, sourceDomains) => {
        objForEach(sourceDomains, (family, familyDomains) => {
            objForEach(familyDomains, (entityId, entityDomains) => {
                ((result[source] ??= {})[family] ??= {})[entityId] = entityDomains.length;
            });
        });
    });
    return result;
}

export function countChainResidues(model: Model) {
    const counts = {} as { [chainId: string]: number };
    const nRes = model.atomicHierarchy.residueAtomSegments.count;
    for (let iRes = 0; iRes < nRes; iRes++) {
        const iAtom = model.atomicHierarchy.residueAtomSegments.offsets[iRes]; // first atom in the residue
        const iChain = model.atomicHierarchy.chainAtomSegments.index[iAtom];
        const chainId = model.atomicHierarchy.chains.label_asym_id.value(iChain);
        counts[chainId] ??= 0;
        counts[chainId] += 1;
    }
    return counts;
}

export function getChainInfo(model: Model) {
    const result = {} as { [chainId: string]: { authChainId: string, entityId: string } };
    const chains = model.atomicHierarchy.chains;
    const nChains = chains._rowCount;
    for (let iChain = 0; iChain < nChains; iChain++) {
        const chainId = chains.label_asym_id.value(iChain);
        const authChainId = chains.auth_asym_id.value(iChain);
        const entityId = chains.label_entity_id.value(iChain);
        if (result[chainId]) throw new Error('AssertionError');
        result[chainId] = { authChainId, entityId };
    }
    return result;
}