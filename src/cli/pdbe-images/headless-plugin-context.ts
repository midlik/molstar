import * as fs from 'fs';

import { Canvas3D } from "../../mol-canvas3d/canvas3d";
import { PluginContext } from '../../mol-plugin/context';
import { PluginSpec } from '../../mol-plugin/spec';

import { ImageRenderer, StructureSize } from './renderer';



/** PluginContext that can be used in NodeJS (without DOM) */
export class HeadlessPluginContext extends PluginContext {
    renderer: ImageRenderer;
    constructor(spec: PluginSpec, canvasSize: { width: number, height: number } = { width: 800, height: 800 }) {
        super(spec);
        this.renderer = new ImageRenderer(canvasSize.width, canvasSize.height, 'png', 'off');
        (this.canvas3d as Canvas3D) = this.renderer.canvas3d;
    }
    /** Make ready for saving image or state snapshot */
    commitCanvas() {
        if (!this.canvas3d) throw new Error('canvas3d is undefined');
        this.canvas3d.commit(true);
    }
    /** Render the current plugin state to a PNG file */
    async saveImage(outPath: string, structureSize: StructureSize = StructureSize.Medium, imageSize?: [number, number]) {
        this.commitCanvas();
        return await this.renderer.createImage(outPath, structureSize, imageSize);
    }
    /** Save the current plugin state to a MOLJ file */
    saveStateSnapshot(outPath: string) {
        this.commitCanvas();
        const snapshot = this.managers.snapshot.getStateSnapshot({ params: {} });
        const snapshot_json = JSON.stringify(snapshot, null, 2);
        fs.writeFileSync(outPath, snapshot_json);
    }
    /** Remove all nodes from the state tree */
    async clear(){
        await this.build().delete(this.state.data.root).commit();
    }
}