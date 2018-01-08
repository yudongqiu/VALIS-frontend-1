import { Igloo } from '../../lib/igloojs/igloo.js';

const d3 = require('d3');
const _ = require('underscore');

const formatSi = d3.format('.6s');

class Util {
  static floorToMultiple(x, k) {
    return Math.round((x % k === 0) ? x :  x + k - x % k - k);
  }

  static ceilToMultiple(x, k) {
    return Math.round((x % k === 0) ? x :  x + k - x % k);
  }

  static floorToClosestPower(x, k) {
    return Math.floor(Math.pow(k, Math.floor(Math.log(x)/Math.log(k))));
  }

  static discreteRangeContainingRange(range, discretizationSize) {
    const start = Util.floorToMultiple(range[0], discretizationSize);
    const end = Util.ceilToMultiple(range[1], discretizationSize);
    return [start, end];
  }

  static inRange(range, value) {
    return value >= range[0] && value <= range[1];
  }

  static rangesIntersect(range1, range2) {
    return Util.inRange(range1, range2[0]) || Util.inRange(range1, range2[1]);
  }

  static endBasePair(startBasePair, basePairsPerPixel, windowSize) {
    return startBasePair + Math.floor(windowSize[0] * basePairsPerPixel);
  }

  static basePairForScreenX(x, startBasePair, basePairsPerPixel, windowSize) {
    const u = x / windowSize[0];
    const endBasePair = Util.endBasePair(startBasePair, basePairsPerPixel, windowSize);
    return startBasePair + (u * (endBasePair - startBasePair));
  }

  static pixelForBasePair(bp, startBasePair, basePairsPerPixel, windowSize) {
    const endBasePair = Util.endBasePair(startBasePair, basePairsPerPixel, windowSize);
    const u = (bp - startBasePair) / (endBasePair - startBasePair);
    return u * windowSize[0];
  }

  static multiplyColor(color, d) {
    return color.map(val => Math.min(255, val * d));
  }

  static blendColors(color1, color2, alpha) {
    const c1 = Util.multiplyColor(color1, alpha);
    const c2 = Util.multiplyColor(color2, 1.0 - alpha);
    return [c1[0] + c2[0], c1[1] + c2[1], c1[2] + c2[2]];
  }

  static floorToPixel(u, px) {
    return Math.floor(u*px) / px;
  }

  static easeInOutQuadratic(t) {
    return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
  }
  static easeInOutCubic(t) {
    return t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1;
  }

  static animate(start, end, callback, totalTime=1.0, delta=1.0/24.0, elapsed=0.0, easingFunction=Util.easeInOutCubic) {
    window.setTimeout(() => {
      const alpha = 1.0 - easingFunction(elapsed / totalTime);
      callback(alpha, start, end);
      elapsed += delta;
      if (elapsed < totalTime) {
        Util.animate(start, end, callback, totalTime, delta, elapsed);
      }
    }, delta);
  }

  static newRenderContext(domElem) {
    const MAX_TEXTURES = 128;
    const igloo = new Igloo(domElem);
    const gl = igloo.gl;
    const textures = [];
    
    gl.getExtension('OES_texture_float');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    for (let i = 0; i < MAX_TEXTURES; i++) {
      const newTexture = igloo.texture(null, gl.RGBA, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.FLOAT);
      textures.push(newTexture);
    }

    // monkey patch igloo... 
    igloo.textures = textures;
    igloo.boundTextures = {};
    igloo.quad = igloo.array(Igloo.QUAD2);
    igloo.lineBuffer = igloo.array();
    igloo.lineColorBuffer = igloo.array();

    // handle quad rendering:
    igloo.drawQuad = function(shader) {
        shader.attrib('points', igloo.quad, 2);
        shader.draw(igloo.gl.TRIANGLE_STRIP, Igloo.QUAD2.length / 2);
    };

    igloo.drawLines = function(shader, lines, colors) {
      igloo.lineBuffer.update(lines);
      igloo.lineColorBuffer.update(colors);
      shader.attrib('points', igloo.lineBuffer, 2);
      shader.attrib('color', igloo.lineColorBuffer, 4);
      shader.draw(igloo.gl.LINES, lines.length / 2);
    };

    igloo.bindTexture = function(texDataGuid, texData, width, height) {
      if (!igloo.boundTextures[texDataGuid]) {
        const keys = _.keys(igloo.boundTextures);
        let idx = keys.length;
        if (idx >= igloo.textures.length) {
          // free a random texture:
          const toFree = keys[Math.floor(Math.random() * igloo.textures.length)];
          idx = igloo.boundTextures[toFree];
          delete igloo.boundTextures[toFree];
          igloo.boundTextures[texDataGuid] = idx;
        }
        igloo.textures[idx].bind(idx + 1);
        igloo.textures[idx].set(texData, width, height);
        return idx + 1;
      } else {
        const idx = igloo.boundTextures[texDataGuid];
        igloo.textures[idx].bind(idx + 1);
        return idx + 1;
      }
    };

    return igloo;
  }

  static roundToHumanReadable(x) {
    const s = formatSi(x);
    switch (s[s.length - 1]) {
      case 'G': return s.slice(0, -1) + 'B';
      default: return s;
    }
  }
}

export default Util;
