//
// FileReader
//
// http://www.w3.org/TR/FileAPI/#dfn-filereader
// https://developer.mozilla.org/en/DOM/FileReader
"use strict";

import * as fs from 'fs';
import { EventEmitter } from 'events';

function doop(fn: any, args: any, context?: any) {
    if ('function' === typeof fn) {
        fn.apply(context, args);
    }
}

function toDataUrl(data: any, type: any) {
    // var data = self.result;
    var dataUrl = 'data:';

    if (type) {
        dataUrl += type + ';';
    }

    if (/text/i.test(type)) {
        dataUrl += 'charset=utf-8,';
        dataUrl += data.toString('utf8');
    } else {
        dataUrl += 'base64,';
        dataUrl += data.toString('base64');
    }

    return dataUrl;
}

function mapDataToFormat(file: any, data: any, format: any, encoding: any) {
    // var data = self.result;

    switch (format) {
        case 'buffer':
            return data;
            break;
        case 'binary':
            return data.toString('binary');
            break;
        case 'dataUrl':
            return toDataUrl(data, file.type);
            break;
        case 'text':
            return data.toString(encoding || 'utf8');
            break;
    }
}

class CFileReader /*implements FileReader*/ {
    static readonly EMPTY = 0;
    static readonly LOADING = 1;
    static readonly DONE = 2;
    readonly EMPTY = 0;
    readonly LOADING = 1;
    readonly DONE = 2;

    error = null;         // Read only
    readyState = this.EMPTY;   // Read only
    result = null;        // Road only

    onabort = null;
    onerror = null;
    onload = null;
    onloadend = null;
    onloadstart = null;
    onprogress = null;

    private readonly emitter = new EventEmitter();
    private file: any;

    addEventListener(type: string, listener: any, options?: boolean | AddEventListenerOptions): void {
        this.emitter.on(type, listener);
    }
    abort () {
        if (this.readyState == this.DONE) {
            return;
        }
        this.readyState = this.DONE;
        this.emitter.emit('abort');
    };
    private nodeChunkedEncoding = false;
    private setNodeChunkedEncoding(val: boolean) {
        this.nodeChunkedEncoding = val;
    };
    private createFileStream() {
        var stream = new EventEmitter(),
            chunked = this.nodeChunkedEncoding;
        // attempt to make the length computable
        if (!this.file.size && chunked && this.file.path) {
            fs.stat(this.file.path, (err: any, stat: any) => {
                this.file.size = stat.size;
                this.file.lastModifiedDate = stat.mtime;
            });
        }
        // The stream exists, do nothing more
        if (this.file.stream) {
            return;
        }
        // Create a read stream from a buffer
        if (this.file.buffer) {
            process.nextTick(() => {
                stream.emit('data', this.file.buffer);
                stream.emit('end');
            });
            this.file.stream = stream;
            return;
        }
        // Create a read stream from a file
        if (this.file.path) {
            // TODO url
            if (!chunked) {
                fs.readFile(this.file.path, function (err: any, data: any) {
                    if (err) {
                        stream.emit('error', err);
                    }
                    if (data) {
                        stream.emit('data', data);
                        stream.emit('end');
                    }
                });

                this.file.stream = stream;
                return;
            }
            // TODO don't duplicate this code here,
            // expose a method in File instead
            this.file.stream = fs.createReadStream(this.file.path);
        }
    }
    // Map `error`, `progress`, `load`, and `loadend`
    private mapStreamToEmitter(format: any, encoding: any) {
        const stream = this.file.stream;
        const buffers = [] as any;
        const chunked = this.nodeChunkedEncoding;

        buffers.dataLength = 0;

        stream.on('error', (err: any) => {
            if (this.DONE === this.readyState) {
                return;
            }

            this.readyState = this.DONE;
            this.error = err;
            this.emitter.emit('error', err);
        });

        stream.on('data', (data: any) => {
            if (this.DONE === this.readyState) {
                return;
            }

            buffers.dataLength += data.length;
            buffers.push(data);

            this.emitter.emit('progress', {
                // fs.stat will probably complete before this
                // but possibly it will not, hence the check
                lengthComputable: (!isNaN(this.file.size)) ? true : false,
                loaded: buffers.dataLength,
                total: this.file.size
            });

            this.emitter.emit('data', data);
        });

        stream.on('end', () => {
            if (this.DONE === this.readyState) {
                return;
            }

            var data;

            if (buffers.length > 1) {
                data = Buffer.concat(buffers);
            } else {
                data = buffers[0];
            }

            this.readyState = this.DONE;
            this.result = mapDataToFormat(this.file, data, format, encoding);
            this.emitter.emit('load', {
                target: {
                    // non-standard
                    nodeBufferResult: data,
                    result: this.result
                }
            });

            this.emitter.emit('loadend');
        });
    }

    private mapUserEvents() {
        this.emitter.on('start', (...args) => {
            doop(this.onloadstart, args);
        });
        this.emitter.on('progress', (...args) => {
            doop(this.onprogress, args);
        });
        this.emitter.on('error', (err: any) => {
            // TODO translate to FileError
            if (this.onerror) {
                (this.onerror as any)(err);
            } else {
                if (!(this.emitter.listeners as any).error || !(this.emitter.listeners as any).error.length) {
                    throw err;
                }
            }
        });
        this.emitter.on('load', (...args) => {
            doop(this.onload, args);
        });
        this.emitter.on('end', (...args) => {
            doop(this.onloadend, args);
        });
        this.emitter.on('abort', (...args) => {
            doop(this.onabort, args);
        });
    }

    private readFile(_file: any, format: any, encoding?: any) {
        this.file = _file;
        if (!this.file || !this.file.name || !(this.file.path || this.file.stream || this.file.buffer)) {
            throw new Error("cannot read as File: " + JSON.stringify(this.file));
        }
        if (0 !== this.readyState) {
            console.log("already loading, request to change format ignored");
            return;
        }

        // 'process.nextTick' does not ensure order, (i.e. an fs.stat queued later may return faster)
        // but `onloadstart` must come before the first `data` event and must be asynchronous.
        // Hence we waste a single tick waiting
        process.nextTick(() => {
            this.readyState = this.LOADING;
            this.emitter.emit('loadstart');
            this.createFileStream();
            this.mapStreamToEmitter(format, encoding);
            this.mapUserEvents();
        });
    }
}


export function XFileReader() {
    const self: any = {};
    const emitter = new EventEmitter;
    var file: any;

    self.addEventListener = function (on: any, callback: any) {
        emitter.on(on, callback);
    };
    self.removeEventListener = function (callback: any) {
        emitter.removeListener('', callback);
    }
    self.dispatchEvent = function (on: any) {
        emitter.emit(on);
    }

    self.EMPTY = 0;
    self.LOADING = 1;
    self.DONE = 2;

    self.error = undefined;         // Read only
    self.readyState = self.EMPTY;   // Read only
    self.result = undefined;        // Road only

    // non-standard
    self.on = function () {
        emitter.on.apply(emitter, arguments);
    }
    self.nodeChunkedEncoding = false;
    self.setNodeChunkedEncoding = function (val: any) {
        self.nodeChunkedEncoding = val;
    };
    // end non-standard



    // Whatever the file object is, turn it into a Node.JS File.Stream
    function createFileStream() {
        var stream = new EventEmitter(),
            chunked = self.nodeChunkedEncoding;

        // attempt to make the length computable
        if (!file.size && chunked && file.path) {
            fs.stat(file.path, function (err: any, stat: any) {
                file.size = stat.size;
                file.lastModifiedDate = stat.mtime;
            });
        }


        // The stream exists, do nothing more
        if (file.stream) {
            return;
        }


        // Create a read stream from a buffer
        if (file.buffer) {
            process.nextTick(function () {
                stream.emit('data', file.buffer);
                stream.emit('end');
            });
            file.stream = stream;
            return;
        }


        // Create a read stream from a file
        if (file.path) {
            // TODO url
            if (!chunked) {
                fs.readFile(file.path, function (err: any, data: any) {
                    if (err) {
                        stream.emit('error', err);
                    }
                    if (data) {
                        stream.emit('data', data);
                        stream.emit('end');
                    }
                });

                file.stream = stream;
                return;
            }

            // TODO don't duplicate this code here,
            // expose a method in File instead
            file.stream = fs.createReadStream(file.path);
        }
    }



    // before any other listeners are added
    emitter.on('abort', function () {
        self.readyState = self.DONE;
    });



    // Map `error`, `progress`, `load`, and `loadend`
    function mapStreamToEmitter(format: any, encoding: any) {
        const stream = file.stream;
        const buffers = [] as any;
        const chunked = self.nodeChunkedEncoding;

        buffers.dataLength = 0;

        stream.on('error', function (err: any) {
            if (self.DONE === self.readyState) {
                return;
            }

            self.readyState = self.DONE;
            self.error = err;
            emitter.emit('error', err);
        });

        stream.on('data', function (data: any) {
            if (self.DONE === self.readyState) {
                return;
            }

            buffers.dataLength += data.length;
            buffers.push(data);

            emitter.emit('progress', {
                // fs.stat will probably complete before this
                // but possibly it will not, hence the check
                lengthComputable: (!isNaN(file.size)) ? true : false,
                loaded: buffers.dataLength,
                total: file.size
            });

            emitter.emit('data', data);
        });

        stream.on('end', function () {
            if (self.DONE === self.readyState) {
                return;
            }

            var data;

            if (buffers.length > 1) {
                data = Buffer.concat(buffers);
            } else {
                data = buffers[0];
            }

            self.readyState = self.DONE;
            self.result = mapDataToFormat(file, data, format, encoding);
            emitter.emit('load', {
                target: {
                    // non-standard
                    nodeBufferResult: data,
                    result: self.result
                }
            });

            emitter.emit('loadend');
        });
    }


    // Abort is overwritten by readAsXyz
    self.abort = function () {
        if (self.readState == self.DONE) {
            return;
        }
        self.readyState = self.DONE;
        emitter.emit('abort');
    };



    // 
    function mapUserEvents() {
        emitter.on('start', function () {
            doop(self.onloadstart, arguments);
        });
        emitter.on('progress', function () {
            doop(self.onprogress, arguments);
        });
        emitter.on('error', function (err: any) {
            // TODO translate to FileError
            if (self.onerror) {
                self.onerror(err);
            } else {
                if (!(emitter.listeners as any).error || !(emitter.listeners as any).error.length) {
                    throw err;
                }
            }
        });
        emitter.on('load', function () {
            doop(self.onload, arguments);
        });
        emitter.on('end', function () {
            doop(self.onloadend, arguments);
        });
        emitter.on('abort', function () {
            doop(self.onabort, arguments);
        });
    }



    function readFile(_file: any, format: any, encoding?: any) {
        file = _file;
        if (!file || !file.name || !(file.path || file.stream || file.buffer)) {
            throw new Error("cannot read as File: " + JSON.stringify(file));
        }
        if (0 !== self.readyState) {
            console.log("already loading, request to change format ignored");
            return;
        }

        // 'process.nextTick' does not ensure order, (i.e. an fs.stat queued later may return faster)
        // but `onloadstart` must come before the first `data` event and must be asynchronous.
        // Hence we waste a single tick waiting
        process.nextTick(function () {
            self.readyState = self.LOADING;
            emitter.emit('loadstart');
            createFileStream();
            mapStreamToEmitter(format, encoding);
            mapUserEvents();
        });
    }

    self.readAsArrayBuffer = function (file: any) {
        readFile(file, 'buffer');
    };
    self.readAsBinaryString = function (file: any) {
        readFile(file, 'binary');
    };
    self.readAsDataURL = function (file: any) {
        readFile(file, 'dataUrl');
    };
    self.readAsText = function (file: any, encoding: any) {
        readFile(file, 'text', encoding);
    };
}

