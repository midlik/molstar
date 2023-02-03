// // Build: npm run build-tsc
// // Run:   node lib/commonjs/cli/pdbe-images 1tqn

import { ArgumentParser } from 'argparse';
import fs from 'fs';
import path from 'path';

import { defaultCanvas3DParams, defaultWebGLAttributes, ImageRendererOptions, STYLIZED_POSTPROCESSING } from '../../mol-canvas3d/renderer';
import { HeadlessPluginContext } from '../../mol-plugin/headless-plugin-context';
import { DefaultPluginSpec } from '../../mol-plugin/spec';
import { PDBeAPI } from './api';

import { NaughtySaver } from './helpers';
import { processUrl } from './scripts';


interface Args {
    pdbid: string,
}

function parseArguments(): Args {
    const parser = new ArgumentParser({ description: 'CLI tool for generating PDBe images of macromolecular models' });
    parser.add_argument('pdbid', { help: 'PDB identifier' });
    const args = parser.parse_args();
    return { ...args };
}


async function tryPlugin(args: Args) {
    const rootPath = '/home/adam/Workspace/PDBeImages/data-new';
    const outDir = path.join(rootPath, 'out', args.pdbid);
    fs.mkdirSync(outDir, { recursive: true });
    console.time('generate');
    for (let i = 0; i < 1; i++) {
        const options: ImageRendererOptions = { canvas: defaultCanvas3DParams() };
        options.canvas!.camera!.manualReset = true;
        const plugin = new HeadlessPluginContext(DefaultPluginSpec(), { width: 800, height: 800 }, options);
        await plugin.init();

        const localUrl = 'file://' + path.join(rootPath, 'in', `${args.pdbid}.bcif`);
        const wwwUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/${args.pdbid}.bcif`;
        const saver = new NaughtySaver(plugin, outDir, wwwUrl);

        const api = new PDBeAPI();
        const ass = await api.getPrefferedAssembly(args.pdbid);
        const doms = await api.getSiftsMappings(args.pdbid);
        console.log('domains:', JSON.stringify(doms, undefined, 4));
        // console.log('preferred:', ass);

        await processUrl(plugin, localUrl, name => saver.save(name), api, args.pdbid);

        // // await loadStructureCustom(plugin, 'file://' + path.join(rootPath, 'in', `${args.pdbid}.bcif`));
        // await loadStructureCustom(plugin, `https://www.ebi.ac.uk/pdbe/entry-files/download/${args.pdbid}.bcif`);
        // // await loadStructureCustom(plugin, path.join(rootPath, 'in', `2nnj.bcif`));
        // await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}.png`));
        // await plugin.saveImage(path.join(rootPath, 'out', `out.png`)); // debug
        // // await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}.jpg`));
        // // await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-stylized.jpg`), { width: 1000, height: 750 }, STYLIZED_POSTPROCESSING, undefined, 20);
        // await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-stylized.png`), undefined, STYLIZED_POSTPROCESSING);
        // // await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-big.png`), { width: 2000, height: 1600 });
        // await plugin.saveStateSnapshot(path.join(rootPath, 'out', `${args.pdbid}.molj`));

        // await plugin.clear();
        // // await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-2.png`));
        // // await plugin.saveStateSnapshot(path.join(rootPath, 'out', `${args.pdbid}-2.molj`));

        // // await loadStructureCustom(plugin, 'file://' + path.join(rootPath, 'in', `${args.pdbid}.bcif`));
        // // await loadStructureCustom(plugin, `https://www.ebi.ac.uk/pdbe/entry-files/download/${args.pdbid}.bcif`);
        // // await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-3.png`));
        // // await plugin.saveStateSnapshot(path.join(rootPath, 'out', `${args.pdbid}-3.molj`));

        plugin.dispose();
    }
    console.timeEnd('generate');
}


async function main() {
    const args = parseArguments();
    console.log(args);
    try {
        await tryPlugin(args);
        console.log('OK');
    } catch (ex) {
        console.log('NOK');
        throw ex;
    }
    return;
}

main();
