import * as fs from 'fs';

import { Viewer } from '../../../apps/viewer';
import { PluginUIContext } from '../../../mol-plugin-ui/context';
import { ViewportScreenshotHelper } from '../../../mol-plugin/util/viewport-screenshot';

import { Script } from './types';


export const scripts = {
    /**Blabla */
    s1:
        new Script(
            async (viewer: Viewer, pdbid: string) => {
                // throw new Error('Debug');
                // await sleep(5000);
                console.log('balbalbalbalablab');
                await viewer.loadStructureFromUrl(`https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbid}.bcif`, 'mmcif', true);
                // TODO await/force auto-zoom, before making snapshot!
                const image = await getImage(viewer.plugin, [800, 600]);
                await viewer.loadStructureFromUrl(`https://www.ebi.ac.uk/pdbe/entry-files/download/2nnj.bcif`, 'mmcif', true);
                const image2 = await getImage(viewer.plugin, [800, 600]);
                const molj = getStateSnapshot(viewer.plugin);
                return { molj, image, image2 };
                
            }
        ).withAfter(
            (args, result) => {
                fs.writeFileSync('/home/adam/test-state.molj', result.molj);
                fs.writeFileSync('/home/adam/test-image.png', result.image, 'base64');
                fs.writeFileSync('/home/adam/test-image2.png', result.image2, 'base64');
                return result;
            }
        ),
    /**Blabla again */
    s2: new Script(
        async (viewer: Viewer, s: string) => {

            return s + s;
        },
    ),
};

function getStateSnapshot(plugin: PluginUIContext) {
    return JSON.stringify(plugin.managers.snapshot.getStateSnapshot({ params: {} }), null, 2);
}

async function getImage(plugin: PluginUIContext, resolution: [number, number]) {
    const helper = plugin.helpers.viewportScreenshot ?? new ViewportScreenshotHelper(plugin);
    helper.values.resolution = { name: 'custom', params: { width: resolution[0], height: resolution[1] } };
    const data = await helper.getImageDataUri();
    return data.split(',', 2)[1]; // remove MIME prefix
}
