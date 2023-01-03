
// Build: npm run build-tsc
// Run:   node lib/commonjs/cli/pdbe-images

import { ArgumentParser } from 'argparse';
import { Download, RawData } from '../../mol-plugin-state/transforms/data';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginContext } from '../../mol-plugin/context';
// import { ViewportScreenshotHelper } from '../../mol-plugin/util/viewport-screenshot';
// import { PLUGIN_VERSION, PLUGIN_VERSION_DATE } from '../../mol-plugin/version';

import * as fs from 'fs';
import * as puppeteer from 'puppeteer';
import { sleep } from '../../mol-util/sleep';
import { download } from '../../mol-util/download';


interface Args {
    input: string,
}

function parseArguments(): Args {
    const parser = new ArgumentParser({ description: 'CLI tool for generating PDBe images of macromolecular models' });
    parser.add_argument('input', { help: 'Input mmCIF file' });
    const args = parser.parse_args();
    return { ...args };
}

async function tryPuppeteer() {
    // const browser = await puppeteer.launch({
    //     // executablePath: 'chromium',
    //     headless: false,
    //     args: [
    //         '--headless',
    //         '--hide-scrollbars',
    //         '--mute-audio',
    //         // '--enable-webgl',
    //         '--use-gl=egl',
    //     ],
    // });
    const browser = await puppeteer.launch({
        // executablePath: 'chromium',
        headless: true,
        args: [
            '--use-gl=egl'
        ],
        defaultViewport: { width: 1600, height: 1200 },
    });
    const page = await browser.newPage();

    page.on('console', message => console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`));
    // page.on('pageerror', ({ message }) => console.log(message));
    // page.on('response', response => console.log(`${response.status()} ${response.url()}`));
    // page.on('requestfailed', request => console.log(`${request.failure()?.errorText} ${request.url()}`));

    await page.goto('https://molstar.org/viewer/?snapshot-url=https%3A%2F%2Fmolstar.org%2Fdemos%2Fstates%2Fcytochromes.molx&snapshot-url-type=molx');
    // const contentHtml = fs.readFileSync('/home/adam/Workspace/CellStar/molstar/build/viewer/index.html', 'utf8');
    // console.log(contentHtml);
    // await page.setContent(contentHtml);
    // await page.goto('file:///home/adam/Workspace/CellStar/molstar/build/viewer/index.html');
    // await page.goto('http://localhost:4000/build/viewer/index.html'); // requires `http-server -p 4000` to be run on background

    if (true) await sleep(5000);
    // await page.goto('http://example.com');

    console.log('page:', page);
    const content = await page.content();
    if (false) console.log('content:', content);
    await page.screenshot({ path: '/home/adam/test.png' });
    let x = 5;
    let y = await page.evaluate(x_ => { return x_ ** 2; }, x);
    console.log('x', x);
    console.log('y', y);
    // await page.exposeFunction('download', download);
    // await page.evaluate(() => (window as any).download('blablablabla', '/home/adam/test.txt'));
    [download, fs];
    await browser.close();
}

async function main(args: Args) {
    console.log(args);
    const ctx = new PluginContext({ behaviors: [] });
    await tryPuppeteer();
    // console.log(document);
    // console.log(ctx);
    // new ViewportScreenshotHelper(ctx).download('/home/adam/blabla.png');
    Download;
    // const state = ctx.build().toRoot().apply(Download, { url: 'https://www.ebi.ac.uk/pdbe/entry-files/download/1tqn.bcif', isBinary: true });//.commit();
    const state = await ctx.build().toRoot().apply(RawData, { data: 'blabladata' }).commit();
    if (false) console.log(state);
    await PluginCommands.State.Snapshots.DownloadToFile(ctx, { name: 'ahoj', type: 'json' });
}


main(parseArguments()).then(() => console.log('OK'));
