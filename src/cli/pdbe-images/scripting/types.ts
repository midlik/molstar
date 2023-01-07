import { Viewer } from '../../../apps/viewer';

import { scripts } from './scripts';


export class Script<A, R> {
    /** Runs in browser */
    body: (viewer: Viewer, args: A) => R | Promise<R>;
    /** Runs in Node after `body` returns */
    after?: (args: A, result: R) => R | Promise<R>;

    constructor(body: (viewer: Viewer, args: A) => R | Promise<R>) {
        this.body = body;
    }

    withAfter(after: (args: A, result: R) => R | Promise<R>) {
        this.after = after;
        return this;
    }
}

// these types could be in scripting-master, except for the class (causing circular dep)

// export interface Script<A, R> {
//     func: (viewer: Viewer, args: A) => R | Promise<R>,
//     after?: (args: A, result: R) => R | Promise<R>
// }


export type ScriptResult<T> = {
    result: T, // Selenium does not allow undefined
    error: null, // Selenium does not allow undefined
} | {
    error: string, // Selenium does not allow undefined
}

export type ScriptNames2 = keyof typeof scripts;
