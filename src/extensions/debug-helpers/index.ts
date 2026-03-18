/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { PluginBehavior } from '../../mol-plugin/behavior/behavior';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { BoundingSphereHelper, BoundingSphereHelperParams } from './bounding-sphere-helper';
import { ClipObjectHelper, ClipObjectHelperParams } from './clip-object-helper';
import { DirectVolumeHelper, DirectVolumeHelperParams } from './direct-volume-helper';
import { ImageHelper, ImageHelperParams } from './image-helper';
import { MeshHelper, MeshHelperParams } from './mesh-helper';

const DebugHelpersParams = {
    ...BoundingSphereHelperParams,
    ...ClipObjectHelperParams,
    ...MeshHelperParams,
    ...ImageHelperParams,
    ...DirectVolumeHelperParams,
};
type DebugHelpersParams = typeof DebugHelpersParams;
type DebugHelpersProps = PD.Values<DebugHelpersParams>;

export const DebugHelpers = PluginBehavior.create<DebugHelpersProps>({
    name: 'extension-debug-helpers',
    category: 'misc',
    display: {
        name: 'Debug Helpers'
    },
    ctor: class extends PluginBehavior.Handler<DebugHelpersProps> {
        async register(): Promise<void> {
            await this.ctx.canvas3dInitialized;
            const canvas3d = this.ctx.canvas3d;
            if (!canvas3d) return;

            const dh = canvas3d.debugHelper;
            const { ctx, parent } = dh;

            dh.register('bounding-sphere', new BoundingSphereHelper(ctx, parent, this.params));
            dh.register('clip-object', new ClipObjectHelper(ctx, parent, this.params));
            dh.register('mesh', new MeshHelper(ctx, parent, this.params));
            dh.register('image', new ImageHelper(ctx, parent, this.params));
            dh.register('direct-volume', new DirectVolumeHelper(ctx, parent, this.params));
        }

        update(params: DebugHelpersProps) {
            const changed = super.update(params);
            const canvas3d = this.ctx.canvas3d;
            if (changed && canvas3d) {
                canvas3d.debugHelper.setProps(params);
                canvas3d.requestDraw();
            }
            return changed;
        }

        unregister() {
            const canvas3d = this.ctx.canvas3d;
            if (!canvas3d) return;

            const dh = canvas3d.debugHelper;
            dh.unregister('bounding-sphere');
            dh.unregister('clip-object');
            dh.unregister('mesh');
            dh.unregister('image');
            dh.unregister('direct-volume');
        }
    },
    params: () => DebugHelpersParams,
    canAutoUpdate: () => true,
});
