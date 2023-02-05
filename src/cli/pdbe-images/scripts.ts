import { Mat3 } from '../../mol-math/linear-algebra';
import { ModelSymmetry } from '../../mol-model-formats/structure/property/symmetry';
import { PluginContext } from '../../mol-plugin/context';
import { StateObjectSelector } from '../../mol-state';

import { DomainRecord, PDBeAPI, SiftsSource } from './api';
import { cameraSetRotation, Disposable, objForEachAsync, ROTATION_MATRICES, warn } from './helpers';
import { structureLayingRotation } from './orient';
import { DomainRanges, ImageGeneratorBase, StructureObjSelector } from './script-helpers';
import { countChainResidues, countDomains, getChainInfo, selectBestChainForDomains, sortDomainsByChain, sortDomainsByEntity } from './sifts-domains';
import using = Disposable.using;


export class ImageGenerator extends ImageGeneratorBase {
    constructor(
        plugin: PluginContext,
        public readonly saveFunction: (name: string) => any,
        public readonly api: PDBeAPI
    ) {
        super(plugin);
    }

    async processUrl(url: string, pdbId: string) {
        console.log('url:', url);
        await using(this.makeModel(url), async model => {
            await this.processModel(model, pdbId);
        });
    }

    private async processModel(model: StateObjectSelector, pdbId: string) {
        const promises = {
            prefferedAssembly: this.api.getPrefferedAssembly(pdbId), // TODO allow API-less mode?
            siftsMappings: this.api.getSiftsMappings(pdbId),
        }; // allow async fetching in the meantime

        await using(this.makeStructure(model, {}), async structure => {
            const rotation = structureLayingRotation(structure.data!);

            await using(this.makeVisuals(structure), async visuals => {
                this.zoomAll();
                await this.save3sides('entry-by-chain', rotation);

                await this.setColorByEntity(Object.values(visuals));
                await this.save3sides('entry-by-entity', rotation);
            });

            await this.processDomains(structure, await promises.siftsMappings);
        });

        const assemblies = ModelSymmetry.Provider.get(model.data!)?.assemblies ?? [];
        const prefferedAssembly = await promises.prefferedAssembly; // TODO allow local API and/or API-less mode?

        for (const ass of assemblies) {
            await using(this.makeStructure(model, { type: { name: 'assembly', params: { id: ass.id } } }), async structure => {
                const rotation = structureLayingRotation(structure.data!);

                await using(this.makeVisuals(structure), async visuals => {
                    this.zoomAll();
                    await this.save3sides(`assembly-${ass.id}-by-chain`, rotation);

                    await this.setColorByEntity(Object.values(visuals));
                    await this.save3sides(`assembly-${ass.id}-by-entity`, rotation);

                    if (ass.id === prefferedAssembly.assembly_id) {
                        await this.setFaded(Object.values(visuals));
                        await using(this.makeEntities(structure), async entities => {
                            await using(this.makeVisualsMulti(entities), async entityVisuals => {
                                for (const entityId in entities) {
                                    await this.setHighlight(Object.values(entityVisuals[entityId]));
                                    this.setVisible(entities[entityId], false);
                                }
                                for (const entityId in entities) {
                                    const isEmpty = Object.values(entityVisuals[entityId]).every(vis => !vis); // this will apply for water entity
                                    if (isEmpty) continue;
                                    this.setVisible(entities[entityId], true);
                                    await this.save3sides(`preferred-assembly-${ass.id}-highlight-${entityId}`, rotation);
                                    this.setVisible(entities[entityId], false);
                                }
                            });
                        });
                    }
                });
            });
        }
        await this.saveFunction('disposed');
    }


    private async processDomains(structure: StructureObjSelector, domains: { [source in SiftsSource]: { [family: string]: DomainRecord[] } }) {
        const chainInfo = getChainInfo(structure.data!.model);
        const chainCoverages = countChainResidues(structure.data!.model);
        console.log('chain info:', getChainInfo(structure.data!.model));
        console.log('chain lengths:', countChainResidues(structure.data!.model));

        const allDomains = sortDomainsByEntity(domains);
        const selectedDomains = selectBestChainForDomains(allDomains, chainCoverages);
        const allDomainCounts = countDomains(allDomains);
        const selectedDomainCounts = countDomains(selectedDomains);
        const selectedDomainsByChain = sortDomainsByChain(selectedDomains);

        await objForEachAsync(selectedDomainsByChain, async (chainId, chainDomains) => {
            await using(this.makeAuthChain(structure, chainInfo[chainId].authChainId, chainId), async chain => {
                if (!chain) return;
                const rotation = structureLayingRotation(chain.data!);
                const entityId = chainInfo[chainId].entityId;
                await using(this.makeVisuals(chain), async visuals => {
                    this.zoomAll();
                    await this.setFaded(Object.values(visuals));

                    await objForEachAsync(chainDomains, async (source, sourceDomains) => {
                        await objForEachAsync(sourceDomains, async (family, familyDomains) => {
                            const domDefs: { [label: string]: DomainRanges } = {};
                            for (const dom of familyDomains) {
                                const label = `Domain ${dom.id} (${source} ${family})`;
                                domDefs[label] = { chainId, ranges: dom.chunks.map(c => [c.CIFstart, c.CIFend] as [number, number]) };
                            }

                            await using(this.makeDomains(structure, domDefs), async domainStructure => {
                                if (!domainStructure) return;
                                await using(this.makeVisualsMulti(domainStructure), async domainVisuals => {
                                    const totalCopies = allDomainCounts[source][family][entityId];
                                    const shownCopies = selectedDomainCounts[source][family][entityId];
                                    console.log(`Total ${totalCopies} copies of ${source} ${family} in entity ${entityId}, showing ${shownCopies} in chain ${chainId}`); // TODO auth
                                    await this.save3sides(`chain-${chainId}-domains-${family}`, rotation);
                                    // TODO color domains differently
                                });
                            });
                        });
                    });
                });
            });
        });
    }


    private async save3sides(name: string, rotation: Mat3 = Mat3.identity()) {
        this.adjustCamera(s => cameraSetRotation(s, rotation));
        await this.saveFunction(name + '-front');
        // DEBUG, TODO uncomment these
        // this.adjustCamera(s => cameraSetRotation(s, Mat3.mul(Mat3(), ROTATION_MATRICES.rotY270, rotation)));
        // await this.saveFunction(name + '-side');
        // this.adjustCamera(s => cameraSetRotation(s, Mat3.mul(Mat3(), ROTATION_MATRICES.rotX90, rotation)));
        // await this.saveFunction(name + '-top');
    }

    private async save1side(name: string, rotation: Mat3 = Mat3.identity()) {
        this.adjustCamera(s => cameraSetRotation(s, rotation));
        await this.saveFunction(name);
    }


}
