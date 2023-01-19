/** Implements some browser-only global variables for NodeJS environment. 
 * These workarounds will also work in browsers as usual. */


export const FileReader_ = getFileReader();

export const XMLHttpRequest_ = getXMLHttpRequest();

export const File_ = getFile();


function getFileReader(): typeof FileReader {
    if (typeof document === 'undefined') {
        const filereaderClass = require('filereader');
        filereaderClass.UNSENT = 0;
        filereaderClass.OPENED = 1;
        filereaderClass.HEADERS_RECEIVED = 2;
        filereaderClass.LOADING = 3;
        filereaderClass.DONE = 4;
        return filereaderClass;
    } else {
        return FileReader;
    }
}

function getXMLHttpRequest(): typeof XMLHttpRequest {
    if (typeof document === 'undefined') {
        return require('xhr2');
    } else {
        return XMLHttpRequest;
    }
}


function getFile(): typeof File {
    if (typeof document === 'undefined') {
        class File_NodeJs_old implements File {
            // Blob fields
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array>;
            text: () => Promise<string>;
            // File extending fields
            name: string;
            lastModified: number;
            webkitRelativePath: string;

            constructor(fileBits: BlobPart[], fileName: string, options?: FilePropertyBag) {
                const blob = new Blob(fileBits, options);
                // Blob fields
                this.size = blob.size;
                this.type = blob.type;
                this.arrayBuffer = blob.arrayBuffer;
                this.slice = blob.slice;
                this.stream = blob.stream;
                this.text = blob.text;
                // File extending fields
                this.name = fileName;
                this.lastModified = options?.lastModified ?? 0;
                this.webkitRelativePath = '';
            }
        }
        class File_NodeJs implements File {
            private readonly blob: Blob;
            // Blob fields
            readonly size: number;
            readonly type: string;
            arrayBuffer() { return this.blob.arrayBuffer(); }
            slice(start?: number, end?: number, contentType?: string) { return this.blob.slice(start, end, contentType); }
            stream() { return this.blob.stream(); }
            text() { return this.blob.text(); }
            // File extending fields
            name: string;
            lastModified: number;
            webkitRelativePath: string;

            constructor(fileBits: BlobPart[], fileName: string, options?: FilePropertyBag) {
                this.blob = new Blob(fileBits, options);
                // Blob fields
                this.size = this.blob.size;
                this.type = this.blob.type;
                // File extending fields
                this.name = fileName;
                this.lastModified = options?.lastModified ?? 0;
                this.webkitRelativePath = '';
            }
        }
        return File_NodeJs;
    } else {
        return File;
    }
}
