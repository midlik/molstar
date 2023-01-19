
/** Lets web applications asynchronously read the contents of files (or raw data buffers) stored on the user's computer, using File or Blob objects to specify the file or data to read. */
export class SimpleFileReader /*implements EventTarget*/ {
    readonly error: DOMException | null;
    onabort: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null;
    onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null;
    onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null;
    onloadend: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null;
    onloadstart: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null;
    onprogress: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null;
    readonly readyState: number;
    readonly result: string | ArrayBuffer | null;
    // abort(): void;
    readAsArrayBuffer(blob: Blob): void{
        blob.arrayBuffer
    }
    // readAsBinaryString(blob: Blob): void;
    // readAsDataURL(blob: Blob): void;
    // readAsText(blob: Blob, encoding?: string): void;
    // readonly DONE: number;
    // readonly EMPTY: number;
    // readonly LOADING: number;
    // addEventListener<K extends keyof FileReaderEventMap>(type: K, listener: (this: FileReader, ev: FileReaderEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    // addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    // removeEventListener<K extends keyof FileReaderEventMap>(type: K, listener: (this: FileReader, ev: FileReaderEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    // removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    // constructor(){
    //     super();
    // }
}

declare var FileReader: {
    prototype: FileReader;
    new(): FileReader;
    readonly DONE: number;
    readonly EMPTY: number;
    readonly LOADING: number;
};
