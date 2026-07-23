/**
 * Copyright (c) 2017-2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 */

import * as fs from 'fs';
import { ArrayEncoding } from '../../mol-io/common/binary-cif';
import { FileHandle } from '../../mol-io/common/file-handle';
import { SimpleBuffer } from '../../mol-io/common/simple-buffer';
import { parseFile as parseCcp4File } from '../../mol-io/reader/ccp4/parser';
import { Ccp4File } from '../../mol-io/reader/ccp4/schema';
import { CifWriter } from '../../mol-io/writer/cif';
import { Progress, Task } from '../../mol-task';

function showProgress(p: Progress) {
    process.stdout.write(`\r${new Array(80).join(' ')}`);
    process.stdout.write(`\r${Progress.format(p)}`);
}

function createVolumeCifData(source: Ccp4File, outFormat: 'bcif' | 'cif'): Uint8Array {
    const writer = CifWriter.createEncoder({ binary: outFormat === 'bcif', encoderName: 'mol*/ciftools ccp42bcif' });
    const values = new Float32Array(source.values.length);
    for (let i = 0, n = source.values.length; i < n; i++) values[i] = Number(source.values[i]);
    const valueCount = values.length;

    writer.startDataBlock('foo');
    writer.writeCategory({
        name: 'foo',
        instance: () => CifWriter.categoryInstance([CifWriter.Field.str('foo', () => 'Molstar needs two data blocks to load volume CIF')], { rowCount: 1 }),
    });

    // TODO: Fix axis order, origin, dimensions (and maybe other things), current implementation does not produce correctly scaled volumes!
    // TODO: Allow multiple data blocks (e.g. 2Fo-Fc + Fo-Fc)
    // TODO: Batch mode
    
    writer.startDataBlock(source.name || 'volume');
    writer.writeCategory({
        name: 'volume_data_3d_info',
        instance: () => CifWriter.categoryInstance([
            CifWriter.Field.str('name', () => source.name || 'volume'),
            CifWriter.Field.int('axis_order[0]', () => 2),
            CifWriter.Field.int('axis_order[1]', () => 1),
            CifWriter.Field.int('axis_order[2]', () => 0),
            CifWriter.Field.float('origin[0]', () => source.header.originX),
            CifWriter.Field.float('origin[1]', () => source.header.originY),
            CifWriter.Field.float('origin[2]', () => source.header.originZ),
            CifWriter.Field.float('dimensions[0]', () => source.header.NC),
            CifWriter.Field.float('dimensions[1]', () => source.header.NR),
            CifWriter.Field.float('dimensions[2]', () => source.header.NS),
            CifWriter.Field.int('sample_rate', () => 1),
            CifWriter.Field.int('sample_count[0]', () => source.header.NC),
            CifWriter.Field.int('sample_count[1]', () => source.header.NR),
            CifWriter.Field.int('sample_count[2]', () => source.header.NS),
            CifWriter.Field.int('spacegroup_number', () => source.header.ISPG),
            CifWriter.Field.float('spacegroup_cell_size[0]', () => source.header.xLength),
            CifWriter.Field.float('spacegroup_cell_size[1]', () => source.header.yLength),
            CifWriter.Field.float('spacegroup_cell_size[2]', () => source.header.zLength),
            CifWriter.Field.float('spacegroup_cell_angles[0]', () => source.header.alpha),
            CifWriter.Field.float('spacegroup_cell_angles[1]', () => source.header.beta),
            CifWriter.Field.float('spacegroup_cell_angles[2]', () => source.header.gamma),
            CifWriter.Field.float('mean_source', () => source.header.AMEAN),
            CifWriter.Field.float('mean_sampled', () => source.header.AMEAN),
            CifWriter.Field.float('sigma_source', () => source.header.ARMS),
            CifWriter.Field.float('sigma_sampled', () => source.header.ARMS),
            CifWriter.Field.float('min_source', () => source.header.AMIN),
            CifWriter.Field.float('min_sampled', () => source.header.AMIN),
            CifWriter.Field.float('max_source', () => source.header.AMAX),
            CifWriter.Field.float('max_sampled', () => source.header.AMAX),
        ], { data: source, rowCount: 1 })
    });

    const valuesEncoder =
        ArrayEncoding.by(ArrayEncoding.intervalQuantizaiton(source.header.AMIN, source.header.AMAX, 255, Uint8Array))
            .and(ArrayEncoding.runLength)
            .and(ArrayEncoding.byteArray);

    writer.writeCategory({
        name: 'volume_data_3d',
        instance: () => CifWriter.categoryInstance([
            CifWriter.Field.float(
                'values',
                (i: number, data: ArrayLike<number>) => data[i],
                { typedArray: Float32Array, encoder: valuesEncoder }
            )
        ], { data: values, rowCount: valueCount })
    });

    return writer.getData() as Uint8Array;
}

export function convert(path: string, outFormat: 'bcif' | 'cif') {
    return Task.create<Uint8Array>('Convert CCP4/MRC/MAP', async ctx => {
        const data = await fs.promises.readFile(path);
        const file = FileHandle.fromBuffer(SimpleBuffer.fromUint8Array(new Uint8Array(data)), path);
        const parsed = await parseCcp4File(file, data.length).runInContext(ctx);
        if (parsed.isError) throw parsed;
        return createVolumeCifData(parsed.result, outFormat);
    }).run(showProgress, 250);
}
