/**
 * Copyright (c) 2018-2025 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author Adam Midlik <midlik@gmail.com>
 *
 * Adapted from LiteMol
 */

import { StringLike } from '../mol-io/common/string-like';
import { utf8Read, utf8ReadLong } from '../mol-io/common/utf8';
import { RuntimeContext, Task } from '../mol-task';
import { Asset, AssetManager } from './assets';
import { RUNNING_IN_NODEJS } from './nodejs-shims';
import { ungzip, unzip } from './zip/zip';


export enum DataCompressionMethod {
    None,
    Gzip,
    Zip,
}

export type DataType = 'json' | 'xml' | 'string' | 'binary' | 'zip'
export type DataValue = 'string' | any | XMLDocument | Uint8Array
export type DataResponse<T extends DataType> =
    T extends 'json' ? any :
        T extends 'xml' ? XMLDocument :
            T extends 'string' ? StringLike :
                T extends 'binary' ? Uint8Array :
                    T extends 'zip' ? { [k: string]: Uint8Array } : never

export interface AjaxGetParams<T extends DataType = 'string'> {
    url: string,
    type?: T,
    title?: string,
    headers?: [string, string][],
    body?: string
}

export function readStringFromFile(file: File) {
    return readFromFileInternal(file, 'string');
}

export function readUint8ArrayFromFile(file: File) {
    return readFromFileInternal(file, 'binary');
}

export function readFromFile<T extends DataType>(file: File, type: T) {
    return readFromFileInternal(file, type);
}

export function ajaxGet(url: string): Task<DataValue>
export function ajaxGet<T extends DataType>(params: AjaxGetParams<T>): Task<DataResponse<T>>
export function ajaxGet<T extends DataType>(params: AjaxGetParams<T> | string) {
    if (typeof params === 'string') return ajaxGetInternal(params, params, 'string');
    return ajaxGetInternal(params.title, params.url, params.type || 'string', params.body, params.headers);
}

export type AjaxTask = typeof ajaxGet

function isDone(data: XMLHttpRequest | FileReader) {
    if (RUNNING_IN_NODEJS) throw new Error('`isDone` should not be used when running in Node.js'); // XMLHttpRequest and FileReader are not available in Node.js
    if (data instanceof FileReader) {
        return data.readyState === FileReader.DONE;
    } else if (data instanceof XMLHttpRequest) {
        return data.readyState === XMLHttpRequest.DONE;
    }
    throw new Error('unknown data type');
}

function genericError(isDownload: boolean) {
    if (isDownload) return 'Failed to download data. Possible reasons: Resource is not available, or CORS is not allowed on the server.';
    return 'Failed to open file.';
}

function readData<T extends XMLHttpRequest | FileReader>(ctx: RuntimeContext, action: string, data: T): Promise<T> {
    if (RUNNING_IN_NODEJS) throw new Error('`readData` should not be used when running in Node.js'); // XMLHttpRequest is not available in Node.js
    return new Promise<T>((resolve, reject) => {
        // first check if data reading is already done
        if (isDone(data)) {
            const { error } = data as FileReader;
            if (error !== null && error !== undefined) {
                reject(error ?? genericError(data instanceof XMLHttpRequest));
            } else {
                resolve(data);
            }
            return;
        }

        let hasError = false;

        data.onerror = (e: ProgressEvent) => {
            if (hasError) return;

            const { error } = e.target as FileReader;
            reject(error ?? genericError(data instanceof XMLHttpRequest));
        };

        data.onprogress = (e: ProgressEvent) => {
            if (!ctx.shouldUpdate || hasError) return;

            try {
                if (e.lengthComputable) {
                    ctx.update({ message: action, isIndeterminate: false, current: e.loaded, max: e.total });
                } else {
                    ctx.update({ message: `${action} ${(e.loaded / 1024 / 1024).toFixed(2)} MB`, isIndeterminate: true });
                }
            } catch (e) {
                hasError = true;
                reject(e);
            }
        };

        data.onload = (e: ProgressEvent) => {
            resolve(data);
        };
    });
}

function getCompression(name: string) {
    return /\.gz$/i.test(name) ? DataCompressionMethod.Gzip :
        /\.zip$/i.test(name) ? DataCompressionMethod.Zip :
            DataCompressionMethod.None;
}

const reFilterPath = /^(__MACOSX|.DS_Store)/;

async function decompress(ctx: RuntimeContext, data: Uint8Array, compression: DataCompressionMethod): Promise<Uint8Array> {
    switch (compression) {
        case DataCompressionMethod.None: return data;
        case DataCompressionMethod.Gzip: return ungzip(ctx, data);
        case DataCompressionMethod.Zip:
            const parsed = await unzip(ctx, data.buffer);
            const names = Object.keys(parsed).filter(n => !reFilterPath.test(n));
            if (names.length !== 1) throw new Error('can only decompress zip files with a single entry');
            return parsed[names[0]] as Uint8Array;
    }
}

async function processFile<T extends DataType>(ctx: RuntimeContext, fileContent: ArrayBuffer | null, type: T, compression: DataCompressionMethod): Promise<DataResponse<T>> {
    if (fileContent === null) throw new Error('no data given');

    let data = new Uint8Array(fileContent);

    if (compression !== DataCompressionMethod.None && type !== 'zip') { // if type==='zip', data will be decompressed later
        data = await decompress(ctx, data, compression);
    }

    if (type === 'binary') {
        return data as DataResponse<T>;
    } else if (type === 'zip') {
        return await unzip(ctx, data.buffer) as DataResponse<T>;
    } else if (type === 'string') {
        return utf8ReadLong(data) as DataResponse<T>;
    } else if (type === 'xml') {
        const parser = new DOMParser();
        return parser.parseFromString(utf8Read(data), 'application/xml') as DataResponse<T>;
    } else if (type === 'json') {
        return JSON.parse(utf8Read(data)) as DataResponse<T>;
    }
    throw new Error(`could not get requested response data '${type}'`);
}

function readFromFileInternal<T extends DataType>(file: File, type: T): Task<DataResponse<T>> {
    if (RUNNING_IN_NODEJS) {
        return readFromFileInternal_NodeJS(file, type);
    }
    let reader: FileReader | undefined = void 0;
    return Task.create('Read File', async ctx => {
        try {
            await ctx.update({ message: 'Opening file...', canAbort: true });
            reader = new FileReader();
            reader.readAsArrayBuffer(file);
            const fileReader = await readData(ctx, 'Reading...', reader);
            const fileContent = fileReader.result as ArrayBuffer | null;

            await ctx.update({ message: 'Processing file...', canAbort: false });
            return await processFile(ctx, fileContent, type, getCompression(file.name));
        } finally {
            reader = void 0;
        }
    }, () => {
        if (reader) reader.abort();
    });
}
function readFromFileInternal_NodeJS<T extends DataType>(file: File, type: T): Task<DataResponse<T>> {
    return Task.create('Read File', async ctx => {
        await ctx.update({ message: 'Opening file...', canAbort: false });
        const fileContent = await file.arrayBuffer();

        await ctx.update({ message: 'Processing file...', canAbort: false });
        return await processFile(ctx, fileContent, type, getCompression(file.name));
    });
}

class RequestPool {
    private static pool: XMLHttpRequest[] = [];
    private static poolSize = 15;

    static get() {
        if (RUNNING_IN_NODEJS) throw new Error('`RequestPool.get` should not be used when running in Node.js'); // XMLHttpRequest is not available in Node.js
        if (this.pool.length) {
            return this.pool.pop()!;
        }
        return new XMLHttpRequest();
    }

    static emptyFunc() { }

    static deposit(req: XMLHttpRequest) {
        if (this.pool.length < this.poolSize) {
            req.onabort = RequestPool.emptyFunc;
            req.onerror = RequestPool.emptyFunc;
            req.onload = RequestPool.emptyFunc;
            req.onprogress = RequestPool.emptyFunc;
            this.pool.push(req);
        }
    }
}

function processAjax<T extends DataType>(req: XMLHttpRequest, type: T): DataResponse<T> {
    if (req.status >= 200 && req.status < 400) {
        const { response } = req;
        RequestPool.deposit(req);

        if ((type === 'binary' || type === 'zip') && response instanceof ArrayBuffer) {
            return new Uint8Array(response) as DataResponse<T>;
        } else if (type === 'string' && typeof response === 'string') {
            return response as DataResponse<T>;
        } else if (type === 'xml' && response instanceof XMLDocument) {
            return response as DataResponse<T>;
        } else if (type === 'json' && typeof response === 'object') {
            return response as DataResponse<T>;
        }
        throw new Error(`could not get requested response data '${type}'`);
    } else {
        RequestPool.deposit(req);
        throw new Error(`Download failed with status code ${req.status}`);
    }
}

function getRequestResponseType(type: DataType): XMLHttpRequestResponseType {
    switch (type) {
        case 'json': return 'json';
        case 'xml': return 'document';
        case 'string': return 'text';
        case 'binary': return 'arraybuffer';
        case 'zip': return 'arraybuffer';
    }
}

function ajaxGetInternal<T extends DataType>(title: string | undefined, url: string, type: T, body?: string, headers?: [string, string][]): Task<DataResponse<T>> {
    if (RUNNING_IN_NODEJS) {
        if (url.startsWith('file://')) {
            return ajaxGetInternal_file_NodeJS(title, url, type, body, headers);
        } else {
            return ajaxGetInternal_http_NodeJS(title, url, type, body, headers);
        }
    }

    let xhttp: XMLHttpRequest | undefined = void 0;
    return Task.create(title ? title : 'Download', async ctx => {
        xhttp = RequestPool.get();

        xhttp.open(body ? 'post' : 'get', url, true);
        if (headers) {
            for (const [name, value] of headers) {
                xhttp.setRequestHeader(name, value);
            }
        }
        xhttp.responseType = getRequestResponseType(type);
        xhttp.send(body);

        await ctx.update({ message: 'Waiting for server...', canAbort: true });
        const req = await readData(ctx, 'Downloading...', xhttp);
        xhttp = void 0; // guard against reuse, help garbage collector

        await ctx.update({ message: 'Parsing response...', canAbort: false });
        const result = processAjax(req, type);

        return result;
    }, () => {
        if (xhttp) {
            xhttp.abort();
            xhttp = void 0; // guard against reuse, help garbage collector
        }
    });
}

// NOTE: a workaround for using this in Node.js
let _fs: (typeof import('fs')) | undefined = undefined;
function getFS() {
    if (!_fs) {
        throw new Error('When running in Node.js and reading from files, call mol-util/data-source\'s setFSModule function first.');
    }
    return _fs;
}

export function setFSModule(fs: typeof import('fs')) {
    _fs = fs;
}

function readFileAsync(filename: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        getFS().readFile(filename, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });
}

/** Alternative implementation of ajaxGetInternal for NodeJS for file:// protocol */
function ajaxGetInternal_file_NodeJS<T extends DataType>(title: string | undefined, url: string, type: T, body?: string, headers?: [string, string][]): Task<DataResponse<T>> {
    if (!RUNNING_IN_NODEJS) throw new Error('This function should only be used when running in Node.js');
    if (!url.startsWith('file://')) throw new Error('This function is only for URLs with protocol file://');

    return Task.create(title ?? 'Download', async ctx => {
        const filename = url.substring('file://'.length);
        await ctx.update({ message: 'Loading file...', canAbort: false });
        const data = await readFileAsync(filename);

        await ctx.update({ message: 'Parsing response...', canAbort: false });
        const result = await processFile(ctx, data, type, DataCompressionMethod.None);
        return result;
    });
}

/** Alternative implementation of ajaxGetInternal for NodeJS for http(s):// protocol */
function ajaxGetInternal_http_NodeJS<T extends DataType>(title: string | undefined, url: string, type: T, body?: string, headers?: [string, string][]): Task<DataResponse<T>> {
    if (!RUNNING_IN_NODEJS) throw new Error('This function should only be used when running in Node.js');

    const aborter = new AbortController();
    return Task.create(title ?? 'Download', async ctx => {
        await ctx.update({ message: 'Downloading...', canAbort: true });
        const response = await fetch(url, { signal: aborter.signal });
        if (!(response.status >= 200 && response.status < 400)) {
            throw new Error(`Download failed with status code ${response.status}`);
        }
        const fileContent = await response.bytes();

        await ctx.update({ message: 'Parsing response...', canAbort: false });
        const result = await processFile(ctx, fileContent, type, DataCompressionMethod.None);
        return result;
    }, () => {
        aborter.abort();
    });
}

export type AjaxGetManyEntry = { kind: 'ok', id: string, result: Asset.Wrapper<'string' | 'binary'> } | { kind: 'error', id: string, error: any }
export async function ajaxGetMany(ctx: RuntimeContext, assetManager: AssetManager, sources: { id: string, url: Asset.Url | string, isBinary?: boolean, canFail?: boolean }[], maxConcurrency: number) {
    const len = sources.length;
    const slots: AjaxGetManyEntry[] = new Array(sources.length);

    await ctx.update({ message: 'Downloading...', current: 0, max: len });
    let promises: Promise<AjaxGetManyEntry & { index: number }>[] = [], promiseKeys: number[] = [];
    let currentSrc = 0;
    for (let _i = Math.min(len, maxConcurrency); currentSrc < _i; currentSrc++) {
        const current = sources[currentSrc];

        promises.push(wrapPromise(currentSrc, current.id,
            assetManager.resolve(Asset.getUrlAsset(assetManager, current.url), current.isBinary ? 'binary' : 'string').runAsChild(ctx)));
        promiseKeys.push(currentSrc);
    }

    let done = 0;
    while (promises.length > 0) {
        const r = await Promise.race(promises);
        const src = sources[r.index];
        const idx = promiseKeys.indexOf(r.index);
        done++;
        if (r.kind === 'error' && !src.canFail) {
            // TODO: cancel other downloads
            throw new Error(`${src.url}: ${r.error}`);
        }
        if (ctx.shouldUpdate) {
            await ctx.update({ message: 'Downloading...', current: done, max: len });
        }
        slots[r.index] = r;
        promises = promises.filter(_filterRemoveIndex, idx);
        promiseKeys = promiseKeys.filter(_filterRemoveIndex, idx);
        if (currentSrc < len) {
            const current = sources[currentSrc];
            const asset = assetManager.resolve(Asset.getUrlAsset(assetManager, current.url), current.isBinary ? 'binary' : 'string').runAsChild(ctx);
            promises.push(wrapPromise(currentSrc, current.id, asset));
            promiseKeys.push(currentSrc);
            currentSrc++;
        }
    }

    return slots;
}

function _filterRemoveIndex(this: number, _: any, i: number) {
    return this !== i;
}

async function wrapPromise(index: number, id: string, p: Promise<Asset.Wrapper<'string' | 'binary'>>): Promise<AjaxGetManyEntry & { index: number }> {
    try {
        const result = await p;
        return { kind: 'ok', result, index, id };
    } catch (error) {
        return { kind: 'error', error, index, id };
    }
}