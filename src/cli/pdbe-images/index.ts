
// // Build: npm run build-tsc
// // Run:   node lib/commonjs/cli/pdbe-images x

import { ArgumentParser } from 'argparse';
import * as fs from 'fs';
import * as selenium from 'selenium-webdriver';
import { Options as FirefoxOptions } from 'selenium-webdriver/firefox';

import { Download, RawData } from '../../mol-plugin-state/transforms/data';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginContext } from '../../mol-plugin/context';
import { sleep } from '../../mol-util/sleep';

import { executeScript } from './scripting/master';
import { scripts } from './scripting/scripts';

// import * as puppeteer from 'puppeteer';
// import { download } from '../../mol-util/download';

[selenium, Download, RawData, PluginCommands, PluginContext, fs, sleep, FirefoxOptions, scripts, executeScript]; // avoid unused variable errors


interface Args {
    pdbid: string,
}

function parseArguments(): Args {
    const parser = new ArgumentParser({ description: 'CLI tool for generating PDBe images of macromolecular models' });
    parser.add_argument('pdbid', { help: 'PDB identifier' });
    const args = parser.parse_args();
    return { ...args };
}

// async function tryPuppeteer() {
//     // const browser = await puppeteer.launch({
//     //     // executablePath: 'chromium',
//     //     headless: false,
//     //     args: [
//     //         '--headless',
//     //         '--hide-scrollbars',
//     //         '--mute-audio',
//     //         // '--enable-webgl',
//     //         '--use-gl=egl',
//     //     ],
//     // });
//     const browser = await puppeteer.launch({
//         // executablePath: 'chromium',
//         headless: true,
//         args: [
//             '--use-gl=egl'
//         ],
//         defaultViewport: { width: 1600, height: 1200 },
//     });
//     const page = await browser.newPage();

//     page.on('console', message => console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`));
//     // page.on('pageerror', ({ message }) => console.log(message));
//     // page.on('response', response => console.log(`${response.status()} ${response.url()}`));
//     // page.on('requestfailed', request => console.log(`${request.failure()?.errorText} ${request.url()}`));

//     await page.goto('https://molstar.org/viewer/?snapshot-url=https%3A%2F%2Fmolstar.org%2Fdemos%2Fstates%2Fcytochromes.molx&snapshot-url-type=molx');
//     // const contentHtml = fs.readFileSync('/home/adam/Workspace/CellStar/molstar/build/viewer/index.html', 'utf8');
//     // console.log(contentHtml);
//     // await page.setContent(contentHtml);
//     // await page.goto('file:///home/adam/Workspace/CellStar/molstar/build/viewer/index.html');
//     // await page.goto('http://localhost:4000/build/viewer/index.html'); // requires `http-server -p 4000` to be run on background

//     if (true) await sleep(5000);
//     // await page.goto('http://example.com');

//     console.log('page:', page);
//     const content = await page.content();
//     if (false) console.log('content:', content);
//     await page.screenshot({ path: '/home/adam/test.png' });
//     let x = 5;
//     let y = await page.evaluate(x_ => { return x_ ** 2; }, x);
//     console.log('x', x);
//     console.log('y', y);
//     // await page.exposeFunction('download', download);
//     // await page.evaluate(() => (window as any).download('blablablabla', '/home/adam/test.txt'));
//     [download, fs];
//     await browser.close();
// }


async function trySelenium(args: Args) {
    const opts = new FirefoxOptions();
    opts.addArguments('--headless');
    const driver = new selenium.Builder().forBrowser(selenium.Browser.FIREFOX).setFirefoxOptions(opts).build();
    // const driver = new selenium.Builder().forBrowser(selenium.Browser.CHROME).build();

    await driver.get('file:///home/adam/Workspace/CellStar/molstar/build/viewer/index.html');
    for (let i = 0; i < 1; i++) {
        const res1 = await executeScript(driver, scripts.s1, args.pdbid);
        if (res1.error === null) {
            // fs.writeFileSync('/home/adam/test-state.molj', res1.result.molj);
            // fs.writeFileSync('/home/adam/test-image.png', res1.result.image, 'base64');
            // console.log('res1', res1.result.image);
        }
        console.log('res1', res1);
    }
    // const screenshot = await driver.takeScreenshot();
    // fs.writeFileSync('/home/adam/test-selenium.png', screenshot, 'base64');
    await driver.quit();
}

async function main(args: Args) {
    console.log(args);
    // await tryPuppeteer();
    await trySelenium(args);
}


main(parseArguments()).then(() => console.log('OK'));
