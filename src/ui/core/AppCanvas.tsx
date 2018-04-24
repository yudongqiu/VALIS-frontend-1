/*

	AppCanvas
    - Manages frame loop
    - Manages root scene node and coordinate system
	- All coordinates are set in DOM pixel units relative to the canvas (unless marked as otherwise)
*/

import * as React from "react";
import Node from '../../rendering/Node';
import Device from '../../rendering/Device';
import RenderPass from '../../rendering/RenderPass';
import Renderer from '../../rendering/Renderer';
import Renderable from '../../rendering/Renderable';
import SharedResources from './SharedResources';
import { Object2D, Object2DInternal } from './Object2D';
import { ReactObject, ReactObjectContainer } from "./ReactObject";
import InteractionEvent, { InteractionEventInternal, InteractionEventMap, WheelInteractionEvent, InteractionEventInit } from "./InteractionEvent";


interface Props {
    width: number;
    height: number;
    content: Object2D;
}

interface State {
    reactObjects: Array<ReactObject>
}

/**
 * AppCanvas
 * - Manages frame loop
 * - Manages root scene node and coordinate system
 */
export class AppCanvas extends React.Component<Props, State> {

    protected canvas: HTMLCanvasElement;
    protected device: Device;
    protected renderer: Renderer;
    protected mainRenderPass: RenderPass;
    protected scene: Object2D;

    constructor(props: Props) {
        super(props);

        this.state = {
            reactObjects: []
        }

        this.updateSceneContent();
    }

    componentDidMount() {
        if (this.device != null) {
            console.error('Component mounted twice');
        }

        let gl = this.canvas.getContext('webgl', { antialias: true });

        if (gl == null) {
            throw 'WebGL not supported';
        }

        // @! temporary initial GL state for 2D drawing
        // in the future this should be applied to the root 2D node
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);

        this.device = new Device(gl);
        this.renderer = new Renderer(this.device);

        SharedResources.initialize(this.device);

        this.addInputListeners();

        console.log(`AppCanvas created with device %c"${this.device.name}"`, 'font-weight: bold');
    }

    componentWillUnmount() {
        for (let node of this.scene) {
            if (node instanceof Renderable) node.releaseGPUResources();
        }

        SharedResources.release();

        this.device = null;
        this.renderer = null;

        this.removeInputListeners();
    }

    componentDidUpdate(prevProps: Props, prevState: State, snapshot: any) {
        if (prevProps.content != this.props.content) {
            this.updateSceneContent();
        }

        if (
            this.props.width !== prevProps.width ||
            this.props.height !== prevProps.height
        ) {
            this.updateSceneTransform();
            this.scene.applyTreeTransforms();
            this.renderer.render(this.mainRenderPass);
        }
    }

    render() {
        const pixelRatio = window.devicePixelRatio || 1;

        return (
            <div className="viewer" style={{ position: 'relative' }}>
                <canvas
                    ref={(v) => this.canvas = v}
                    width={this.props.width * pixelRatio + 'px'}
                    height={this.props.height * pixelRatio + 'px'}
                    style={{
                        display: 'block',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: this.props.width + 'px',
                        height: this.props.height + 'px',
                        zIndex: 0,
                    }}
                />
                {
                    this.state.reactObjects.map(
                        (ro) => <ReactObjectContainer key={ro.reactUid} reactObject={ro} scene={this.scene} />
                    )
                }
            </div>
        )
    }

    renderCanvas() {
        this.renderer.render(this.mainRenderPass);
        this.updateReactObjects();
    }

    protected updateSceneContent() {
        this.scene = new Object2D();
        if (this.props.content != null) {
            this.scene.add(this.props.content);
        }
        this.mainRenderPass = new RenderPass(
            null,
            this.scene,
            {
                clearColor: [1, 1, 1, 1],
                clearDepth: 1
            }
        );
        this.updateSceneTransform();
        this.scene.applyTreeTransforms();
    }

    /**
	 * Apply DOM pixel coordinate system to the scene via a transform on the root node
	 * - Flip z-axis from default OpenGL coordinates so that 1 = in front the screen and -1 is inside the screen
	 * - z coordinates clip outside of -1 to 1
	 * - (0, 0) corresponds to the top-left of the canvas
	 * - (canvas.clientWidth, canvas.clientHeight) corresponds to the bottom left
	 */
    protected updateSceneTransform() {
        // width and height should be the _display_ size of the scene in DOM pixel units
        let w_dom = this.props.width;
        let h_dom = this.props.height;
        this.scene.x = -1;
        this.scene.y = 1;
        this.scene.sx = 2 / w_dom;
        this.scene.sy = -2 / h_dom;
        this.scene.sz = -1;
        this.scene.w = w_dom;
        this.scene.h = h_dom;
    }

	/**
	 * Given bounds in OpenGL display coordinates (clip-space), return the same bounds in DOM pixel coordinates (relative to the canvas)
	 * This applies the inverse of the scene transform
	 */
    protected worldToCanvasSpaceBounds(worldSpaceBounds: { l: number, r: number, t: number, b: number }) {
        return {
            l: (worldSpaceBounds.l - this.scene.x) / this.scene.sx,
            r: (worldSpaceBounds.r - this.scene.x) / this.scene.sx,
            t: (worldSpaceBounds.t - this.scene.y) / this.scene.sy,
            b: (worldSpaceBounds.b - this.scene.y) / this.scene.sy,
        }
    }

    /**
     * Converts from canvas-space coordinates into clip-space, which is the world-space of Object2D nodes
     */
    protected canvasToWorldSpacePosition(canvasSpacePosition: { x: number, y: number }) {
        return {
            x: (canvasSpacePosition.x / this.props.width) * 2 - 1,
            y: -((canvasSpacePosition.y / this.props.height) * 2 - 1),
        }
    }

    private _reactObjects = new Array<ReactObject>();
    protected updateReactObjects() {
        // find all react nodes in the scene
        let reactObjectIndex = 0;
        let reactObjectsChanged = false;

        for (let node of this.scene) {
            if (!(node instanceof ReactObject)) continue;
            let last = this._reactObjects[reactObjectIndex];

            if (!reactObjectsChanged) {
                reactObjectsChanged = last !== node;
            }

            this._reactObjects[reactObjectIndex] = node;

            reactObjectIndex++;
        }

        reactObjectsChanged = reactObjectsChanged || (reactObjectIndex !== this._reactObjects.length);

        // trim excess nodes from the previous frame
        if (reactObjectIndex < this._reactObjects.length) {
            this._reactObjects.length = reactObjectIndex;
        }

        // trigger react re-render of viewer if the node list has changed
        if (reactObjectsChanged) {
            this.setState({
                reactObjects: this._reactObjects
            });
        }
    }

    /**
     * Returns the event position relative to the canvas
     */
    protected mouseEventToCanvasSpacePosition(e: MouseEvent) {
        let x: number = 0;
        let y: number = 0;

        let canvasRect = this.canvas.getBoundingClientRect();
        let canvasX = window.scrollX + this.canvas.clientLeft;
        let canvasY = window.scrollY + canvasRect.top;
        x = e.pageX - canvasX;
        y = e.pageY - canvasY;

        return {
            x: x,
            y: y,
        }
    }

    protected addInputListeners() {
        if ('PointerEvent' in (window as any)) {
            this.canvas.addEventListener('pointerdown', this.onPointerDown);
            window.addEventListener('pointerup', this.onPointerUp);
            window.addEventListener('pointermove', this.onPointerMove);
        } else {
            this.canvas.addEventListener('mousedown', this.onPointerDown);
            window.addEventListener('mouseup', this.onPointerUp);
            window.addEventListener('mousemove', this.onPointerMove);
        }
        this.canvas.addEventListener('click', this.onClick);
        this.canvas.addEventListener('dblclick', this.onDoubleClick);
        this.canvas.addEventListener('wheel', this.onWheel);
    }

    protected removeInputListeners() {
        if ('PointerEvent' in (window as any)) {
            this.canvas.removeEventListener('pointerdown', this.onPointerDown);
            window.removeEventListener('pointerup', this.onPointerUp);
            window.removeEventListener('pointermove', this.onPointerMove);
        } else {
            this.canvas.removeEventListener('mousedown', this.onPointerDown);
            window.removeEventListener('mouseup', this.onPointerUp);
            window.removeEventListener('mousemove', this.onPointerMove);
        }
        this.canvas.removeEventListener('click', this.onClick);
        this.canvas.removeEventListener('dblclick', this.onDoubleClick);
        this.canvas.removeEventListener('wheel', this.onWheel);
    }

    private dragData: {
        [pointerId: number]: {
            button: number,
            activeNodes: Array<Object2D>,
            inactiveNodes: Array<Object2D>
        }
    } = {};

    protected onPointerMove = (e: MouseEvent | PointerEvent) => {
        let cursorStyle: string = null;

        function setCursorStyle(v: string) {
            if (cursorStyle == null && v != null) cursorStyle = v;
        }

        let interactionData = this.interactionDataFromEvent(e);
        interactionData.buttonChange = -1; // normalize between MouseEvent and PointerEvent

        let dragData = this.dragData[interactionData.pointerId];

        let defaultPrevented = false;
        if (dragData !== void 0) {
            defaultPrevented = defaultPrevented || this.executePointerInteraction(dragData.inactiveNodes, 'dragstart', interactionData, (init) => {
                setCursorStyle(init.target.cursorStyle);
                dragData.activeNodes.push(init.target);
                return new InteractionEvent(init, e);
            });
            dragData.inactiveNodes = [];

            defaultPrevented = defaultPrevented || this.executePointerInteraction(dragData.activeNodes, 'dragmove', interactionData, (init) => {
                setCursorStyle(init.target.cursorStyle);
                return new InteractionEvent(init, e);
            });
        }

        if (!defaultPrevented) {
            let eventName: keyof InteractionEventMap = 'pointermove';
            let hitNodes = this.hitTestNodesForInteraction(eventName, interactionData.worldX, interactionData.worldY);
            this.executePointerInteraction( hitNodes, eventName, interactionData, (init) => {
                setCursorStyle(init.target.cursorStyle);
                return new InteractionEvent(init, e);
            });
        }

        if (cursorStyle === null) {
            cursorStyle = '';
        }

        if (this.canvas.style.cursor !== cursorStyle) {
            this.canvas.style.cursor = cursorStyle;
        }
    }
    protected onPointerDown = (e: MouseEvent | PointerEvent) => {
        let eventName: keyof InteractionEventMap = 'pointerdown';
        let interactionData = this.interactionDataFromEvent(e);

        // initialize drag data entry
        let dragData = this.dragData[interactionData.pointerId] = {
            activeNodes: new Array<Object2D>(),
            inactiveNodes: new Array<Object2D>(),
            button: e.button,
        };

        let hitNodes = this.hitTestNodesForInteraction(eventName, interactionData.worldX, interactionData.worldY);
        this.executePointerInteraction(
            hitNodes,
            eventName,
            interactionData,
            (init) => {
                if (dragData.inactiveNodes.indexOf(init.target) === -1) {
                    dragData.inactiveNodes.push(init.target);
                }
                return new InteractionEvent(init, e);
            }
        );
    }
    protected onPointerUp = (e: MouseEvent | PointerEvent) => {
        let interactionData = this.interactionDataFromEvent(e);

        let dragData = this.dragData[interactionData.pointerId];
        if (dragData !== void 0 && dragData.button === e.button) {
            // clear drag data entry
            delete this.dragData[interactionData.pointerId];
            // fire 'dragend' on any nodes where drag was started
            let defaultPrevented = this.executePointerInteraction(dragData.activeNodes, 'dragend', interactionData, (init) => new InteractionEvent(init, e));
            if (defaultPrevented) return;
        }

        let eventName: keyof InteractionEventMap = 'pointerup';
        let hitNodes = this.hitTestNodesForInteraction(eventName, interactionData.worldX, interactionData.worldY);
        this.executePointerInteraction(hitNodes, eventName, interactionData, (init) => new InteractionEvent(init, e));
    }
    protected onClick = (e: MouseEvent) => {
        let eventName: keyof InteractionEventMap = 'click';
        let interactionData = this.interactionDataFromEvent(e);
        let hitNodes = this.hitTestNodesForInteraction(eventName, interactionData.worldX, interactionData.worldY);
        this.executePointerInteraction(hitNodes, eventName, interactionData, (init) => new InteractionEvent(init, e));
    }
    protected onDoubleClick = (e: MouseEvent) => {
        let eventName: keyof InteractionEventMap = 'dblclick';
        let interactionData = this.interactionDataFromEvent(e);
        let hitNodes = this.hitTestNodesForInteraction(eventName, interactionData.worldX, interactionData.worldY);
        this.executePointerInteraction(hitNodes, eventName, interactionData, (init) => new InteractionEvent(init, e));
    }
    protected onWheel = (e: WheelEvent) => {
        let eventName: keyof InteractionEventMap = 'wheel';
        let interactionData = this.interactionDataFromEvent(e);
        let hitNodes = this.hitTestNodesForInteraction(eventName, interactionData.worldX, interactionData.worldY);
        this.executePointerInteraction(
            hitNodes,
            eventName,
            interactionData,
            (init) => {
                return new WheelInteractionEvent({
                    ...init,
                    wheelDeltaX: e.deltaX,
                    wheelDeltaY: e.deltaY,
                    wheelDeltaZ: e.deltaZ,
                }, e);
            }
        );
    }

    private _hitNodes = new Array<Object2D>(); // micro-optimization: reuse array between events to prevent re-allocation
    protected hitTestNodesForInteraction<K extends keyof InteractionEventMap>(interactionEventName: K, worldX: number, worldY: number): Array<Object2D> {
        let hitNodeIndex = 0;
        let hitNodes = this._hitNodes;

        for (let node of this.scene) {
            if (node instanceof Object2D) {
                let nodeInternal = node as any as Object2DInternal;

                // we can skip this node if we know it doesn't have any interaction behaviors
                if (
                    node.cursorStyle == null &&
                    nodeInternal.interactionEventListenerCount[interactionEventName] <= 0
                ) continue;

                let worldSpaceBounds = node.getWorldBounds();

                // hit-test position with object bounds
                if (
                    worldX >= worldSpaceBounds.l &&
                    worldX <= worldSpaceBounds.r &&
                    worldY >= worldSpaceBounds.b &&
                    worldY <= worldSpaceBounds.t
                ) {
                    hitNodes[hitNodeIndex++] = node;
                }
            }
        }

        // trim excess elements from last use
        if (hitNodeIndex < hitNodes.length) {
            hitNodes.length = hitNodeIndex;
        }

        // top-most nodes should receive events first
        hitNodes.sort(this.compareZ);

        return hitNodes;
    }

    protected executePointerInteraction<K extends keyof InteractionEventMap>(
        nodes: Array<Object2D>,
        interactionEventName: K,
        interactionData: InteractionEventInit,
        constructEvent: (init: InteractionEventInit) => InteractionEventMap[K]
    ) {
        let defaultPrevented = false;

        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i];
            let nodeInternal = node as any as Object2DInternal;

            let worldSpaceBounds = node.getWorldBounds();
            let fx = (interactionData.worldX - worldSpaceBounds.l) / (worldSpaceBounds.r - worldSpaceBounds.l);
            let fy = (interactionData.worldY - worldSpaceBounds.t) / (worldSpaceBounds.b - worldSpaceBounds.t);

            // populate node-specific event fields
            interactionData.target = node;
            interactionData.localX = fx * nodeInternal.computedWidth;
            interactionData.localY = fy * nodeInternal.computedHeight;
            interactionData.fractionX = fx;
            interactionData.fractionY = fy;

            let eventObject = constructEvent(interactionData);
            let eventObjectInternal = eventObject as any as InteractionEventInternal;

            // trigger event on node
            nodeInternal.eventEmitter.emit(interactionEventName, eventObject);

            defaultPrevented = eventObjectInternal.defaultPrevented || defaultPrevented;
            // if user has executed stopPropagation() then do not emit on subsequent nodes
            if (eventObjectInternal.propagationStopped) break;
        }

        return defaultPrevented;
    }

    protected interactionDataFromEvent(e: MouseEvent | PointerEvent) {
        let canvasSpacePosition = this.mouseEventToCanvasSpacePosition(e);
        let worldSpacePosition = this.canvasToWorldSpacePosition(canvasSpacePosition);

        let interactionData: InteractionEventInit = {
            buttonChange: e.button,
            buttonState: e.buttons,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            canvasX: canvasSpacePosition.x,
            canvasY: canvasSpacePosition.y,
            worldX: worldSpacePosition.x,
            worldY: worldSpacePosition.y,

            // PointerEvent data, defaults to mouse events
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            width: 1,
            height: 1,
            pressure: 0,
            tiltX: 0,
            tiltY: 0,

            // node-specific
            target: null,
            localX: 0,
            localY: 0,
            fractionX: 0,
            fractionY: 0,
        }

        // set pointer event data if it's available
        if (e instanceof PointerEvent) {
            interactionData.pointerId = e.pointerId;
            interactionData.pointerType = e.pointerType;
            interactionData.isPrimary = e.isPrimary;
            interactionData.width = e.width;
            interactionData.height = e.height;
            interactionData.pressure = e.pressure;
            interactionData.tiltX = e.tiltX;
            interactionData.tiltY = e.tiltY;
        }

        return interactionData;
    }

    protected compareZ(a: Object2D, b: Object2D) {
        return a.getWorldZ() - b.getWorldZ();
    }

}

export default AppCanvas;