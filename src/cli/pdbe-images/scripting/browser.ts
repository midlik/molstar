/** Functions that will be executed within a Selenium-controlled browser. */

import { Viewer } from '../../../apps/viewer';

import { Script, ScriptNames2, ScriptResult } from './types';
import { scripts } from './scripts';


let viewer: Viewer | undefined = undefined;
// TODO replace Viewer by PluginIUContext (avoid needing apps/)

export async function runScriptInBrowser<A, R>(scriptName: ScriptNames2, args: A): Promise<ScriptResult<R>> {
    const script = scripts[scriptName] as any as Script<A, R> | undefined;
    if (!script) {
        return { error: `Script ${scriptName} not found` };
    }
    try {
        if (!viewer) viewer = await initViewer();
        const result = await script.body(viewer, args);
        return { result: result, error: null };
    } catch (ex) {
        return { error: `${ex}` };
    }
}

async function initViewer() {
    return await Viewer.create('app', {
        layoutShowControls: true,
        viewportShowExpand: false,
        collapseLeftPanel: false,
        pdbProvider: 'pdbe',
        emdbProvider: 'pdbe',
        volumeStreamingServer: 'https://www.ebi.ac.uk/pdbe/densities',
        pixelScale: 1,
        pickScale: 0.25,
        pickPadding: 1,
        enableWboit: undefined,
        enableDpoit: undefined,
        preferWebgl1: undefined,
        allowMajorPerformanceCaveat: false,
        powerPreference: 'high-performance',
    });
}

