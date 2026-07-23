#!/usr/bin/env node
/**
 * Copyright (c) 2017-2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 */

import * as argparse from 'argparse';
import * as fs from 'fs';
import * as util from 'util';
import * as zlib from 'zlib';
import { convert } from './converter';

async function write(outPath: string, res: Uint8Array) {
    const isGz = /\.gz$/i.test(outPath);
    if (isGz) {
        const zipAsync = util.promisify<zlib.InputType, Buffer>(zlib.gzip);
        res = await zipAsync(res);
    }
    fs.writeFileSync(outPath, res);
}

async function run(args: Args) {
    const outputFormat = args.out.toLowerCase().endsWith('.bcif') ? 'bcif' : 'cif';
    const converted = await convert(args.src, outputFormat);
    await write(args.out, converted);
    console.log();
}


const parser = new argparse.ArgumentParser({
    add_help: true,
    description: 'Convert a CCP4/MRC/MAP volume file to CIF/BCIF (BinaryCIF)'
});
parser.add_argument('src', { help: 'Source CCP4/MRC/MAP file path.' });
parser.add_argument('out', { help: 'Output CIF/BCIF file path. Output format will be determined by the file extension.' });

interface Args {
    src: string,
    out: string,
}
const args: Args = parser.parse_args();

if (args) {
    run(args);
}
