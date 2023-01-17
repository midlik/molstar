import { default as createGLContext } from 'gl';
import * as fs from 'fs';
import { PNG } from 'pngjs';

import { Canvas3D, Canvas3DContext, DefaultCanvas3DParams } from "../../mol-canvas3d/canvas3d";
import { ImagePass } from "../../mol-canvas3d/passes/image";
import { RepresentationContext } from "../../mol-repr/representation";
import { AssetManager } from "../../mol-util/assets";
import { createContext, WebGLContext } from '../../mol-gl/webgl/context';
import { InputObserver } from '../../mol-util/input/input-observer';
import { Passes } from '../../mol-canvas3d/passes/passes';
import { ColorNames } from '../../mol-util/color/names';
import { ColorTheme } from '../../mol-theme/color';
import { PLDDTConfidenceColorThemeProvider } from '../../extensions/model-archive/quality-assessment/color/plddt';
import { SizeTheme } from '../../mol-theme/size';
import { PixelData } from '../../mol-util/image';


// This is mostly stolen from molrender project 

export enum StructureSize { Big, Medium, Small }

export class ImageRenderer {
    webgl: WebGLContext;
    canvas3d: Canvas3D;
    imagePass: ImagePass;
    assetManager = new AssetManager();

    constructor(private width: number, private height: number, private format: 'png' | 'jpeg', private plddt: 'on' | 'single-chain' | 'off') {
        this.webgl = createContext(createGLContext(this.width, this.height, {
            antialias: true,
            preserveDrawingBuffer: true,
            alpha: true, // the renderer requires an alpha channel
            depth: true, // the renderer requires a depth buffer
            premultipliedAlpha: true, // the renderer outputs PMA
        }));
        const input = InputObserver.create();
        const attribs = { ...Canvas3DContext.DefaultAttribs };
        const passes = new Passes(this.webgl, this.assetManager, attribs);

        this.canvas3d = Canvas3D.create({ webgl: this.webgl, input, passes, attribs } as Canvas3DContext, {
            camera: {
                mode: 'orthographic',
                // mode: 'perspective',
                helper: {
                    axes: { name: 'off', params: {} }
                },
                stereo: {
                    name: 'off', params: {}
                },
                fov: 90,
                manualReset: true
            },
            cameraFog: {
                name: 'on',
                params: {
                    intensity: 50
                }
            },
            renderer: {
                ...DefaultCanvas3DParams.renderer,
                backgroundColor: ColorNames.white,
            },
            postprocessing: {
                occlusion: {
                    name: 'off', params: {}
                },
                outline: {
                    name: 'off', params: {}
                },
                antialiasing: {
                    name: 'fxaa',
                    params: {
                        edgeThresholdMin: 0.0312,
                        edgeThresholdMax: 0.063,
                        iterations: 12,
                        subpixelQuality: 0.3
                    }
                },
                background: { variant: { name: 'off', params: {} } },
                shadow: { name: 'off', params: {} },
            }
        });
        this.imagePass = this.canvas3d.getImagePass({
            cameraHelper: {
                axes: { name: 'off', params: {} }
            },
            multiSample: {
                mode: 'on',
                sampleLevel: 4
            }
        });
        this.imagePass.setSize(this.width, this.height);

        const colorThemeRegistry = ColorTheme.createRegistry();
        colorThemeRegistry.add(PLDDTConfidenceColorThemeProvider);
    }

    getImageData(width: number, height: number) {
        this.imagePass.setSize(width, height);
        this.imagePass.render();
        this.imagePass.colorTarget.bind();

        const array = new Uint8Array(width * height * 4);
        this.webgl.readPixels(0, 0, width, height, array);
        const pixelData = PixelData.create(array, width, height);
        PixelData.flipY(pixelData);
        PixelData.divideByAlpha(pixelData);
        // ImageData is not defined in Node
        return { data: new Uint8ClampedArray(array), width, height };
    }

    async createImage(outPath: string, size: StructureSize, imageSize?: [number, number]) {
        const width = imageSize?.[0] ?? this.width;
        const height = imageSize?.[1] ?? this.height;
        const occlusion = size === StructureSize.Big ? {
            name: 'on' as const, params: {
                samples: 32,
                radius: 5,
                bias: 0.8,
                blurKernelSize: 15,
                resolutionScale: 1,
            }
        } : { name: 'off' as const, params: {} };
        const outline = size === StructureSize.Big ? {
            name: 'on' as const, params: {
                scale: 1,
                threshold: 0.95,
                color: ColorNames.black,
                includeTransparent: true,
            }
        } : { name: 'off' as const, params: {} };

        this.canvas3d.commit(true);

        this.imagePass.setProps({
            postprocessing: {
                ...this.canvas3d.props.postprocessing,
                outline,
                occlusion
            }
        });

        const imageData = this.getImageData(width, height);

        const generatedPng = new PNG({ width, height });
        generatedPng.data = Buffer.from(imageData.data.buffer);
        await writePngFile(generatedPng, outPath);
    }
}

async function writePngFile(png: PNG, outPath: string) {
    await new Promise<void>(resolve => {
        png.pack().pipe(fs.createWriteStream(outPath)).on('finish', resolve);
    });
}
