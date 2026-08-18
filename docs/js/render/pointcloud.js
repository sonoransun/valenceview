/* Valence View — VV.PointCloud: additive-blended point-sprite cloud.
 * Interleaved layout, stride 24 B/point: pos(3f) + re,im(2f) + invDen(1f).
 * Shader reweights alpha by w = (re^2+im^2)*invDen (constant for a single
 * orbital, bounded by K for LCAO via the Cauchy-Schwarz envelope), so no
 * per-frame CPU geometry. colorMode 'sign' -> diverging lobe pair uniforms;
 * 'phase' -> hue = atan(im, re) + uPhaseOffset via GLSL hsv2rgb.
 * Chunks are retained CPU-side for context-restore re-upload. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const STRIDE = 24; // bytes
  const FLOATS = 6;

  const VS_COMMON =
    'attribute vec3 aPos;\n' +
    'attribute vec2 aPsi;\n' +
    'attribute float aInvDen;\n' +
    'uniform mat4 uModel;\n' +
    'uniform mat4 uView;\n' +
    'uniform mat4 uProj;\n' +
    'uniform float uPointScale;\n' +   // px*viewZ product: size = uPointScale / -viewZ
    'uniform float uGlobalAlpha;\n' +
    'uniform float uWeightScale;\n' +
    'varying vec3 vColor;\n' +
    'varying float vAlpha;\n';

  const VS_MAIN_PRE =
    'void main() {\n' +
    '  vec4 viewPos = uView * (uModel * vec4(aPos, 1.0));\n' +
    '  gl_Position = uProj * viewPos;\n' +
    '  gl_PointSize = clamp(uPointScale / max(-viewPos.z, 1e-3), 1.0, 14.0);\n' +
    '  float w = (aPsi.x * aPsi.x + aPsi.y * aPsi.y) * aInvDen;\n' +
    '  vAlpha = uGlobalAlpha * min(w * uWeightScale, 1.0);\n';

  const VS_SIGN =
    VS_COMMON +
    'uniform vec3 uColorPos;\n' +
    'uniform vec3 uColorNeg;\n' +
    VS_MAIN_PRE +
    '  vColor = aPsi.x >= 0.0 ? uColorPos : uColorNeg;\n' +
    '}\n';

  const VS_PHASE =
    VS_COMMON +
    'uniform float uPhaseOffset;\n' +
    'vec3 hsv2rgb(float h, float s, float v) {\n' +
    '  vec3 p = abs(fract(vec3(h) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);\n' +
    '  return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s);\n' +
    '}\n' +
    VS_MAIN_PRE +
    '  float hue = fract((atan(aPsi.y, aPsi.x) + uPhaseOffset) * 0.15915494309);\n' +
    '  vColor = hsv2rgb(hue, 0.85, 1.0);\n' +
    '}\n';

  const FS =
    'precision mediump float;\n' +
    'varying vec3 vColor;\n' +
    'varying float vAlpha;\n' +
    'void main() {\n' +
    '  float d = length(gl_PointCoord - vec2(0.5));\n' +
    '  if (d > 0.5) discard;\n' +
    '  float a = vAlpha * (1.0 - smoothstep(0.32, 0.5, d));\n' + // soft edge (reversed-edge smoothstep is UB in ES)
    '  gl_FragColor = vec4(vColor, a);\n' + // blendFunc(SRC_ALPHA, ONE)
    '}\n';

  function create(R) {
    const gl = R.gl;

    const pc = {
      count: 0,
      maxPoints: 0,
      colorMode: 'sign',
      retainedChunks: [],
      _buf: null,
      _wSamples: [],
      _wScale: 0,
    };

    function programFor(mode) {
      return mode === 'phase'
        ? R.program('pc-phase', VS_PHASE, FS)
        : R.program('pc-sign', VS_SIGN, FS);
    }

    pc.begin = function (maxPoints, colorMode) {
      pc.maxPoints = maxPoints;
      pc.colorMode = colorMode === 'phase' ? 'phase' : 'sign';
      pc.count = 0;
      pc.retainedChunks = [];
      pc._wSamples = [];
      pc._wScale = 0;
      if (pc._buf) gl.deleteBuffer(pc._buf);
      pc._buf = R.bufferReserve(maxPoints * STRIDE);
    };

    pc.append = function (chunk) {
      const n = (chunk.length / FLOATS) | 0;
      if (pc.count + n > pc.maxPoints || !pc._buf) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, pc._buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, pc.count * STRIDE, chunk);
      pc.retainedChunks.push(chunk);
      // sample weights for the alpha normalization (median -> 0.35 alpha)
      if (pc._wSamples.length < 4096) {
        for (let i = 0; i < chunk.length && pc._wSamples.length < 4096; i += FLOATS) {
          const w = (chunk[i + 3] * chunk[i + 3] + chunk[i + 4] * chunk[i + 4]) * chunk[i + 5];
          pc._wSamples.push(w);
        }
        pc._wScale = 0; // recompute lazily on next draw
      }
      pc.count += n;
    };

    function weightScale() {
      if (pc._wScale) return pc._wScale;
      if (!pc._wSamples.length) return 1;
      const s = pc._wSamples.slice().sort(function (a, b) { return a - b; });
      const median = s[(s.length / 2) | 0] || 1e-30;
      pc._wScale = 0.35 / Math.max(median, 1e-30);
      return pc._wScale;
    }

    /* st = { view, proj, model, pointScale, globalAlpha, phaseOffset,
     *        weightScale (optional override), colorPos, colorNeg } */
    pc.draw = function (st) {
      if (!pc.count || !pc._buf || R.lost) return;
      const P = programFor(pc.colorMode);
      gl.useProgram(P.id);
      gl.uniformMatrix4fv(P.u.uModel, false, st.model);
      gl.uniformMatrix4fv(P.u.uView, false, st.view);
      gl.uniformMatrix4fv(P.u.uProj, false, st.proj);
      gl.uniform1f(P.u.uPointScale, st.pointScale);
      gl.uniform1f(P.u.uGlobalAlpha, st.globalAlpha != null ? st.globalAlpha : 1);
      gl.uniform1f(P.u.uWeightScale, st.weightScale || weightScale());
      if (pc.colorMode === 'phase') {
        gl.uniform1f(P.u.uPhaseOffset, st.phaseOffset || 0);
      } else {
        const pos = st.colorPos || [1, 0.42, 0.42];
        const neg = st.colorNeg || [0.3, 0.67, 0.97];
        gl.uniform3f(P.u.uColorPos, pos[0], pos[1], pos[2]);
        gl.uniform3f(P.u.uColorNeg, neg[0], neg[1], neg[2]);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, pc._buf);
      gl.enableVertexAttribArray(P.a.aPos);
      gl.vertexAttribPointer(P.a.aPos, 3, gl.FLOAT, false, STRIDE, 0);
      gl.enableVertexAttribArray(P.a.aPsi);
      gl.vertexAttribPointer(P.a.aPsi, 2, gl.FLOAT, false, STRIDE, 12);
      gl.enableVertexAttribArray(P.a.aInvDen);
      gl.vertexAttribPointer(P.a.aInvDen, 1, gl.FLOAT, false, STRIDE, 20);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, pc.count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(P.a.aPos);
      gl.disableVertexAttribArray(P.a.aPsi);
      gl.disableVertexAttribArray(P.a.aInvDen);
    };

    pc.dispose = function () {
      if (pc._buf) { gl.deleteBuffer(pc._buf); pc._buf = null; }
      pc.retainedChunks = [];
      pc.count = 0;
      pc.maxPoints = 0;
      pc._wSamples = [];
      pc._wScale = 0;
      offRestore();
    };

    // context restore: rebuild GPU buffer from retained CPU chunks
    const offRestore = R.onRestore(function () {
      if (!pc.maxPoints) return;
      const chunks = pc.retainedChunks;
      pc._buf = R.bufferReserve(pc.maxPoints * STRIDE);
      gl.bindBuffer(gl.ARRAY_BUFFER, pc._buf);
      let off = 0;
      for (const c of chunks) {
        gl.bufferSubData(gl.ARRAY_BUFFER, off, c);
        off += c.length * 4;
      }
    });

    return pc;
  }

  VV.PointCloud = { create: create };
})();
