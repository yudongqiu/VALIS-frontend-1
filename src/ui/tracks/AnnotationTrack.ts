import { Strand } from "gff3/Strand";
import { GeneClass, TranscriptClass } from "sirius/AnnotationTileset";
import UsageCache from "../../ds/UsageCache";
import { Scalar } from "../../math/Scalar";
import { AnnotationTileStore, Gene, MacroAnnotationTileStore, Transcript } from "../../model/data-store/AnnotationTileStore";
import SharedTileStore from "../../model/data-store/SharedTileStores";
import { TileState } from "../../model/data-store/TileStore";
import TrackModel from "../../model/TrackModel";
import GPUDevice, { AttributeLayout, AttributeType, VertexAttributeBuffer } from "../../rendering/GPUDevice";
import { BlendMode, DrawContext, DrawMode } from "../../rendering/Renderer";
import InstancingBase from "../core/InstancingBase";
import Object2D from "../core/Object2D";
import { Rect } from "../core/Rect";
import SharedResources from "../core/SharedResources";
import Text from "../core/Text";
import { OpenSansRegular } from "../font/Fonts";
import TrackRow from "../TrackRow";
import Track from "./Track";

/**
 * WIP Annotation tracks:
 * 
 * Todo:
 * - Convert micro-scale annotations to use instancing (and text batching)
 * - Merge shaders where possible and clean up
 */
export class AnnotationTrack extends Track<'annotation'> {

    protected readonly macroLodBlendRange = 2;
    protected readonly macroLodThresholdLow = 10;
    protected readonly macroLodThresholdHigh = this.macroLodThresholdLow + this.macroLodBlendRange;

    protected readonly namesLodBlendRange = 2;
    protected readonly namesLodThresholdLow = 9;
    protected readonly namesLodThresholdHigh = this.namesLodThresholdLow + this.namesLodBlendRange;

    protected annotationStore: AnnotationTileStore;
    protected macroAnnotationStore: AnnotationTileStore;
    protected yScrollNode: Object2D;
    protected dragEnabled: boolean;

    constructor(model: TrackModel<'annotation'>) {
        super(model);
        
        this.annotationStore = SharedTileStore.getTileStore(
            'annotation',
            model.sequenceId,
            () => { return new AnnotationTileStore(model.sequenceId); }
        );
        this.macroAnnotationStore = SharedTileStore.getTileStore(
            'macroAnnotation',
            model.sequenceId,
            () => { return new MacroAnnotationTileStore(model.sequenceId); }
        );

        this.yScrollNode = new Object2D();
        this.yScrollNode.z = 0;
        this.yScrollNode.layoutW = 1;
        this.add(this.yScrollNode);
        
        this.color.set([0.1, 0.1, 0.1, 1]);

        this.initializeYDrag();
    }


    private _lastComputedHeight: number;
    applyTransformToSubNodes(root?: boolean) {
        const h = this.getComputedHeight();
        if (h !== this._lastComputedHeight) {
            this.dragEnabled = (h >= (TrackRow.expandedTrackHeight - 10));
            if (!this.dragEnabled) this.yScrollNode.y = 0;
        }
        super.applyTransformToSubNodes(root);
    }

    protected initializeYDrag() {
        // scroll follows the primary pointer only
        let pointerY0 = 0;
        let scrollY0 = 0;
        
        this.addInteractionListener('dragstart', (e) => {
            if (!e.isPrimary) return;
            if (!this.dragEnabled) return;
            if (e.buttonState !== 1) return;
            pointerY0 = e.localY;
            scrollY0 = this.yScrollNode.y;
        });

        this.addInteractionListener('dragmove', (e) => {
            if (!e.isPrimary) return;
            if (e.buttonState !== 1) return;
            if (!this.dragEnabled) return;
            let dy = pointerY0 - e.localY;
            this.yScrollNode.y = Math.min(scrollY0 - dy, 0);
        });
    }

    protected _macroTileCache = new UsageCache<MacroGeneInstances>();
    protected _annotationCache = new UsageCache<Object2D>();
    protected _onStageAnnotations = new UsageCache<Object2D>();
    protected updateDisplay() {
        this._pendingTiles.markAllUnused();
        this._onStageAnnotations.markAllUnused();

        const x0 = this.x0;
        const x1 = this.x1;
        const span = x1 - x0;
        const widthPx = this.getComputedWidth();

        if (widthPx > 0) {
            let basePairsPerDOMPixel = (span / widthPx);
            let continuousLodLevel = Scalar.log2(Math.max(basePairsPerDOMPixel, 1));

            let macroOpacity: number = Scalar.linstep(this.macroLodThresholdLow, this.macroLodThresholdHigh, continuousLodLevel);
            let microOpacity: number = 1.0 - macroOpacity;
            
            if (microOpacity > 0) {
                this.updateMicroAnnotations(x0, x1, span, basePairsPerDOMPixel, continuousLodLevel, microOpacity);
            }

            if (macroOpacity > 0) {
                this.macroAnnotationStore.getTiles(x0, x1, basePairsPerDOMPixel, true, (tile) => {
                    if (tile.state !== TileState.Complete) {
                        // if the tile is incomplete then wait until complete and call updateAnnotations() again
                        this._pendingTiles.get(tile.key, () => this.createTileLoadingDependency(tile));
                        return;
                    }

                    /** Instance Rendering */
                    let tileObject = this._macroTileCache.get(tile.key, () => {
                        // initialize macro gene instances
                        // create array of gene annotation data
                        let instanceData = new Array<MacroGeneInstance>();
                        let nonCodingColor = [82 / 0xff, 75 / 0xff, 165 / 0xff, 0.4];
                        let codingColor = [26 / 0xff, 174/0xff, 222/0xff, 0.4];

                        for (let gene of tile.payload) {
                            if (gene.strand !== this.model.strand) continue;

                            let color = gene.class === GeneClass.NonProteinCoding ? nonCodingColor : codingColor;
                            let height = gene.transcriptCount * 20 + (gene.transcriptCount - 1) * 10 + 60;

                            instanceData.push({
                                xFractional: (gene.startIndex - tile.x) / tile.span,
                                y: 0,
                                z: 0,
                                wFractional: gene.length / tile.span,
                                h: height,
                                color: color,
                            });
                        }
                        
                        let geneInstances = new MacroGeneInstances(instanceData);
                        geneInstances.y = 0;
                        geneInstances.z = 0.75;
                        geneInstances.mask = this;
                        return geneInstances;
                    });

                    tileObject.layoutParentX = (tile.x - x0) / span;
                    tileObject.layoutW = tile.span / span;
                    tileObject.opacity = macroOpacity;

                    this._onStageAnnotations.get('macro-gene-tile:' + tile.key, () => {
                        this.addAnnotation(tileObject);
                        return tileObject;
                    });
                    /**/
                });
            }
        }

        this._pendingTiles.removeUnused(this.deleteTileLoadingDependency);
        this._onStageAnnotations.removeUnused(this.removeAnnotation);

        this.toggleLoadingIndicator(this._pendingTiles.count > 0, true);
        this.displayNeedUpdate = false;
    }

    protected updateMicroAnnotations(x0: number, x1: number, span: number, samplingDensity: number, continuousLodLevel: number,  opacity: number) {
        
        let namesOpacity = 1.0 - Scalar.linstep(this.namesLodThresholdLow, this.namesLodThresholdHigh, continuousLodLevel);

        this.annotationStore.getTiles(x0, x1, samplingDensity, true, (tile) => {
            if (tile.state !== TileState.Complete) {
                // if the tile is incomplete then wait until complete and call updateAnnotations() again
                this._pendingTiles.get(tile.key, () => this.createTileLoadingDependency(tile));
                return;
            }
        
            for (let gene of tile.payload) {
                // @! temp performance hack, only use node when visible
                // (don't need to do this when using instancing)
                { if (!(gene.startIndex <= x1 && (gene.startIndex + gene.length) >= x0)) continue; }

                // apply gene filter
                if (gene.strand !== this.model.strand) continue;

                let annotationKey = this.annotationKey(gene);

                let annotation = this._annotationCache.get(annotationKey, () => {
                    // create
                    let object = new GeneAnnotation(gene);
                    object.y = 40;
                    object.layoutH = 0;
                    object.z = 1 / 4;
                    object.mask = this;
                    object.forEachSubNode((sub) => sub.mask = this);
                    return object;
                });

                (annotation as GeneAnnotation).nameOpacity = namesOpacity;

                this._onStageAnnotations.get(annotationKey, () => {
                    this.addAnnotation(annotation);
                    return annotation;
                });

                annotation.layoutParentX = (gene.startIndex - x0) / span;
                annotation.layoutW = (gene.length) / span;
                annotation.opacity = opacity;
            }
        });
    }

    protected createGeneAnnotation = (gene: Gene) => {
        return new GeneAnnotation(gene);
    }

    protected addAnnotation = (annotation: Object2D) => {
        this.yScrollNode.add(annotation);
    }

    protected removeAnnotation = (annotation: Object2D) => {
        this.yScrollNode.remove(annotation);
    }

    protected deleteAnnotation = (annotation: Object2D) => {
        annotation.releaseGPUResources();
        annotation.forEachSubNode((sub) => {
            sub.releaseGPUResources();
        });
    }

    protected annotationKey = (feature: {
        soClass: string | number,
        name?: string,
        startIndex: number,
        length: number,
    }) => {
        return feature.soClass + '\x1F' + feature.name + '\x1F' + feature.startIndex + '\x1F' + feature.length;
    }    

}

class LoadingIndicator extends Text {

    constructor() {
        super(OpenSansRegular, 'Loading', 12, [1, 1, 1, 1]);
    }

}

type MacroGeneInstance = {
    xFractional: number, y: number, z: number,
    wFractional: number, h: number,
    color: Array<number>,
};

class MacroGeneInstances extends InstancingBase<MacroGeneInstance> {

    constructor(instances: Array<MacroGeneInstance>) {
        super(
            instances,
            [
                { name: 'position', type: AttributeType.VEC2 }
            ],
            [
                { name: 'instancePosition', type: AttributeType.VEC3 },
                { name: 'instanceSize', type: AttributeType.VEC2 },
                { name: 'instanceColor', type: AttributeType.VEC4 },
            ],
            {
                'instancePosition': (inst: MacroGeneInstance) => [inst.xFractional, inst.y, inst.z],
                'instanceSize': (inst: MacroGeneInstance) => [inst.wFractional, inst.h],
                'instanceColor': (inst: MacroGeneInstance) => inst.color,
            }
        );

        this.transparent = true;
        this.blendMode = BlendMode.PREMULTIPLIED_ALPHA;
    }

    draw(context: DrawContext) {
        context.uniform2f('groupSize', this.computedWidth, this.computedHeight);
        context.uniform1f('groupOpacity', this.opacity);
        context.uniformMatrix4fv('groupModel', false, this.worldTransformMat4);
        context.extDrawInstanced(DrawMode.TRIANGLES, 6, 0, this.instanceCount);
    }

    protected allocateGPUVertexState(
        device: GPUDevice,
        attributeLayout: AttributeLayout,
        instanceVertexAttributes: { [name: string]: VertexAttributeBuffer }
    ) {
        return device.createVertexState({
            index: SharedResources.quadIndexBuffer,
            attributeLayout: attributeLayout,
            attributes: {
                // vertices
                'position': {
                    buffer: SharedResources.quad1x1VertexBuffer,
                    offsetBytes: 0,
                    strideBytes: 2 * 4,
                },
                ...instanceVertexAttributes
            }
        });
    }

    protected getVertexCode() {
        return `
            #version 100

            // for all instances
            attribute vec2 position;
            uniform mat4 groupModel;
            uniform vec2 groupSize;
            
            // per instance attributes
            attribute vec3 instancePosition;
            attribute vec2 instanceSize;
            attribute vec4 instanceColor;

            varying vec2 vUv;

            varying vec2 size;
            varying vec4 color;

            void main() {
                vUv = position;
                
                // yz are absolute domPx units, x is in fractions of groupSize
                vec3 pos = vec3(groupSize.x * instancePosition.x, instancePosition.yz);
                size = vec2(groupSize.x * instanceSize.x, instanceSize.y);

                color = instanceColor;

                gl_Position = groupModel * vec4(vec3(position * size, 0.0) + pos, 1.0);
            }
        `;
    }

    protected getFragmentCode() {
        return `
            #version 100

            precision highp float;

            uniform float groupOpacity;

            varying vec2 size;
            varying vec4 color;

            varying vec2 vUv;
            
            void main() {
                const float blendFactor = 0.0; // full additive blending

                vec2 domPx = vUv * size;
            
                const vec2 borderWidthPx = vec2(1.);
                const float borderStrength = 0.3;

                vec2 inner = step(borderWidthPx, domPx) * step(domPx, size - borderWidthPx);
                float border = inner.x * inner.y;

                vec4 c = color;
                c.rgb += (1.0 - border) * vec3(borderStrength);

                gl_FragColor = vec4(c.rgb, blendFactor) * c.a * groupOpacity;
            }
        `;
    }

}

class GeneAnnotation extends Object2D {

    set opacity(v: number) {
        this._opacity = v;
        for (let child of this.children) {
            child.opacity = v;
        }
    }
    get opacity() {
        return this._opacity;
    }

    set nameOpacity(v: number) {
        this.name.color[3] = v;
        this.name.visible = v >= 0;
    }

    get nameOpacity() {
        return this.name.color[3];
    }

    protected name: Text;
    protected _opacity: number = 1;

    constructor(protected readonly gene: Gene) {
        super();

        let spanMarker = new TranscriptSpan(gene.strand);
        spanMarker.color.set([138 / 0xFF, 136 / 0xFF, 191 / 0xFF, 0.38]);
        spanMarker.layoutW = 1;
        spanMarker.h = 10;
        spanMarker.blendMode = BlendMode.PREMULTIPLIED_ALPHA;
        spanMarker.transparent = true;
        this.add(spanMarker);

        devColorFromElement('gene', spanMarker.color);
        
        this.name = new Text(OpenSansRegular, gene.name, 16, [1, 1, 1, 1]);
        this.name.layoutY = -1;
        this.name.y = -5;
        this.add(this.name);

        let transcriptOffset = 20;
        let transcriptHeight = 20;
        let transcriptSpacing = 10;
        
        for (let i = 0; i < gene.transcripts.length; i++) {
            let transcript = gene.transcripts[i];

            let transcriptAnnotation = new TranscriptAnnotation(transcript, gene.strand);
            transcriptAnnotation.h = transcriptHeight;
            transcriptAnnotation.y = i * (transcriptHeight + transcriptSpacing) + transcriptOffset;

            transcriptAnnotation.layoutParentX = (transcript.startIndex - gene.startIndex) / gene.length;
            transcriptAnnotation.layoutW = transcript.length / gene.length;

            this.add(transcriptAnnotation);
        }
    }

}

class TranscriptAnnotation extends Object2D {

    set opacity(v: number) {
        this._opacity = v;
        for (let child of this.children) {
            child.opacity = v;
        }
    }
    get opacity() {
        return this._opacity;
    }

    protected _opacity: number = 1;

    constructor(protected readonly transcript: Transcript, strand: Strand) {
        super();

        let transcriptColor = {
            [TranscriptClass.Unspecified]: [0.5, 0.5, 0.5, 0.25],
            [TranscriptClass.ProteinCoding]: [1, 0, 1, 0.25],
            [TranscriptClass.NonProteinCoding]: [0, 1, 1, 0.25],
        }

        /**/
        let spanMarker = new TranscriptSpan(strand);
        spanMarker.color.set([138 / 0xFF, 136 / 0xFF, 191 / 0xFF, 0.38 * 0.5]);
        spanMarker.h = 10;
        spanMarker.layoutW = 1;
        spanMarker.layoutY = -0.5;
        spanMarker.layoutParentY = 0.5;
        spanMarker.z = 0.0;
        spanMarker.transparent = true;
        spanMarker.blendMode = BlendMode.PREMULTIPLIED_ALPHA;
        this.add(spanMarker);
        /**/

        // create exons
        for (let exonInfo of transcript.exon) {
            let exon = new Exon();
            exon.z = 0.25;
            exon.layoutH = 1;
            exon.layoutParentX = (exonInfo.startIndex - transcript.startIndex) / transcript.length;
            exon.layoutW = exonInfo.length / transcript.length;
            this.add(exon);
        }

        // create untranslated regions
        for (let utrInfo of transcript.utr) {
            let utr = new UTR();
            utr.z = 0.5;
            utr.layoutH = 1;
            utr.layoutParentX = (utrInfo.startIndex - transcript.startIndex) / transcript.length;
            utr.layoutW = utrInfo.length / transcript.length;
            this.add(utr);
        }

        // create protein coding sequences
        // ! assuming CDS array is sorted from startIndex

        let reverse = strand === Strand.Negative;
        let mRnaIndex = 0; // track offset within RNA sequence after splicing
        for (let k = 0; k < transcript.cds.length; k++) {
            // if on negative strand, iterate in reverse
            let i = reverse ? ((transcript.cds.length - 1) - k) : k;

            let cdsInfo = transcript.cds[i];

            let cds = new CDS(cdsInfo.length, cdsInfo.phase, strand, mRnaIndex);

            cds.z = 0.75;
            cds.layoutH = 1;
            cds.layoutParentX = (cdsInfo.startIndex - transcript.startIndex) / transcript.length;
            cds.layoutW = cdsInfo.length / transcript.length;
            this.add(cds);

            mRnaIndex += cdsInfo.length;
        }

    }

}

//@! quick dev-time hack
function devColorFromElement(id: string, colorArray: Float32Array) {
    let target = document.getElementById(id);

    let updateColor = () => {
        let cssColor = target.style.color;
        let result = cssColor.match(/\w+\((\d+), (\d+), (\d+)(, ([\d.]+))?\)/);
        if (result == null) {
            console.warn('Could not parse css color', cssColor);
            return;
        }
        let rgb = result.slice(1, 4).map(v => parseFloat(v) / 255);
        let a = result[5] ? parseFloat(result[5]) : 1.0;
        colorArray.set(rgb);
        colorArray[3] = a;
    }

    updateColor();

    let observer = new MutationObserver((mutations) => mutations.forEach(updateColor));
    observer.observe(target, { attributes: true, attributeFilter: ['style'] });
}

class Exon extends Rect {

    constructor() {
        super(0, 0);

        this.color.set([255, 255, 255].map(v => v / 255));
        this.color[3] = 0.1;

        this.transparent = true;
        this.blendMode = BlendMode.PREMULTIPLIED_ALPHA;

        devColorFromElement('exon', this.color);
    }

    draw(context: DrawContext) {
        super.draw(context);
    }

    getFragmentCode() {
        return `
            #version 100

            precision highp float;

            uniform vec2 size;

            uniform vec4 color;

            varying vec2 vUv;
            
            void main() {
                vec2 domPx = vUv * size;
            
                const vec2 borderWidthPx = vec2(1.);
                const float borderStrength = 0.3;

                vec2 inner = step(borderWidthPx, domPx) * step(domPx, size - borderWidthPx);
                float border = inner.x * inner.y;

                vec4 c = color;
                c.rgb += (1.0 - border) * vec3(borderStrength);

                gl_FragColor = vec4(c.rgb, 1.0) * c.a;
            }
        `;
    }

}

class UTR extends Rect {

    constructor() {
        super(0, 0);

        this.color.set([216., 231., 255.].map(v => v / 255));
        this.color[3] = 0.1;

        this.transparent = true;
        this.blendMode = BlendMode.PREMULTIPLIED_ALPHA;

        devColorFromElement('utr', this.color);
    }

    draw(context: DrawContext) {
        context.uniform1f('pixelRatio', this.worldTransformMat4[0] * context.viewport.w * 0.5);
        super.draw(context);
    }

    getFragmentCode() {
        return `
            #version 100

            precision highp float;

            uniform vec2 size;
            uniform vec4 color;
            uniform float pixelRatio;

            varying vec2 vUv;
            
            void main() {
                vec2 domPx = vUv * size;
            
                const vec2 borderWidthPx = vec2(1.);

                vec2 inner = step(borderWidthPx, domPx) * step(domPx, size - borderWidthPx);
                float border = inner.x * inner.y;

                // crosshatch
                const float angle = -0.520;
                const float widthPx = 2.;
                const float wavelengthPx = 7.584;
                const float lineStrength = 0.25;
                
                vec2 centerPx = domPx - size * 0.5;

                float lPx = centerPx.x * cos(angle) - centerPx.y * sin(angle);
                // not antialiased but looks good enough with current color scheme
                float lines = step(widthPx, mod(lPx, wavelengthPx)) * lineStrength + (1. - lineStrength);

                vec4 c = color;
                c.rgb += (1.0 - border * lines) * vec3(0.3);

                gl_FragColor = vec4(c.rgb, 1.0) * c.a;
            }
        `;
    }

}

class CDS extends Rect {

    protected reverse: number;
    protected phase: number;

    constructor(
        protected length_bases: number,
        phase: number, // number of bases to substract from start to reach first complete codon
        strand: Strand,
        mRnaIndex: number,
    ) {
        super(0, 0);
        this.phase = phase;

        let defaultStartTone = phase > 0 ? 1 : 0;

        // we determine which 'tone' the first codon is by its position in the mRNA sequence (after splicing)
        let startTone = Math.floor(mRnaIndex / 3) % 2; // 0 = A, 1 = B

        // if necessary swap start tone by offsetting phase
        if (defaultStartTone !== startTone) {
            this.phase += 3;
        }
        
        this.reverse = strand === Strand.Negative ? 1.0 : 0.0;

        this.color.set([228, 25, 255].map(v => v/255));
        this.color[3] = 0.5;

        this.transparent = true;
        this.blendMode = BlendMode.PREMULTIPLIED_ALPHA;

        devColorFromElement('cds', this.color);
    }

    draw(context: DrawContext) {
        context.uniform1f('baseWidthPx', (this.computedWidth / this.length_bases));
        context.uniform1f('phase', this.phase || 0);
        context.uniform1f('reverse', this.reverse);
        context.uniform1f('pixelRatio', this.worldTransformMat4[0] * context.viewport.w * 0.5);
        super.draw(context);
    }

    getFragmentCode() {
        return `
            #version 100

            precision highp float;

            uniform vec2 size;

            uniform float pixelRatio;
            uniform float baseWidthPx;
            uniform float phase;
            uniform float reverse;

            uniform vec4 color;

            varying vec2 vUv;

            float squareWaveIntegral(in float x, in float wavelength) {
                float k = x / wavelength;
                float u = fract(k);
                float wave = step(0.5, u) * 2.0 - 1.0;
                return (fract(k * wave) - 1.) * wavelength;
            }

            float squareWaveAntialiased(in float xPixels, in float wavelengthPixels) {
                // antialiasing: we find the average over the pixel by sampling signal integral either side and dividing by sampling interval (1 in this case)
                float waveAvg = squareWaveIntegral(xPixels + 0.5, wavelengthPixels) - squareWaveIntegral(xPixels - 0.5, wavelengthPixels);

                // lerp to midpoint (0) for small wavelengths (~ 1 pixel) to avoid moire patterns
                waveAvg = mix(waveAvg, 0., clamp(2. - wavelengthPixels, 0., 1.0));
                return waveAvg;
            }
            
            void main() {
                vec2 domPx = vUv * size;
            
                const vec2 borderWidthPx = vec2(1.);
                vec2 inner = step(borderWidthPx, domPx) * step(domPx, size - borderWidthPx);
                float border = inner.x * inner.y;

                // two-tones for codons
                vec4 codonAColor = color;
                vec4 codonBColor = color + vec4(0.05);
                // a codon is 3 bases wide
                float codonWidthPx = baseWidthPx * 3.0;

                // use square wave to create codon tones
                // we use true pixel coordinates to make antialiasing easier
                float xPixels = (mix(domPx.x, size.x - domPx.x, reverse) - baseWidthPx * phase) * pixelRatio;
                float wavelengthPixels = codonWidthPx * pixelRatio * 2.0;

                float codon = squareWaveAntialiased(xPixels, wavelengthPixels) * 0.5 + 0.5; // scale wave to 0 - 1

                vec4 c =
                    mix(codonAColor, codonBColor, codon); // switch between codon colors

                c.rgb += (1.0 - border) * vec3(0.3); // additive blend border

                gl_FragColor = vec4(c.rgb, 1.0) * c.a;
            }
        `;
    }

}

class TranscriptSpan extends Rect {

    constructor(protected direction: Strand) {
        super(0, 0);

        this.color.set([0, 1, 0, 1]);
    }

    draw(context: DrawContext) {
        context.uniform2f('pixelSize', 1/context.viewport.w, 1/context.viewport.h);
        context.uniform1f('reverse', this.direction === Strand.Negative ? 1 : 0);
        super.draw(context);
    }

    protected getFragmentCode() {
        return `
            #version 100

            precision highp float;

            uniform vec2 pixelSize;
            uniform vec2 size;
            uniform float reverse;

            uniform vec4 color;

            varying vec2 vUv;

            float distanceToSegment(vec2 a, vec2 b, vec2 p) {
                p -= a; b -= a;                        // go to A referential
                float q = dot(p, b) / dot(b, b) ;      // projection of P on line AB: normalized ordinate
                b *= clamp(q, 0., 1.);                 // point on segment AB closest to P 
                return length( p - b);                 // distance to P
            }

            float lineSegment(vec2 x, vec2 a, vec2 b, float r, vec2 pixelSize) {
                float f = distanceToSegment(a, b, x);
                float e = pixelSize.x * 0.5;
                return smoothstep(r - e, r + e, f);
            }
            
            void main() {
                vec2 x = vec2(vUv.x, vUv.y - 0.5);

                x.x = mix(x.x, 1.0 - x.x, reverse);

                float n = 2.0;
                x *= n; x.x = fract(x.x);

                vec2 p = x * size;

                float m = 1.0 - (
                    // arrow
                    lineSegment(
                        p + vec2(-size.x * 0.5, 0.0),
                        vec2(-10.0, -10.0) * 0.75,
                        vec2(  0.0,   0.0),
                        1.0,
                        pixelSize
                    ) *
                    lineSegment(
                        p + vec2(-size.x * 0.5, 0.0),
                        vec2(-10.0, 10.0) * 0.75,
                        vec2(  0.0,  0.0),
                        1.0,
                        pixelSize
                    ) *

                    // middle line
                    lineSegment(x, vec2(0), vec2(1.0, 0.), 0.1, pixelSize)
                );

                vec3 rgb = color.rgb * m;
                float a = m * color.a;

                gl_FragColor = vec4(rgb, 1.0) * a; return;


                /*

                float h = 0.1;
                float l = lineSegment(
                    uv,
                    vec2(0.5 - w * 0.5,  0.5),
                    vec2(0.5 + w * 0.5,  0.5),
                    h,
                    pixelSize
                );

                gl_FragColor = vec4(0., 0., l, 1.); return;

                float r = size.x / size.y;
                
                vec2 x = vec2(vUv.x, vUv.y - 0.5);
                x.x *= r;
                x *= 1.0; x.x = fract(x.x);

                vec2 lx = vec2(x.x - 0.5, x.y);
                float lines = 1.0 - (
                    lineSegment(lx, vec2(-0.25,  0.25), vec2(0), 0.05, pixelSize) *
                    lineSegment(lx, vec2(-0.25, -0.25), vec2(0), 0.05, pixelSize)
                );

                // gl_FragColor = vec4(lx, 0., 1.); return;

                gl_FragColor = vec4(vec3(lines), 1.);
                */
            }
        `;
    }

}

export default AnnotationTrack;