import * as fs from 'fs';

import { Viewer } from '../../../apps/viewer';
import { Sphere3D } from '../../../mol-math/geometry';
import { Vec3 } from '../../../mol-math/linear-algebra';
import { Download, ParseCif, RawData } from '../../../mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureComponent, StructureFromModel, TrajectoryFromMmCif } from '../../../mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from '../../../mol-plugin-state/transforms/representation';
import { PluginUIContext } from '../../../mol-plugin-ui/context';
import { PluginCommands } from '../../../mol-plugin/commands';
import { PluginContext } from '../../../mol-plugin/context';
import { ViewportScreenshotHelper } from '../../../mol-plugin/util/viewport-screenshot';
import { Color } from '../../../mol-util/color';
import { sleep } from '../../../mol-util/sleep';

import { Script } from './types';


export const scripts = {
    /**Blabla */
    s1:
        new Script(
            async (viewer: Viewer, pdbid: string) => {
                // throw new Error('Debug');
                // await sleep(5000);
                console.log('balbalbalbalablab');
                // await viewer.loadStructureFromUrl(`https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbid}.bcif`, 'mmcif', true);
                // await loadStructureCustom(viewer.plugin, `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbid}.bcif`);
                await loadStructureCustom(viewer.plugin, `file:///home/adam/${pdbid}.bcif`);
                // await sleep(500);
                // TODO await/force auto-zoom, before making snapshot!
                const image = await getImage(viewer.plugin, [800, 800]);
                // await viewer.loadStructureFromUrl(`https://www.ebi.ac.uk/pdbe/entry-files/download/2nnj.bcif`, 'mmcif', true);
                // const image2 = await getImage(viewer.plugin, [800, 800]);
                const molj = getStateSnapshot(viewer.plugin);
                await viewer.plugin.clear();
                return { molj, image };

            }
        ).withAfter(
            (args, result) => {
                fs.writeFileSync('/home/adam/test-state.molj', result.molj);
                fs.writeFileSync('/home/adam/test-image.png', result.image, 'base64');
                // fs.writeFileSync('/home/adam/test-image2.png', result.image2, 'base64');
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

export async function loadStructureCustom(plugin: PluginContext, url: string) {
    const data = fs.readFileSync(url); // DEBUG
    const update = plugin.build();
    const structure = update.toRoot()
        .apply(RawData,  { data: data }) // DEBUG
        // .apply(Download, { url, isBinary: true }) // TODO uncomment
        .apply(ParseCif)
        .apply(TrajectoryFromMmCif)
        .apply(ModelFromTrajectory)
        .apply(StructureFromModel);
    const polymer = structure.apply(StructureComponent, { type: { name: 'static', params: 'polymer' } });
    const ligand = structure.apply(StructureComponent, { type: { name: 'static', params: 'ligand' } });
    polymer.apply(StructureRepresentation3D, {
        type: { name: 'cartoon', params: { alpha: 1 } },
        colorTheme: { name: 'uniform', params: { value: Color.fromNormalizedRgb(0.4, 0.5, 1) } },
    });
    ligand.apply(StructureRepresentation3D, {
        type: { name: 'ball-and-stick', params: { sizeFactor: 1 } },
        colorTheme: { name: 'element-symbol', params: { carbonColor: { name: 'element-symbol', params: {} } } },
        sizeTheme: { name: 'physical', params: {} },
    });
    await update.commit();
    plugin.managers.camera.reset();
    // TODO custom camera position and rotation
    // plugin.managers.camera.focusSphere(Sphere3D.create(Vec3.create(0,10,10), 20));
    plugin.canvas3d?.commit(true); // plugin.commitCanvas
    // await sleep(2000);
}

function getStateSnapshot(plugin: PluginContext) {
    return JSON.stringify(plugin.managers.snapshot.getStateSnapshot({ params: {} }), null, 2);
}

export async function getImage(plugin: PluginContext, resolution: [number, number]) {
    const helper = plugin.helpers.viewportScreenshot ?? new ViewportScreenshotHelper(plugin);
    helper.values.resolution = { name: 'custom', params: { width: resolution[0], height: resolution[1] } };
    helper.values.transparent = true;
    const data = await helper.getImageDataUri();
    return data.split(',', 2)[1]; // remove MIME prefix
}
