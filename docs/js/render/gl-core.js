/* Valence View — VV.GL: WebGL1-only core. WebGL1 reaches strictly more
 * devices and everything here is WebGL1-core (POINTS + gl_PointSize, float
 * attribs, blending, GLSL ES 1.00); webgl2 is never even requested.
 * Context-loss rule: every GPU resource must be rebuildable from retained
 * CPU-side data — modules register onRestore callbacks; the program cache is
 * cleared on loss so R.program() lazily recompiles. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const CTX_ATTRS = {
    alpha: false, antialias: true, depth: true, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false, // software GL beats no 3D
  };

  let availCache;

  function getContext(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl', CTX_ATTRS); } catch (e) { /* fall through */ }
    if (!gl) {
      try { gl = canvas.getContext('experimental-webgl', CTX_ATTRS); } catch (e) { /* fall through */ }
    }
    return gl || null;
  }

  function available() {
    if (availCache !== undefined) return availCache;
    if (typeof document === 'undefined') { availCache = false; return false; }
    try {
      const probe = document.createElement('canvas');
      availCache = !!getContext(probe);
    } catch (e) {
      availCache = false;
    }
    return availCache;
  }

  function numberedSource(src) {
    return src.split('\n').map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n');
  }

  function create(canvas, opts) {
    opts = opts || {};
    const gl = getContext(canvas);
    if (!gl) return null;

    const R = {
      gl: gl,
      canvas: canvas,
      dpr: 1,
      width: 0,
      height: 0,
      lost: false,
      maxDPR: opts.maxDPR || 2,
    };

    const programs = {};      // name -> {id, a, u}
    const restoreCbs = [];
    const lostCbs = [];

    R.program = function (name, vsSrc, fsSrc) {
      const cached = programs[name];
      if (cached) return cached;

      function compile(type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
          const log = gl.getShaderInfoLog(sh);
          gl.deleteShader(sh);
          throw new Error('VV.GL shader "' + name + '" compile failed:\n' + log +
            '\n--- source ---\n' + numberedSource(src));
        }
        return sh;
      }

      const vs = compile(gl.VERTEX_SHADER, vsSrc);
      const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
      const id = gl.createProgram();
      gl.attachShader(id, vs);
      gl.attachShader(id, fs);
      gl.linkProgram(id);
      if (!gl.getProgramParameter(id, gl.LINK_STATUS) && !gl.isContextLost()) {
        const log = gl.getProgramInfoLog(id);
        throw new Error('VV.GL program "' + name + '" link failed:\n' + log +
          '\n--- vertex ---\n' + numberedSource(vsSrc) +
          '\n--- fragment ---\n' + numberedSource(fsSrc));
      }
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      // introspect (strip "[0]" from array uniform names)
      const P = { id: id, a: {}, u: {} };
      const na = gl.getProgramParameter(id, gl.ACTIVE_ATTRIBUTES) || 0;
      for (let i = 0; i < na; i++) {
        const info = gl.getActiveAttrib(id, i);
        if (info) P.a[info.name.replace('[0]', '')] = gl.getAttribLocation(id, info.name);
      }
      const nu = gl.getProgramParameter(id, gl.ACTIVE_UNIFORMS) || 0;
      for (let i = 0; i < nu; i++) {
        const info = gl.getActiveUniform(id, i);
        if (info) P.u[info.name.replace('[0]', '')] = gl.getUniformLocation(id, info.name);
      }
      programs[name] = P;
      return P;
    };

    R.buffer = function (data) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    };

    R.bufferReserve = function (byteLen) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, byteLen, gl.STATIC_DRAW);
      return b;
    };

    // Poll once per frame (cheap); no ResizeObserver / matchMedia dependency.
    R.resize = function () {
      const dpr = Math.min(self.devicePixelRatio || 1, R.maxDPR);
      R.dpr = dpr;
      const w = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr));
      const h = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
      if (w === R.width && h === R.height) return false;
      canvas.width = w;
      canvas.height = h;
      R.width = w;
      R.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    };

    R.onRestore = function (fn) {
      restoreCbs.push(fn);
      return function () {
        const i = restoreCbs.indexOf(fn);
        if (i !== -1) restoreCbs.splice(i, 1);
      };
    };
    R.onLost = function (fn) { lostCbs.push(fn); };

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      R.lost = true;
      for (const fn of lostCbs) { try { fn(); } catch (err) { /* keep going */ } }
    }, false);

    canvas.addEventListener('webglcontextrestored', function () {
      R.lost = false;
      for (const k in programs) delete programs[k];
      R.width = 0; R.height = 0; // force viewport reset on next resize()
      for (const fn of restoreCbs) { try { fn(); } catch (err) { /* keep going */ } }
    }, false);

    return R;
  }

  VV.GL = {
    available: available,
    create: create,
  };
})();
