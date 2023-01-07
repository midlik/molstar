import { ThenableWebDriver } from 'selenium-webdriver';

import { scripts } from './scripts';
import { Script, ScriptNames2, ScriptResult } from './types';


let scriptIndex: Map<Script<any, any>, string>;

export async function executeScript<A, R>(driver: ThenableWebDriver, script: Script<A, R>, args: A): Promise<ScriptResult<R>> {
    if (!scriptIndex) {
        console.log('Initing index');
        scriptIndex = new Map();
        for (const name in scripts) {
            scriptIndex.set(scripts[name as ScriptNames2], name);
        }
    }
    const scriptName = scriptIndex.get(script);
    if (!scriptName) {
        throw Error('A script must be in the `scripts` constant to be able to run it.');
    }
    console.log('execute', scriptName);
    const molstar = undefined as any; // just for TypeScript
    let result: ScriptResult<R> = await driver.executeScript((scriptName_: string, args_: A) => molstar.runScriptInBrowser(scriptName_, args_), scriptName, args);
    if (result.error === null && script.after) {
        result.result = await script.after(args, result.result);
    }
    return result;
}

// TODO make a class, include driver initialization ...