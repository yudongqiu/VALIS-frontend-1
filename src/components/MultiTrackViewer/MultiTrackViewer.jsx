// Dependencies
import React from 'react';
import PropTypes from 'prop-types';
import Util from '../../helpers/util.js';
import { GENOME_LENGTH } from '../../helpers/constants.js';

import StatusTile from '../StatusTile/StatusTile.jsx';
import TrackView from '../TrackView/TrackView.jsx';
import TrackToolTip from '../TrackToolTip/TrackToolTip.jsx';

// Styles
import './MultiTrackViewer.scss';

const _ = require('underscore');
const d3 = require('d3');

const TICK_SPACING_PIXELS = 100.0;
const MIN_TRACK_HEIGHT_PIXELS = 32.0;
const ANNOTATION_OFFSET = 2.0;

class MultiTrackViewer extends React.Component {
  constructor(props) {
    super(props);
    this.handleLoad = this.handleLoad.bind(this);
    this.views = {};
    this.overlayElem = null;
    this.state = {
      startBasePair: 0,
      basePairsPerPixel: 0,
      trackHeight: 0,
    };
  }

  componentDidMount() {
    // TODO: Need to write componentDidUnmount
    // that handles destruction of WebGL Context when the page changes
    window.addEventListener('load', this.handleLoad);
    const domElem = document.querySelector('#webgl-canvas');

    // need to reset explicit canvas dims to prevent canvas stretch scaling
    domElem.width = domElem.clientWidth;
    domElem.height = domElem.clientHeight;
    this.overlayElem = document.querySelector('#webgl-overlay');

    this.setState({
      windowSize: [domElem.clientWidth, domElem.clientHeight],
      basePairsPerPixel: GENOME_LENGTH / domElem.clientWidth,
      selectEnabled: false,
      trackHeight: 0.1,
      trackOffset: 0.0,
      startBasePair: 0,
      zoomEnabled: false,
      dragEnabled: false,
      lastDragCoord: null,
      startDragCoord: null,
    });
  }

  getWindowState() {
    if (!this.state) return {};

    let x = -1;
    if (this.state.lastDragCoord) {
      x = Util.basePairForScreenX(this.state.lastDragCoord[0], this.state.startBasePair, this.state.basePairsPerPixel, this.state.windowSize);  
    }
    
    const windowState = {
      windowSize: this.state.windowSize,
      basePairsPerPixel: this.state.basePairsPerPixel,
      startBasePair: this.state.startBasePair,
      selectedBasePair: x,
    };

    if (this.state.selectEnabled) {
      if (this.state.startDragCoord && this.state.lastDragCoord) {
        windowState.selection = {
          min: this.state.startDragCoord,
          max: this.state.lastDragCoord,
        };
      }
    }
    return windowState;
  }

  getClass() {
    const classes = [];
    if (this.state === null) {
      return '';
    }

    if (this.state.zoomEnabled) {
      classes.push('zoom-active');
    }

    if (this.state.dragEnabled) {
      classes.push('drag-active');
    }

    if (this.state.selectEnabled) {
      classes.push('select-active');
    }

    return classes.join(' ');
  }

  getTrackInfoAtCoordinate(coord) {
      // get base pair: 
      const start = this.state.startBasePair;
      const bpp = this.state.basePairsPerPixel;
      const windowSize = this.state.windowSize;
      const end = Util.endBasePair(start, bpp, windowSize);
      const hoveredBasePair = Util.basePairForScreenX(coord[0], start, bpp, windowSize);
      // get y Offset:
      const trackOffset = (coord[1] - this.state.trackOffset * windowSize[1]) / windowSize[1];
      console.log(coord, trackOffset, windowSize[1]);
      const trackHeightPx = this.state.trackHeight * windowSize[1];

      const numTracks = this.props.tracks.length;
      const idx = Math.floor(trackOffset / (this.state.trackHeight));
      if (idx < this.props.tracks.length) {
        const track = this.props.tracks[idx];
        let dataTooltip = null;
        // check that there is a data track
        if (track.dataTrack) {
          dataTooltip = track.dataTrack.getTooltipData(hoveredBasePair, trackOffset, start, end, bpp, trackHeightPx);
          // make sure that the current cursor is on a valid value:
          if (dataTooltip.value !== null) {
            return {
              yOffset: trackOffset,
              basePair: hoveredBasePair,
              track: track,
              tooltip: dataTooltip,
              trackCenterPx: idx * trackHeightPx + trackHeightPx/2.0 + this.state.trackOffset * windowSize[1],
            };
          }
        }
      }
      return {
        yOffset: trackOffset,
        basePair: hoveredBasePair,
        track: null,
        tooltip: null,
        trackCenterPx: null,
      };
  }


  handleMouseMove(e) {
    if (this.state.dragEnabled) {
      if (!this.state.selectEnabled) {
        const deltaX = e.offsetX - this.state.lastDragCoord[0];
        const deltaY = e.offsetY - this.state.lastDragCoord[1];
        if (Math.abs(deltaY) > 0) {
          const delta = Math.min(0.0, this.state.trackOffset + deltaY / this.state.windowSize[1]);
          this.setState({
            trackOffset: delta,
          });
        }

        if (Math.abs(deltaX) > 0) {
          this.setState({
            startBasePair: this.state.startBasePair - deltaX * this.state.basePairsPerPixel,
          });
        }  
      }
    }

    this.setState({
      lastDragCoord: [e.offsetX, e.offsetY],
    });
  }


  handleMouse(e) {
    if (this.state.dragEnabled) {
      return;
    } else if (this.state.zoomEnabled) {
      if (Math.abs(e.deltaY) > 0) {
          const lastTrackOffset = this.trackOffsetForScreenY(e.offsetY);
          
          const trackHeight = this.state.trackHeight / (1.0 - (e.deltaY / this.state.windowSize[1]));  
          if (trackHeight * this.state.windowSize[1] > MIN_TRACK_HEIGHT_PIXELS) {
            this.setState({
              trackHeight: trackHeight,
            });
            // compute the offset so that the y position remains constant after zoom:
            const newTotalH = (this.props.tracks.length * trackHeight) * this.state.windowSize[1];
            const offset = Math.min(0.0, (e.offsetY - (lastTrackOffset * newTotalH)) / this.state.windowSize[1]);
            this.setState({
              trackOffset: offset,
            });
          }
        }
    } else if (this.state.basePairsPerPixel <= GENOME_LENGTH / (this.state.windowSize[0])) {
      // x pan sets the base pair!
      if (Math.abs(e.deltaX) > 0) {
        const newStart = this.state.startBasePair + (e.deltaX * this.state.basePairsPerPixel);
        this.setState({
          startBasePair: newStart,
          panning: true,
        });
      } else {
        this.setState({
          panning: false,
        });
        if (Math.abs(e.deltaY) > 0) {
          const lastBp = Util.basePairForScreenX(e.offsetX, 
                                                  this.state.startBasePair, 
                                                  this.state.basePairsPerPixel, 
                                                  this.state.windowSize);
          
          let newBpPerPixel = this.state.basePairsPerPixel / (1.0 - (e.deltaY / 1000.0));  
          newBpPerPixel = Math.min(GENOME_LENGTH / (this.state.windowSize[0]), newBpPerPixel);

          // compute the new startBasePair so that the cursor remains
          // centered on the same base pair after scaling:
          const rawPixelsAfter = lastBp / newBpPerPixel;
          const offset = (rawPixelsAfter - e.offsetX) * newBpPerPixel;
          this.setState({
            startBasePair:  offset,
            basePairsPerPixel: newBpPerPixel,
          });
        }
      }
    }
  }

  handleMouseDown(e) {
    this.setState({
      dragEnabled: true,
      lastDragCoord: [e.offsetX, e.offsetY],
      startDragCoord: [e.offsetX, e.offsetY],
    });
  }

  handleMouseUp(e) {
    this.setState({
      dragEnabled: false,
      lastDragCoord: null,
      startDragCoord: null,
      selectEnabled: false,
    });
  }

  handleKeydown(e) {
    if (e.key === 'Alt') {
      this.setState({
        selectEnabled: true,
      });
    } else if (e.key === 'Control') {
      this.setState({
        zoomEnabled: true,
      });
    }
  }

  handleKeyup(e) {
    if (e.key === 'Alt') {
      this.setState({
        selectEnabled: false,
      });
    } else if (e.key === 'Control') {
      this.setState({
        zoomEnabled: false,
      });
    }
  }

  handleLoad() {
    // TODO: need to extract dom-elem without hardcoded ID
    const domElem = document.querySelector('#webgl-canvas');
    
    this.renderContext = Util.newRenderContext(domElem);
    this.shaders = TrackView.initializeShaders(this.renderContext);

    domElem.addEventListener('wheel', this.handleMouse.bind(this));
    domElem.addEventListener('mousemove', this.handleMouseMove.bind(this));
    domElem.addEventListener('mousedown', this.handleMouseDown.bind(this));
    domElem.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('keydown', this.handleKeydown.bind(this));
    document.addEventListener('keyup', this.handleKeyup.bind(this));

    const renderFrame = () => {
      this.renderGL();
      requestAnimationFrame(renderFrame);
    };
    renderFrame();
  }


  glContext() {
    return this.renderContext.gl;
  }


  trackOffsetForScreenY(y) { 
    const totalH = (this.props.tracks.length * this.state.trackHeight) * this.state.windowSize[1];
    return (y - (this.state.trackOffset * this.state.windowSize[1])) / totalH;
  }

  updateViews() {
    const newViews = {};
    let idx = 0;
    this.props.tracks.forEach(track => {
      if (!this.views[track.guid]) {
        newViews[track.guid] = new TrackView();
      } else {
        newViews[track.guid] = this.views[track.guid];
      }
      const trackView = newViews[track.guid];

      if (track.dataTrack) {
        trackView.setDataTrack(track.dataTrack);
      }

      if (track.annotationTrack) {
        trackView.setAnnotationTrack(track.annotationTrack);
      }
      trackView.setHeight(this.state.trackHeight);
      trackView.setYOffset(idx * this.state.trackHeight + this.state.trackOffset);
      idx += 1;
    });
    this.views = newViews;
  }

  renderGL() {
    const gl = this.glContext();
    gl.clear(gl.COLOR_BUFFER_BIT);
    const windowState = this.getWindowState();
    const viewGuids = _.keys(this.views);
    const numTracks = viewGuids.length;
    for (let i = 0; i < numTracks; i++) {
      // setup track position
      const track = this.views[viewGuids[i]];
      track.setHeight(this.state.trackHeight);
      track.setYOffset(i * this.state.trackHeight + this.state.trackOffset);
      track.render(this.renderContext, this.shaders, windowState);
    }
  }

  render() {
    this.updateViews();
    const headers = [];
    const viewGuids = _.keys(this.views);
    const numTracks = viewGuids.length;
    const windowState = this.getWindowState();
    for (let i = 0; i < numTracks; i++) {
      const track = this.views[viewGuids[i]];
      headers.push(track.getHeader(windowState));
    }
    const width = windowState.windowSize ? windowState.windowSize[0] : 0;
    const endBasePair = width ? Util.endBasePair(windowState.startBasePair, windowState.basePairsPerPixel, windowState.windowSize) : 0;
    const xScale = d3.scaleLinear().range([0, width]).domain([windowState.startBasePair, endBasePair]);
    const xAxis = d3.axisTop()
                    .scale(xScale)
                    .tickSizeOuter(-10)
                    .ticks(Math.floor(width/TICK_SPACING_PIXELS))
                    .tickFormat(Util.roundToHumanReadable);

    let tooltip = (<div />);
    if (this.state.lastDragCoord && !this.state.selectEnabled) {
      const coord = this.state.lastDragCoord.slice();
      const trackInfo = this.getTrackInfoAtCoordinate(coord);
      const x = ANNOTATION_OFFSET + Util.pixelForBasePair(trackInfo.basePair, this.state.startBasePair, this.state.basePairsPerPixel, this.state.windowSize);
      
      if (trackInfo.track !== null && trackInfo.tooltip !== null) {
        const trackHeightPx = this.state.trackHeight * this.state.windowSize[1];
        const y = (-trackInfo.tooltip.value + 0.5) * trackHeightPx + trackInfo.trackCenterPx;
        tooltip = (<TrackToolTip x={x} y={y}>
          <div>BP:{Math.round(trackInfo.basePair)}</div>
          <div>Value:{trackInfo.tooltip.value.toFixed(3)}</div>
        </TrackToolTip>);
      }
    }
    return (
      <div className="content">
        <div id="track-headers">
          {headers}
        </div>
        <div className="track-header-axis">
          <svg className="x-axis-container">
            <g className="x-axis" ref={node => d3.select(node).call(xAxis)} />
          </svg>
        </div>
        <canvas id="webgl-canvas" className={this.getClass()} />
        <div id="webgl-overlay">
          {tooltip}
        </div>
        <StatusTile 
          startBasePair={this.state.startBasePair}
          basePairsPerPixel={this.state.basePairsPerPixel}
          trackHeight={this.state.trackHeight}
        />
      </div>
    );
  }
}

MultiTrackViewer.propTypes = {
   tracks: PropTypes.array,
};

export default MultiTrackViewer;
