import * as fs from 'fs';

import { Canvas3D } from '../../mol-canvas3d/canvas3d';
import { PostprocessingProps } from '../../mol-canvas3d/passes/postprocessing';
import { PluginContext } from '../../mol-plugin/context';
import { PluginSpec } from '../../mol-plugin/spec';

import { Canvas3DRenderer } from './renderer';


/** PluginContext that can be used in Node.js (without DOM) */
export class HeadlessPluginContext extends PluginContext {
    renderer: Canvas3DRenderer;

    constructor(spec: PluginSpec, canvasSize: { width: number, height: number } = { width: 640, height: 480 }) {
        super(spec);
        this.renderer = new Canvas3DRenderer(canvasSize);
        (this.canvas3d as Canvas3D) = this.renderer.canvas3d;
    }

    /** Render the current plugin state to a PNG or JPEG file */
    async saveImage(outPath: string, imageSize?: { width: number, height: number }, props?: Partial<PostprocessingProps>, format?: 'png' | 'jpeg', jpegQuality = 90) {
        this.canvas3d!.commit(true);
        return await this.renderer.saveImage(outPath, imageSize, props, format, jpegQuality);
    }

    /** Get the current plugin state */
    getStateSnapshot() {
        this.canvas3d!.commit(true);
        return this.managers.snapshot.getStateSnapshot({ params: {} });
    }

    /** Save the current plugin state to a MOLJ file */
    async saveStateSnapshot(outPath: string) {
        const snapshot = this.getStateSnapshot();
        const snapshot_json = JSON.stringify(snapshot, null, 2);
        await new Promise<void>(resolve => {
            fs.writeFile(outPath, snapshot_json, () => resolve());
        });
    }
}
