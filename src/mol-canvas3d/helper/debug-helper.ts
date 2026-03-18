/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Scene } from '../../mol-gl/scene';
import { WebGLContext } from '../../mol-gl/webgl/context';

/** Interface that all debug helper entries must implement */
export interface DebugHelperEntry {
    readonly scene: Scene;
    update(): void;
    syncVisibility(): void;
    clear(): void;
    readonly isEnabled: boolean;
    readonly props: Record<string, any>;
    setProps(props: Record<string, any>): void;
}

export class DebugHelper {
    readonly ctx: WebGLContext;
    readonly parent: Scene;

    private readonly entries = new Map<string, DebugHelperEntry>();

    constructor(ctx: WebGLContext, parent: Scene) {
        this.ctx = ctx;
        this.parent = parent;
    }

    register(name: string, entry: DebugHelperEntry) {
        this.entries.set(name, entry);
    }

    unregister(name: string) {
        const entry = this.entries.get(name);
        if (entry) {
            entry.clear();
            this.entries.delete(name);
        }
    }

    get scenes(): Scene[] {
        const result: Scene[] = [];
        this.entries.forEach(entry => {
            result.push(entry.scene);
        });
        return result;
    }

    update() {
        this.entries.forEach(entry => {
            if (entry.isEnabled) entry.update();
        });
    }

    syncVisibility() {
        this.entries.forEach(entry => {
            entry.syncVisibility();
        });
    }

    clear() {
        this.entries.forEach(entry => {
            entry.clear();
        });
    }

    get isEnabled() {
        let enabled = false;
        this.entries.forEach(entry => {
            if (entry.isEnabled) enabled = true;
        });
        return enabled;
    }

    setProps(props: Record<string, any>) {
        this.entries.forEach(entry => {
            entry.setProps(props);
        });
    }
}
