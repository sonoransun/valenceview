/* Valence View — VV.Camera: turntable (orbit) camera, +z up on screen
 * (chemistry convention: p_z vertical), Pointer Events only, wheel zoom,
 * pinch/pan, inertia, animated double-click reset. Plus the 2D-canvas axes
 * gizmo (VV.Camera.drawGizmo) with optional B-field arrow. Deps: VV.M. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  const M = VV.M;

  const DEG = Math.PI / 180;

  function Camera(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.target = [0, 0, 0];
    this.dist = opts.dist || 10;
    this.theta = opts.theta != null ? opts.theta : -60 * DEG; // azimuth
    this.phi = opts.phi != null ? opts.phi : 65 * DEG;        // polar from +z
    this.fovY = opts.fovY || 45 * DEG;
    this.minDist = 0.5;
    this.maxDist = 200;
    this.enablePan = opts.enablePan !== false;
    this.onchange = null;

    this._vel = { theta: 0, phi: 0 };
    this._ema = { theta: 0, phi: 0 };
    this._pointers = new Map();
    this._pinchDist = 0;
    this._dirty = false;
    this._anim = null; // {from:{...}, to:{...}, t0}
    this._home = {
      theta: this.theta, phi: this.phi, dist: this.dist,
      target: [0, 0, 0],
    };
    this._eye = [0, 0, 0];

    if (canvas && canvas.addEventListener) this._bind(canvas);
  }

  Camera.prototype._changed = function () {
    this._dirty = true;
    if (this.onchange) this.onchange();
  };

  Camera.prototype._bind = function (canvas) {
    const cam = this;

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      // double-tap reset (dblclick is unreliable for touch on iOS)
      if (e.pointerType === 'touch' && cam._pointers.size === 0) {
        const now = VV.now();
        if (now - (cam._lastTap || 0) < 300) { cam.reset(); }
        cam._lastTap = now;
      }
      if (canvas.focus) canvas.focus(); // preventDefault below suppresses click-focus
      cam._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, t: VV.now() });
      cam._vel.theta = 0; cam._vel.phi = 0;
      cam._ema.theta = 0; cam._ema.phi = 0;
      cam._anim = null;
      if (cam._pointers.size === 2) {
        const ps = Array.from(cam._pointers.values());
        cam._pinchDist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      }
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
      const p = cam._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      const now = VV.now();
      const dt = Math.max(1, now - p.t);
      if (cam._pointers.size === 1) {
        const rightDrag = (e.buttons & 2) !== 0 || p.button === 2;
        if (rightDrag && cam.enablePan) {
          cam._pan(dx, dy);
        } else {
          const dTheta = -dx * 0.008, dPhi = -dy * 0.008;
          cam.theta += dTheta;
          cam.phi = VV.clamp(cam.phi + dPhi, 0.02, Math.PI - 0.02);
          // EMA of angular velocity (rad/ms) for release inertia
          cam._ema.theta = 0.7 * cam._ema.theta + 0.3 * (dTheta / dt);
          cam._ema.phi = 0.7 * cam._ema.phi + 0.3 * (dPhi / dt);
          cam._changed();
        }
      } else if (cam._pointers.size === 2) {
        p.x = e.clientX; p.y = e.clientY; p.t = now;
        const ps = Array.from(cam._pointers.values());
        const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        if (cam._pinchDist > 0 && d > 0) {
          cam.dist = VV.clamp(cam.dist * (cam._pinchDist / d), cam.minDist, cam.maxDist);
        }
        cam._pinchDist = d;
        if (cam.enablePan) cam._pan(dx / 2, dy / 2); // 2-finger drag pans
        cam._changed();
        return;
      }
      p.x = e.clientX; p.y = e.clientY; p.t = now;
    });

    function release(e) {
      if (!cam._pointers.has(e.pointerId)) return;
      cam._pointers.delete(e.pointerId);
      if (cam._pointers.size === 0) {
        // convert EMA (rad/ms) to rad/frame @60Hz
        cam._vel.theta = cam._ema.theta * 16.7;
        cam._vel.phi = cam._ema.phi * 16.7;
      }
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // lines -> px
      else if (e.deltaMode === 2) dy *= 160;
      cam.dist = VV.clamp(cam.dist * Math.exp(dy * 0.001), cam.minDist, cam.maxDist);
      cam._changed();
    }, { passive: false });

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('dblclick', function () { cam.reset(); });

    // keyboard: arrows rotate (Shift = pan), +/-/PageUp/PageDown zoom,
    // Home resets (same path as double-click). Direct response, no inertia.
    canvas.tabIndex = 0;
    if (canvas.setAttribute && !canvas.hasAttribute('aria-label')) {
      canvas.setAttribute('aria-label',
        '3D orbital view. Arrow keys rotate, Shift plus arrow keys pan, ' +
        'plus and minus zoom, Home resets the view.');
    }
    canvas.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const ROT = 3 * DEG;      // per keypress, matches a small drag
      const PAN = 12;           // CSS px, matches a small right-drag
      const pan = e.shiftKey && cam.enablePan;
      let handled = true;
      switch (e.key) {
        case 'ArrowRight':
          if (pan) cam._pan(PAN, 0);
          else { cam.theta -= ROT; cam._changed(); }
          break;
        case 'ArrowLeft':
          if (pan) cam._pan(-PAN, 0);
          else { cam.theta += ROT; cam._changed(); }
          break;
        case 'ArrowUp':
          if (pan) cam._pan(0, -PAN);
          else { cam.phi = VV.clamp(cam.phi + ROT, 0.02, Math.PI - 0.02); cam._changed(); }
          break;
        case 'ArrowDown':
          if (pan) cam._pan(0, PAN);
          else { cam.phi = VV.clamp(cam.phi - ROT, 0.02, Math.PI - 0.02); cam._changed(); }
          break;
        case '+': case '=': case 'PageUp':
          cam.dist = VV.clamp(cam.dist * 0.9, cam.minDist, cam.maxDist);
          cam._changed();
          break;
        case '-': case '_': case 'PageDown':
          cam.dist = VV.clamp(cam.dist / 0.9, cam.minDist, cam.maxDist);
          cam._changed();
          break;
        case 'Home':
          cam.reset();
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        if (e.key !== 'Home') { // direct response: stop inertia/reset animation
          cam._vel.theta = 0; cam._vel.phi = 0;
          cam._anim = null;
        }
      }
    });
  };

  Camera.prototype._pan = function (dx, dy) {
    // translate target along camera right/up
    const e = this.eye(this._eye);
    const fwd = [this.target[0] - e[0], this.target[1] - e[1], this.target[2] - e[2]];
    M.v3norm(fwd, fwd);
    const right = M.v3cross([0, 0, 0], fwd, [0, 0, 1]);
    M.v3norm(right, right);
    const up = M.v3cross([0, 0, 0], right, fwd);
    const hPx = this.canvas ? (this.canvas.clientHeight || 400) : 400;
    const scale = (this.dist * Math.tan(this.fovY / 2) * 2) / hPx;
    for (let i = 0; i < 3; i++) {
      this.target[i] += (-dx * right[i] + dy * up[i]) * scale;
    }
    this._changed();
  };

  Camera.prototype.eye = function (out3) {
    out3 = out3 || [0, 0, 0];
    const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    out3[0] = this.target[0] + this.dist * sp * Math.cos(this.theta);
    out3[1] = this.target[1] + this.dist * sp * Math.sin(this.theta);
    out3[2] = this.target[2] + this.dist * cp;
    return out3;
  };

  Camera.prototype.viewMatrix = function (out16) {
    return M.m4lookAt(out16, this.eye(this._eye), this.target, [0, 0, 1]);
  };

  Camera.prototype.projMatrix = function (out16, aspect) {
    const near = Math.max(0.01, this.dist * 0.02);
    const far = this.dist * 40 + 10;
    return M.m4persp(out16, this.fovY, aspect, near, far);
  };

  Camera.prototype.frame = function (radius, center) {
    if (center) { this.target[0] = center[0]; this.target[1] = center[1]; this.target[2] = center[2]; }
    const d = (1.2 * radius) / Math.tan(this.fovY / 2);
    this.dist = d;
    this.minDist = 0.25 * d;
    this.maxDist = 8 * d;
    this._home.dist = d;
    this._home.target = [this.target[0], this.target[1], this.target[2]];
    this._changed();
  };

  // Animated 300 ms reset to the framed home view.
  Camera.prototype.reset = function () {
    this._vel.theta = 0; this._vel.phi = 0;
    // unwrap theta so the animation takes the short way round
    const twoPi = 2 * Math.PI;
    let toTheta = this._home.theta;
    while (toTheta - this.theta > Math.PI) toTheta -= twoPi;
    while (toTheta - this.theta < -Math.PI) toTheta += twoPi;
    this._anim = {
      t0: VV.now(),
      from: { theta: this.theta, phi: this.phi, dist: this.dist, target: this.target.slice() },
      to: { theta: toTheta, phi: this._home.phi, dist: this._home.dist, target: this._home.target.slice() },
    };
    this._changed();
  };

  // Integrates inertia + reset animation; returns true if a redraw is needed.
  Camera.prototype.update = function (dt) {
    let changed = this._dirty;
    this._dirty = false;

    if (this._anim) {
      const a = this._anim;
      const t = VV.clamp((VV.now() - a.t0) / 300, 0, 1);
      const s = 0.5 - 0.5 * Math.cos(Math.PI * t); // cosine ease
      this.theta = a.from.theta + (a.to.theta - a.from.theta) * s;
      this.phi = a.from.phi + (a.to.phi - a.from.phi) * s;
      this.dist = a.from.dist + (a.to.dist - a.from.dist) * s;
      for (let i = 0; i < 3; i++) this.target[i] = a.from.target[i] + (a.to.target[i] - a.from.target[i]) * s;
      if (t >= 1) this._anim = null;
      changed = true;
    } else if (this._pointers.size === 0 &&
      (Math.abs(this._vel.theta) > 1e-4 || Math.abs(this._vel.phi) > 1e-4)) {
      this.theta += this._vel.theta;
      this.phi = VV.clamp(this.phi + this._vel.phi, 0.02, Math.PI - 0.02);
      const decay = Math.pow(0.92, (dt || 0.016) * 60);
      this._vel.theta *= decay;
      this._vel.phi *= decay;
      changed = true;
    }
    return changed;
  };

  // CSS-px screen coords; false if the point is behind the camera.
  Camera.prototype.project = function (out2, p3, viewProjM4, wCss, hCss) {
    const m = viewProjM4;
    const x = p3[0], y = p3[1], z = p3[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 1e-6) return false;
    const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out2[0] = (cx * 0.5 + 0.5) * wCss;
    out2[1] = (1 - (cy * 0.5 + 0.5)) * hCss;
    return true;
  };

  /* Axes gizmo on a 2D canvas overlay: rotate unit x,y,z by the view
   * rotation, orthographic-project, depth-sort (nearer last); back-pointing
   * axes at 40% alpha. bAxis (or null) draws a labeled field arrow. ctx must
   * already be DPR-scaled; draws into a size x size CSS-px square. */
  const _gv = new Float32Array(16);
  const _g3 = new Float32Array(9);
  Camera.drawGizmo = function (ctx, cam, bAxis, size) {
    size = size || 84;
    const c = size / 2;
    const L = size * 0.33;
    ctx.clearRect(0, 0, size, size);
    cam.viewMatrix(_gv);
    M.m3fromM4(_g3, _gv);
    // view coords of a world dir v: (col-major 3x3 rows are camera axes)
    function viewDir(v) {
      return [
        _g3[0] * v[0] + _g3[3] * v[1] + _g3[6] * v[2],
        _g3[1] * v[0] + _g3[4] * v[1] + _g3[7] * v[2],
        _g3[2] * v[0] + _g3[5] * v[1] + _g3[8] * v[2],
      ];
    }
    const axes = [
      { v: [1, 0, 0], color: '#e5646c', label: 'x' },
      { v: [0, 1, 0], color: '#58b368', label: 'y' },
      { v: [0, 0, 1], color: '#4dabf7', label: 'z' },
    ];
    const drawn = axes.map(function (a) {
      const d = viewDir(a.v);
      return { d: d, color: a.color, label: a.label };
    });
    drawn.sort(function (a, b) { return a.d[2] - b.d[2]; }); // nearer (larger z) last
    ctx.font = '600 10px -apple-system,"Segoe UI",Roboto,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const a of drawn) {
      const x2 = c + a.d[0] * L, y2 = c - a.d[1] * L;
      ctx.globalAlpha = a.d[2] < 0 ? 0.4 : 1;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.fillStyle = a.color;
      ctx.fillText(a.label, c + a.d[0] * (L + 8), c - a.d[1] * (L + 8));
    }
    if (bAxis) {
      const d = viewDir(bAxis);
      const bl = Math.hypot(d[0], d[1], d[2]) || 1;
      const dx = d[0] / bl, dy = d[1] / bl, dz = d[2] / bl;
      const BL = size * 0.42;
      const x2 = c + dx * BL, y2 = c - dy * BL;
      ctx.globalAlpha = dz < 0 ? 0.5 : 1;
      ctx.strokeStyle = '#4cc9f0';
      ctx.fillStyle = '#4cc9f0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // arrowhead
      const sl = Math.hypot(x2 - c, y2 - c) || 1;
      const ux = (x2 - c) / sl, uy = (y2 - c) / sl;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 7 * ux + 3.5 * uy, y2 - 7 * uy - 3.5 * ux);
      ctx.lineTo(x2 - 7 * ux - 3.5 * uy, y2 - 7 * uy + 3.5 * ux);
      ctx.closePath();
      ctx.fill();
      ctx.fillText('B', c + dx * (BL + 10), c - dy * (BL + 10));
    }
    ctx.globalAlpha = 1;
  };

  VV.Camera = Camera;
})();
