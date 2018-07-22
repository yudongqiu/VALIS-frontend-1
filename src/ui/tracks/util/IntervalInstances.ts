import GPUDevice, { AttributeLayout, AttributeType, VertexAttributeBuffer } from "../../../rendering/GPUDevice";
import { BlendMode, DrawContext, DrawMode } from "../../../rendering/Renderer";
import InstancingBase from "../../core/InstancingBase";
import SharedResources from "../../core/SharedResources";

export type IntervalInstance = {
    xFractional: number, y: number, z: number,
    wFractional: number, h: number,
    color: Array<number>,
};

export default class IntervalInstances extends InstancingBase<IntervalInstance> {

    minWidth: number = 0;

    constructor(instances: Array<IntervalInstance>) {
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
                'instancePosition': (inst: IntervalInstance) => [inst.xFractional, inst.y, inst.z],
                'instanceSize': (inst: IntervalInstance) => [inst.wFractional, inst.h],
                'instanceColor': (inst: IntervalInstance) => inst.color,
            }
        );

        this.transparent = true;
        this.blendMode = BlendMode.PREMULTIPLIED_ALPHA;
    }

    draw(context: DrawContext) {
        context.uniform1f('minWidth', this.minWidth);
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
            uniform float minWidth;
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

                // apply a minimum size
                size.x = max(size.x, minWidth);

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