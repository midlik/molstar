import * as fs from 'fs';
import { default as createGLContext } from 'gl';
import { PNG } from 'pngjs';

import { Canvas3D, Canvas3DContext, Canvas3DProps, DefaultCanvas3DParams } from '../../mol-canvas3d/canvas3d';
import { ImagePass, ImageProps } from '../../mol-canvas3d/passes/image';
import { Passes } from '../../mol-canvas3d/passes/passes';
import { PostprocessingParams, PostprocessingProps } from '../../mol-canvas3d/passes/postprocessing';
import { createContext, WebGLContext } from '../../mol-gl/webgl/context';
import { AssetManager } from '../../mol-util/assets';
import { ColorNames } from '../../mol-util/color/names';
import { PixelData } from '../../mol-util/image';
import { InputObserver } from '../../mol-util/input/input-observer';
import { ParamDefinition } from '../../mol-util/param-definition';


type ImageRendererOptions = {
    webgl?: WebGLContextAttributes,
    canvas?: Partial<Canvas3DProps>,
    imagePass?: Partial<ImageProps>,
}


export class ImageRenderer {
    readonly webgl: WebGLContext;
    readonly canvas3d: Canvas3D;
    readonly imagePass: ImagePass;

    constructor(readonly canvasSize: { width: number, height: number }, options?: ImageRendererOptions) {
        // TODO add optional param canvas3d?
        const glContext = createGLContext(this.canvasSize.width, this.canvasSize.height, options?.webgl ?? defaultWebGLAttributes());
        this.webgl = createContext(glContext);

        const input = InputObserver.create();
        const attribs = { ...Canvas3DContext.DefaultAttribs };
        const passes = new Passes(this.webgl, new AssetManager(), attribs);
        this.canvas3d = Canvas3D.create({ webgl: this.webgl, input, passes, attribs } as Canvas3DContext, options?.canvas ?? defaultCanvas3DParams());

        this.imagePass = this.canvas3d.getImagePass(options?.imagePass ?? defaultImagePassParams());
        this.imagePass.setSize(this.canvasSize.width, this.canvasSize.height);
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

    async createImage(outPath: string, imageSize?: { width: number, height: number }, postprocessing?: Partial<PostprocessingProps>) {
        const width = imageSize?.width ?? this.canvasSize.width;
        const height = imageSize?.height ?? this.canvasSize.height;

        this.canvas3d.commit(true);

        this.imagePass.setProps({
            postprocessing: ParamDefinition.merge(PostprocessingParams, this.canvas3d.props.postprocessing, postprocessing),
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

export function defaultCanvas3DParams(): Partial<Canvas3DProps> {
    return {
        camera: {
            mode: 'orthographic',
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
    };
}

export function defaultWebGLAttributes(): WebGLContextAttributes {
    return {
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: true, // the renderer requires an alpha channel
        depth: true, // the renderer requires a depth buffer
        premultipliedAlpha: true, // the renderer outputs PMA
    };
}

export function defaultImagePassParams(): Partial<ImageProps> {
    return {
        cameraHelper: {
            axes: { name: 'off', params: {} },
        },
        multiSample: {
            mode: 'on',
            sampleLevel: 4
        }
    };
}

export const STYLIZED_POSTPROCESSING: Partial<PostprocessingProps> = {
    occlusion: {
        name: 'on' as const, params: {
            samples: 32,
            radius: 5,
            bias: 0.8,
            blurKernelSize: 15,
            resolutionScale: 1,
        }
    }, outline: {
        name: 'on' as const, params: {
            scale: 1,
            threshold: 0.95,
            color: ColorNames.black,
            includeTransparent: true,
        }
    }
};
