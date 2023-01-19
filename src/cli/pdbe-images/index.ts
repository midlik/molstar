// // Build: npm run build-tsc
// // Run:   node lib/commonjs/cli/pdbe-images 1tqn

import { ArgumentParser } from 'argparse';
import path from 'path';

import { DefaultPluginSpec } from '../../mol-plugin/spec';

import { HeadlessPluginContext } from './headless-plugin-context';
import { STYLIZED_POSTPROCESSING } from './renderer';
import { loadStructureCustom } from './scripting/scripts';


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
    // https://www.ebi.ac.uk/pdbe/entry-files/download/2nnj.bcif
    const rootPath = '/home/adam/Workspace/PDBeImages/data-new';
    path.join(rootPath, `/home/adam/${args.pdbid}.bcif`);
    console.time('generate');
    for (let i = 0; i < 1; i++) {
        const plugin = new HeadlessPluginContext(DefaultPluginSpec(), { width: 800, height: 800 });
        await plugin.init();

        // await loadStructureCustom(plugin, 'file://' + path.join(rootPath, 'in', `${args.pdbid}.bcif`));
        await loadStructureCustom(plugin, `https://www.ebi.ac.uk/pdbe/entry-files/download/${args.pdbid}.bcif`);
        // await loadStructureCustom(plugin, path.join(rootPath, 'in', `2nnj.bcif`));
        await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-1.png`));
        await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-1-stylized.png`), undefined, STYLIZED_POSTPROCESSING);
        await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-1-big.png`), { width: 2000, height: 1600 });
        await plugin.saveStateSnapshot(path.join(rootPath, 'out', `${args.pdbid}-1.molj`));

        await plugin.clear();
        await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-2.png`));
        await plugin.saveStateSnapshot(path.join(rootPath, 'out', `${args.pdbid}-2.molj`));

        await loadStructureCustom(plugin, 'file://' + path.join(rootPath, 'in', `${args.pdbid}.bcif`));
        // await loadStructureCustom(plugin, `https://www.ebi.ac.uk/pdbe/entry-files/download/${args.pdbid}.bcif`);
        await plugin.saveImage(path.join(rootPath, 'out', `${args.pdbid}-3.png`));
        await plugin.saveStateSnapshot(path.join(rootPath, 'out', `${args.pdbid}-3.molj`));

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
