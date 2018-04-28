import { Device, GPUProgram, GPUVertexState, GPUBuffer, BufferUsageHint, VertexAttributeDataType, GPUTexture, TextureFormat, TextureDataType, TextureMagFilter, TextureMinFilter, TextureWrapMode, ColorSpaceConversion, TextureUsageHint } from "../../rendering/Device";
import { SharedResources } from "./SharedResources";
import { DrawContext, DrawMode, BlendMode } from "../../rendering/Renderer";
import { Object2D } from "./Object2D";
import GPUText, { GPUTextFont, GlyphLayout, ResourceReference } from "../../../lib/gputext/GPUText";
import { ReactObjectContainer } from "./ReactObject";

/**
 * Text
 *
 * Todo:
 * - Glow and shadow
 * - Bake color into verticies
 * - Vertex index buffer
 */
export class Text extends Object2D {

    set string(v: string) {
        this._string = v;
        this.updateGlyphLayout();
    }
    get string() {
        return this._string;
    }

    set fontPath(v: string) {
        this._fontPath = v;
        this.updateFontPath();
    }
    get fontPath() {
        return this._fontPath;
    }

    set fontSizePx(v: number) {
        this._fontSizePx = v;
        this.updateGlyphLayout();
    }
    get fontSizePx() {
        return this._fontSizePx;
    }

    color: Float32Array = new Float32Array([0, 0, 0, 1]);

    protected _fontSizePx: number;
    protected _fontPath: string;
    protected _fontAsset: FontAsset;
    protected _glyphLayout: GlyphLayout;
    protected _glyphScale: number;

    protected _string: string;

    protected _kerningEnabled = true;
    protected _ligaturesEnabled = true;
    protected _lineHeight = 1.0;

    // text-specific gpu resources
    protected gpuVertexBuffer: GPUBuffer;
    protected glyphAtlas: GPUTexture = null;
    protected vertexCount = 0;

    constructor(fontPath: string, string?: string, fontSizePx: number = 16) {
        super();
        this.blendMode = BlendMode.PREMULTIPLIED_ALPHA;

        // cannot allocate GPU resource until font asset is available
        this.gpuResourcesNeedAllocate = false;

        this._fontSizePx = fontSizePx;
        this.fontPath = fontPath;
        this.string = string;
    }

    allocateGPUResources(device: Device) {
        let programNeedsUpdate = false;

        if (this.gpuProgram == null || programNeedsUpdate) {
            this.gpuProgram = SharedResources.getProgram(
                device,
                `
                #version 100

                precision mediump float;

                attribute vec2 position;
                attribute vec3 uv;

                uniform mat4 transform;
                uniform float fieldRange;
                uniform vec2 viewportSize;
                uniform float glyphScale;

                varying vec2 vUv;
                varying float vFieldRangeDisplay_px;

                void main() {
                    vUv = uv.xy;

                    // determine the field range in pixels when drawn to the framebuffer
                    vec2 scale = abs(vec2(transform[0][0], transform[1][1])) * glyphScale;
                    float atlasScale = uv.z;
                    vFieldRangeDisplay_px = fieldRange * scale.y * (viewportSize.y * 0.5) / atlasScale;
                    vFieldRangeDisplay_px = max(vFieldRangeDisplay_px, 1.0);

                    // flip-y axis
                    gl_Position = transform * vec4(vec2(position.x, -position.y) * glyphScale, 0.0, 1.0);
                }
                `,
                `
                #version 100

                precision mediump float;

                uniform vec4 color;
                uniform sampler2D glyphAtlas;

                uniform mat4 transform;

                varying vec2 vUv;
                varying float vFieldRangeDisplay_px;

                float median(float r, float g, float b) {
                    return max(min(r, g), min(max(r, g), b));
                }

                void main() {
                    vec3 sample = texture2D(glyphAtlas, vUv).rgb;

                    float sigDist = median(sample.r, sample.g, sample.b);

                    // spread field range over 1px for antialiasing
                    sigDist = clamp((sigDist - 0.5) * vFieldRangeDisplay_px + 0.5, 0.0, 1.0);

                    float alpha = sigDist;

                    gl_FragColor = color * alpha;
                }
                `,
                ['position', 'uv']
            );
        }

        // initialize atlas texture if not already created
        let textureKey = this._fontAsset.descriptor.metadata.postScriptName;
        // only support for 1 glyph page at the moment
        let mipmapsProvided = this._fontAsset.images[0].length > 1;
        this.glyphAtlas = SharedResources.getTexture(device, textureKey, {
            format: TextureFormat.RGBA,
            generateMipmaps: !mipmapsProvided,

            mipmapData: this._fontAsset.images[0],
            dataType: TextureDataType.UNSIGNED_BYTE,

            usageHint: TextureUsageHint.HIGH_USAGE,

            samplingParameters: {
                magFilter: TextureMagFilter.LINEAR,
                minFilter: mipmapsProvided ? TextureMinFilter.LINEAR_MIPMAP_LINEAR : TextureMinFilter.LINEAR,
                wrapS: TextureWrapMode.CLAMP_TO_EDGE,
                wrapT: TextureWrapMode.CLAMP_TO_EDGE,
            },

            pixelStorage: {
                flipY: false,
                premultiplyAlpha: false,
                colorSpaceConversion: ColorSpaceConversion.NONE,
            }
        });

        // re-create text vertex buffer
        let vertexData = GPUText.generateVertexData(this._glyphLayout);

        this.vertexCount = vertexData.vertexCount;

        this.gpuVertexBuffer = device.createBuffer({
            data: vertexData.vertexArray,
            usageHint: BufferUsageHint.STATIC
        });

        // re-create text vertex state
        this.gpuVertexState = device.createVertexState({
            attributes: [
                // position
                {
                    buffer: this.gpuVertexBuffer,
                    size: vertexData.vertexLayout.position.elements,
                    dataType: VertexAttributeDataType.FLOAT,
                    offsetBytes: vertexData.vertexLayout.position.offsetBytes,
                    strideBytes: vertexData.vertexLayout.position.strideBytes,
                    normalize: false,
                },
                // uv
                {
                    buffer: this.gpuVertexBuffer,
                    size: vertexData.vertexLayout.uv.elements,
                    dataType: VertexAttributeDataType.FLOAT,
                    offsetBytes: vertexData.vertexLayout.uv.offsetBytes,
                    strideBytes: vertexData.vertexLayout.uv.strideBytes,
                    normalize: false,
                }
            ]
        });
    }

    releaseGPUResources() {
        if (this.gpuVertexState != null) {
            this.gpuVertexState.delete();
            this.gpuVertexState = null;
        }

        if (this.gpuVertexBuffer != null) {
            this.gpuVertexBuffer.delete();
            this.gpuVertexBuffer = null;
        }

        this.vertexCount = 0;
    }

    draw(context: DrawContext) {
        // renderPass/shader
        context.uniform2f('viewportSize', context.viewport.w, context.viewport.h);

        // font
        context.uniform1f('fieldRange', this._fontAsset.descriptor.fieldRange_px);
        context.uniformTexture2D('glyphAtlas', this.glyphAtlas);

        // text instance
        context.uniform1f('glyphScale', this._glyphLayout.glyphScale);
        context.uniform4fv('color', this.color);
        context.uniformMatrix4fv('transform', false, this.worldTransformMat4);

        context.draw(DrawMode.TRIANGLES, this.vertexCount, 0);
    }

    protected updateFontPath() {
        Text.getFontAsset(this._fontPath, (asset) => {
            this._fontAsset = asset;
            this.updateGlyphLayout();
        });
    }

    protected updateGlyphLayout() {
        let glyphLayoutChanged = false;

        if (this._string != null && this._fontAsset != null) {
            // generate glyphScale from css font-size px
            // in browsers, font-size corresponds to the difference between typoAscender and typoDescender
            let font = this._fontAsset.descriptor;
            let typoDelta = font.typoAscender - font.typoDescender;
            this._glyphScale = this._fontSizePx / typoDelta;

            // @! performance improvement:
            // if only the _glyphScale changed they we can avoid GPU realloc by just changing this._glyphLayout.glyphScale

            this._glyphLayout = GPUText.layout(
                this._string,
                this._fontAsset.descriptor,
                {
                    glyphScale: this._glyphScale,
                    lineHeight: this._lineHeight,
                    ligaturesEnabled: this._ligaturesEnabled,
                    kerningEnabled: this._kerningEnabled,
                }
            );

            this.w = (this._glyphLayout.bounds.r - this._glyphLayout.bounds.l) * this._glyphLayout.glyphScale;
            this.h = (this._glyphLayout.bounds.b - this._glyphLayout.bounds.t) * this._glyphLayout.glyphScale;

            glyphLayoutChanged = true;
        } else {
            glyphLayoutChanged = this._glyphLayout !== null;

            this._glyphLayout = null;
            this._glyphScale = 1;
            this.w = 0;
            this.h = 0;
        }

        this.render = this._string != null && this._glyphLayout != null;

        // if the vertex data has changed, we need to reallocate the GPU resources
        this.gpuResourcesNeedAllocate = glyphLayoutChanged;

        if (this.gpuResourcesNeedAllocate) {
            this.releaseGPUResources();
        }
    }

    // Font loading and caching
    static getFontAsset(path: string, onReady: (asset: FontAsset) => void, onError?: (msg: string) => void) {
        let promise = Text.fontMap[path];

        if (promise == null) {
            promise = Text.fontMap[path] = new Promise<FontAsset>((resolve, reject) => {
                // parse path
                let directory = path.substr(0, path.lastIndexOf('/'));
                let ext = path.substr(path.lastIndexOf('.') + 1).toLowerCase();
                let jsonFormat = ext === 'json';

                let descriptor: GPUTextFont;
                let images = new Array<Array<HTMLImageElement>>();

                let complete = false;

                loadDescriptor(path);

                function tryComplete() {
                    for (let page of images) {
                        for (let mip of page) {
                            if (!mip.complete) return;
                        }
                    }

                    if (descriptor == null) return;

                    if (complete) return;

                    resolve({
                        descriptor: descriptor,
                        images: images
                    });

                    complete = true;
                }

                function loadDescriptor(path: string) {
                    let req = new XMLHttpRequest();
                    req.open('GET', path);
                    req.responseType = jsonFormat ? 'json' : 'arraybuffer';
                    req.onerror = (e) => reject(`Could not load font ${path}`);
                    req.onload = (e) => {
                        descriptor = jsonFormat ? req.response : parseDescriptorBuffer(req.response);

                        if (descriptor == null) {
                            reject(`Failed to parse font`);
                            return;
                        }

                        if (descriptor.textures.length > 1) {
                            console.warn('Multiple-page glyph atlases are not yet supported');
                        }

                        loadImages(descriptor.textures);
                        tryComplete();
                    }
                    req.send();
                }

                function loadImages(pages: Array<Array<{ localPath: string } | HTMLImageElement>>) {
                    for (let i = 0; i < pages.length; i++) {
                        let page = pages[i];
                        images[i] = new Array<HTMLImageElement>();

                        for (let j = 0; j < page.length; j++) {
                            let mipResource = page[j];

                            let image: HTMLImageElement;
                            if (mipResource instanceof HTMLImageElement) {
                                image = mipResource;
                            } else {
                                image = new Image();
                                image.src = directory + '/' + mipResource.localPath;
                            }

                            image.onload = tryComplete;
                            images[i][j] = image;
                        }
                    }

                    tryComplete();
                }

                function parseDescriptorBuffer(buffer: ArrayBuffer): GPUTextFont {
                    try {
                        return GPUText.parse(buffer);
                    } catch (e) {
                        reject(`Error parsing binary GPUText file: ${e}`);
                        return null;
                    }
                }

            });
        }

        promise.catch(onError).then(onReady);
    }

    protected static fontMap: {
        [path: string]: Promise<FontAsset>
    } = {};

}

type FontAsset = {
    descriptor: GPUTextFont,
    images: Array<Array<HTMLImageElement>>
}

export default Text;