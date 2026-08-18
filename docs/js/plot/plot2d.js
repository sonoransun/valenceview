/* Valence View — VV.Plot: canvas-2D plots (line / heatmap / polar / niceTicks).
 * Zero GL dependency by rule (works when WebGL is absent). DPR-aware; every
 * call clears and fully redraws one canvas; coordinates in CSS px. Chrome
 * colors come from the site's CSS tokens at draw time (dark fallbacks), so
 * plots follow the theme. Heatmap fills are chunked through VV.sched, and the
 * heatmap supports first-class phase animation: mode:'phase' remaps hue by
 * phaseOffset each call, and `rotate` resamples the slice rotated about the
 * extent center (xy-slice under Larmor precession). */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const MARGIN = { l: 56, r: 16, t: 28, b: 44 };
  const CBAR_R = 72;

  const FB = {
    text: '#e6e9ee', dim: '#9aa3b2', border: '#2a313c',
    accent: '#4cc9f0', accent2: '#b18aff',
    font: '-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  };

  function styleOf(canvas) {
    let cs = null;
    try {
      if (typeof getComputedStyle === 'function') cs = getComputedStyle(canvas);
    } catch (e) { /* detached canvas */ }
    function tok(name, fb) {
      const v = cs ? cs.getPropertyValue(name).trim() : '';
      return v || fb;
    }
    return {
      text: tok('--text', FB.text),
      dim: tok('--text-dim', FB.dim),
      border: tok('--border', FB.border),
      accent: tok('--accent', FB.accent),
      accent2: tok('--accent-2', FB.accent2),
      font: tok('--font', FB.font),
    };
  }

  function isLightTheme() {
    try {
      return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
    } catch (e) { return false; }
  }

  function sizeCanvas(canvas) {
    const dpr = Math.min(self.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || canvas.width / dpr;
    const h = canvas.clientHeight || canvas.height / dpr;
    if (!(w > 4 && h > 4)) return null; // hidden panel
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  /* classic 1/2/5 x 10^k stepping */
  function niceTicks(min, max, targetCount) {
    const target = targetCount || 5;
    if (!isFinite(min) || !isFinite(max)) return { ticks: [0], fmt: String, step: 1 };
    if (min > max) { const t = min; min = max; max = t; }
    if (min === max) { const p = Math.abs(min) || 1; min -= p / 2; max += p / 2; }
    const step0 = (max - min) / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = mag * (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10);
    const ticks = [];
    const t0 = Math.ceil(min / step - 1e-9) * step;
    for (let v = t0, i = 0; v <= max + step * 1e-9 && i < 100; v += step, i++) {
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    const amax = Math.max(Math.abs(min), Math.abs(max));
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const fmt = (amax >= 1e5 || (amax > 0 && amax < 1e-3))
      ? function (v) { return v === 0 ? '0' : v.toExponential(1); }
      : function (v) { return v.toFixed(decimals); };
    return { ticks: ticks, fmt: fmt, step: step };
  }

  function dataRange(arr) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }

  function drawFrame(ctx, st, rect) {
    ctx.strokeStyle = st.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  }

  // Ticks + hairline grid + axis titles shared by line/heatmap.
  function drawAxes(ctx, st, rect, xt, yt, xScale, yScale, opts) {
    opts = opts || {};
    ctx.font = '11px ' + st.font;
    ctx.lineWidth = 1;
    // grid
    if (!opts.noGrid) {
      ctx.strokeStyle = st.border;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (const v of xt.ticks) {
        const x = Math.round(xScale(v)) + 0.5;
        ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h);
      }
      for (const v of yt.ticks) {
        const y = Math.round(yScale(v)) + 0.5;
        ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // tick labels
    ctx.fillStyle = st.dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of xt.ticks) ctx.fillText(xt.fmt(v), xScale(v), rect.y + rect.h + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yt.ticks) ctx.fillText(yt.fmt(v), rect.x - 7, yScale(v));
    // axis titles
    ctx.font = '12px ' + st.font;
    if (opts.xLabel) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(opts.xLabel, rect.x + rect.w / 2, rect.y + rect.h + 34);
    }
    if (opts.yLabel) {
      ctx.save();
      ctx.translate(14, rect.y + rect.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.yLabel, 0, 0);
      ctx.restore();
    }
  }

  function drawTitle(ctx, st, rect, title) {
    if (!title) return;
    ctx.font = '600 12px ' + st.font;
    ctx.fillStyle = st.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, rect.x, rect.y - 10);
  }

  /* ------------------------------------------------------------------ line */
  function line(canvas, spec) {
    const lay = sizeCanvas(canvas);
    if (!lay) return;
    const ctx = lay.ctx, st = styleOf(canvas);
    const rect = { x: MARGIN.l, y: MARGIN.t, w: lay.w - MARGIN.l - MARGIN.r, h: lay.h - MARGIN.t - MARGIN.b };
    const series = spec.series || [];
    const defColors = [st.accent, st.accent2, '#e07a5f', '#84a98c'];

    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series) {
      const xr = dataRange(s.xs), yr = dataRange(s.ys);
      x0 = Math.min(x0, xr[0]); x1 = Math.max(x1, xr[1]);
      y0 = Math.min(y0, yr[0]); y1 = Math.max(y1, yr[1]);
    }
    if (spec.xDomain) { x0 = spec.xDomain[0]; x1 = spec.xDomain[1]; }
    if (spec.yDomain) { y0 = spec.yDomain[0]; y1 = spec.yDomain[1]; }
    else {
      const pad = (y1 - y0 || Math.abs(y1) || 1) * 0.06;
      y0 -= pad; y1 += pad;
      if (y0 > 0 && y0 < (y1 - y0) * 0.3) y0 = 0; // anchor near-zero baselines
    }
    if (!isFinite(x0) || !isFinite(x1) || x0 === x1) { x0 = 0; x1 = 1; }

    const xt = niceTicks(x0, x1, 6), yt = niceTicks(y0, y1, 5);
    const xS = function (v) { return rect.x + ((v - x0) / (x1 - x0)) * rect.w; };
    const yS = function (v) { return rect.y + rect.h - ((v - y0) / (y1 - y0)) * rect.h; };

    drawAxes(ctx, st, rect, xt, yt, xS, yS, { xLabel: spec.xLabel, yLabel: spec.yLabel });

    // zero line (slightly stronger than grid)
    if (spec.yZeroLine !== false && y0 < 0 && y1 > 0) {
      ctx.strokeStyle = st.dim;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      const zy = Math.round(yS(0)) + 0.5;
      ctx.moveTo(rect.x, zy); ctx.lineTo(rect.x + rect.w, zy);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // reference markers (<r>, nodes, ...) — thin, annotation ink, sparse labels
    if (spec.markers) {
      ctx.font = '10px ' + st.font;
      for (const m of spec.markers) {
        if (m.x < x0 || m.x > x1) continue;
        const x = Math.round(xS(m.x)) + 0.5;
        ctx.strokeStyle = st.dim;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (m.label) {
          ctx.fillStyle = st.dim;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(m.label, x + 3, rect.y + 2);
        }
      }
    }

    // series (clipped)
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    series.forEach(function (s, si) {
      ctx.strokeStyle = s.color || defColors[si % defColors.length];
      ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      for (let i = 0; i < s.xs.length; i++) {
        const px = xS(s.xs[i]), py = yS(s.ys[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.restore();

    // legend only for >= 2 series (one series: the title names it)
    if (spec.legend !== false && series.length >= 2) {
      ctx.font = '11px ' + st.font;
      let lx = rect.x + rect.w - 8;
      ctx.textBaseline = 'middle';
      for (let si = series.length - 1; si >= 0; si--) {
        const s = series[si];
        const label = s.label || 'series ' + (si + 1);
        const tw = ctx.measureText(label).width;
        lx -= tw;
        ctx.fillStyle = st.dim;
        ctx.textAlign = 'left';
        ctx.fillText(label, lx, rect.y + 10);
        lx -= 20;
        ctx.strokeStyle = s.color || defColors[si % defColors.length];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx + 2, rect.y + 10); ctx.lineTo(lx + 16, rect.y + 10);
        ctx.stroke();
        lx -= 14;
      }
    }

    drawTitle(ctx, st, rect, spec.title);
    drawFrame(ctx, st, rect);
  }

  /* --------------------------------------------------------------- heatmap */
  const jobs = typeof WeakMap === 'function' ? new WeakMap() : null;

  function bilinear(field, nx, ny, fx, fy) {
    // fx,fy in continuous cell coords [0, nx-1] x [0, ny-1]
    const ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return NaN;
    const ix1 = Math.min(nx - 1, ix + 1), iy1 = Math.min(ny - 1, iy + 1);
    const tx = fx - ix, ty = fy - iy;
    const a = field[iy * nx + ix], b = field[iy * nx + ix1];
    const c = field[iy1 * nx + ix], d = field[iy1 * nx + ix1];
    return a + (b - a) * tx + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }

  /* heatmap(canvas, spec) -> {cancel()} | undefined
   * spec = { field: Float32Array ny*nx row-major (row 0 = y0/bottom), nx, ny,
   *   extent:{x0,x1,y0,y1}, cmap:'diverging'|'sequential', symmetric:true,
   *   gamma:1, xLabel, yLabel, colorbar:true, overlays:[{x,y,label}], title,
   *   mode:'value'|'phase', phaseField (radians, phase mode), phaseOffset,
   *   rotate (radians, resample rotated about extent center) } */
  function heatmap(canvas, spec) {
    const lay = sizeCanvas(canvas);
    if (!lay) return;
    const ctx = lay.ctx, st = styleOf(canvas);
    const colorbar = spec.colorbar !== false;
    const rect = {
      x: MARGIN.l, y: MARGIN.t,
      w: lay.w - MARGIN.l - (colorbar ? CBAR_R : MARGIN.r),
      h: lay.h - MARGIN.t - MARGIN.b,
    };
    const nx = spec.nx, ny = spec.ny, field = spec.field;
    const ext = spec.extent;
    const mode = spec.mode === 'phase' ? 'phase' : 'value';
    const gamma = spec.gamma == null ? 1 : spec.gamma;
    const Cmap = VV.Cmap;
    const divLut = isLightTheme() ? Cmap.DIVERGING_LIGHT : Cmap.DIVERGING;
    const lut = mode === 'phase' ? Cmap.PHASE
      : (spec.cmap === 'sequential' ? Cmap.SEQUENTIAL : divLut);

    let vmax = spec.vmax;
    if (vmax == null) { // field is the magnitude source in phase mode too
      vmax = 0;
      for (let i = 0; i < field.length; i++) {
        const a = Math.abs(field[i]);
        if (a > vmax) vmax = a;
      }
    }
    if (!(vmax > 0)) vmax = 1;
    const phaseOffset = spec.phaseOffset || 0;
    const rot = spec.rotate || 0;
    const cosR = Math.cos(-rot), sinR = Math.sin(-rot);
    const cx = (ext.x0 + ext.x1) / 2, cy = (ext.y0 + ext.y1) / 2;
    const INV2PI = 1 / (2 * Math.PI);

    // offscreen image at field resolution; row 0 of the image = TOP = y1
    const off = canvas.ownerDocument ? canvas.ownerDocument.createElement('canvas')
      : document.createElement('canvas');
    off.width = nx; off.height = ny;
    const offCtx = off.getContext('2d');
    const img = offCtx.createImageData(nx, ny);
    const px = img.data;

    function fillRows(jy0, jy1) {
      for (let jy = jy0; jy < jy1; jy++) {
        const iyData = ny - 1 - jy; // image row -> data row
        let o = jy * nx * 4;
        for (let ix = 0; ix < nx; ix++, o += 4) {
          let v, ph = 0, ok = true;
          if (rot !== 0) {
            const xd = ext.x0 + ((ix + 0.5) / nx) * (ext.x1 - ext.x0);
            const yd = ext.y0 + ((iyData + 0.5) / ny) * (ext.y1 - ext.y0);
            const xs = cx + cosR * (xd - cx) - sinR * (yd - cy);
            const ys = cy + sinR * (xd - cx) + cosR * (yd - cy);
            const fx = ((xs - ext.x0) / (ext.x1 - ext.x0)) * nx - 0.5;
            const fy = ((ys - ext.y0) / (ext.y1 - ext.y0)) * ny - 0.5;
            v = bilinear(field, nx, ny, fx, fy);
            if (mode === 'phase') ph = bilinear(spec.phaseField, nx, ny, fx, fy);
            if (isNaN(v)) ok = false;
          } else {
            v = field[iyData * nx + ix];
            if (mode === 'phase') ph = spec.phaseField[iyData * nx + ix];
          }
          if (!ok) { px[o + 3] = 0; continue; }
          let r, g, b, a = 255;
          if (mode === 'phase') {
            let t = (ph + phaseOffset) * INV2PI;
            t -= Math.floor(t);
            const i0 = Math.min(255, Math.max(0, Math.round(t * 255))) * 3;
            const mag = Math.pow(Math.min(1, Math.abs(v) / vmax), gamma);
            r = lut[i0] * mag; g = lut[i0 + 1] * mag; b = lut[i0 + 2] * mag;
          } else if (spec.cmap === 'sequential') {
            const t = Math.pow(Math.min(1, Math.max(0, v) / vmax), gamma);
            const i0 = Math.round(t * 255) * 3;
            r = lut[i0]; g = lut[i0 + 1]; b = lut[i0 + 2];
          } else {
            // signed: display v' = sign(v)*|v/vmax|^gamma
            const s = v < 0 ? -1 : 1;
            const vp = s * Math.pow(Math.min(1, Math.abs(v) / vmax), gamma);
            const i0 = Math.round((vp * 0.5 + 0.5) * 255) * 3;
            r = lut[i0]; g = lut[i0 + 1]; b = lut[i0 + 2];
          }
          px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
        }
      }
    }

    function blit() {
      offCtx.putImageData(img, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
      drawOverlays();
      // fires on both the sync and the chunked path — callers layering paint
      // on top of the heatmap (phase/precession overlays) re-arm here
      if (spec.onDone) { try { spec.onDone(); } catch (e) { /* caller's problem */ } }
    }

    function drawOverlays() {
      if (spec.overlays) {
        ctx.font = '10px ' + st.font;
        for (const ov of spec.overlays) {
          const x = rect.x + ((ov.x - ext.x0) / (ext.x1 - ext.x0)) * rect.w;
          const y = rect.y + rect.h - ((ov.y - ext.y0) / (ext.y1 - ext.y0)) * rect.h;
          ctx.fillStyle = st.text;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fill();
          if (ov.label) {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(ov.label, x + 5, y - 4);
          }
        }
      }
      drawFrame(ctx, st, rect);
    }

    // chrome first so the panel is never blank while a chunked fill runs
    const xt = niceTicks(ext.x0, ext.x1, 6), yt = niceTicks(ext.y0, ext.y1, 5);
    const xS = function (v) { return rect.x + ((v - ext.x0) / (ext.x1 - ext.x0)) * rect.w; };
    const yS = function (v) { return rect.y + rect.h - ((v - ext.y0) / (ext.y1 - ext.y0)) * rect.h; };
    drawAxes(ctx, st, rect, xt, yt, xS, yS, { xLabel: spec.xLabel, yLabel: spec.yLabel, noGrid: true });
    drawTitle(ctx, st, rect, spec.title);
    if (colorbar) drawColorbar(ctx, st, rect, lut, mode, spec, vmax);

    // cancel any fill still running for this canvas
    if (jobs) {
      const prev = jobs.get(canvas);
      if (prev) prev.cancel();
    }

    if (nx * ny <= 20000) {
      fillRows(0, ny);
      blit();
      return;
    }
    let row = 0;
    const job = VV.sched.submit(function (deadline) {
      while (row < ny && VV.now() < deadline) {
        const end = Math.min(ny, row + 8);
        fillRows(row, end);
        row = end;
      }
      if (row < ny) return false;
      blit();
      return true;
    }, { owner: spec.owner || 'plot-heatmap' });
    const handle = { cancel: job.cancel };
    if (jobs) jobs.set(canvas, handle);
    return handle;
  }

  function drawColorbar(ctx, st, rect, lut, mode, spec, vmax) {
    const bx = rect.x + rect.w + 14, bw = 12;
    const by = rect.y, bh = rect.h;
    for (let i = 0; i < bh; i++) {
      const t = 1 - i / (bh - 1); // top = max
      const i0 = Math.round(t * 255) * 3;
      ctx.fillStyle = 'rgb(' + lut[i0] + ',' + lut[i0 + 1] + ',' + lut[i0 + 2] + ')';
      ctx.fillRect(bx, by + i, bw, 1.5);
    }
    ctx.strokeStyle = st.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.font = '10px ' + st.font;
    ctx.fillStyle = st.dim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (mode === 'phase') {
      // cyclic hue wheel: bar bottom = phase 0, top = 2π (≡ 0)
      const labels = [['2π', 0], ['π', 0.5], ['0', 1]];
      for (const [txt, f] of labels) ctx.fillText(txt, bx + bw + 4, by + f * bh);
    } else if (spec.cmap === 'sequential') {
      const t = niceTicks(0, vmax, 4);
      for (const v of t.ticks) {
        if (v < 0 || v > vmax) continue;
        ctx.fillText(t.fmt(v), bx + bw + 4, by + bh - (v / vmax) * bh);
      }
    } else {
      const t = niceTicks(-vmax, vmax, 4); // symmetric => always includes 0
      for (const v of t.ticks) {
        if (v < -vmax || v > vmax) continue;
        ctx.fillText(t.fmt(v), bx + bw + 4, by + bh / 2 - (v / vmax) * bh / 2);
      }
    }
  }

  /* ----------------------------------------------------------------- polar */
  /* spec = { fn:(theta)=>r  OR  {thetas, rs}, mirror:true, rMax?,
   *          angleTicks:30 (deg), label } — theta measured from +z (up).
   * Multi-series form: spec.series = [{fn, color, label}] — one shared radial
   * scale, stroke-only curves, small legend (single-fn form unchanged). */
  function polar(canvas, spec) {
    const lay = sizeCanvas(canvas);
    if (!lay) return;
    const ctx = lay.ctx, st = styleOf(canvas);
    const cx = lay.w / 2, cy = lay.h / 2;
    const R = Math.min(lay.w, lay.h) / 2 - 26;

    function sampleFn(fn) {
      if (typeof fn !== 'function') return { thetas: fn.thetas, rs: fn.rs };
      const N = 256;
      const thetas = new Float32Array(N);
      const rs = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const th = (Math.PI * i) / (N - 1);
        thetas[i] = th;
        rs[i] = Math.abs(fn(th));
      }
      return { thetas: thetas, rs: rs };
    }

    const multi = Array.isArray(spec.series) && spec.series.length > 0;
    const curves = multi
      ? spec.series.map(function (s) { return sampleFn(s.fn); })
      : [sampleFn(spec.fn)];

    let rMax = spec.rMax;
    if (rMax == null) {
      rMax = 0;
      for (const c of curves) {
        for (let i = 0; i < c.rs.length; i++) if (c.rs[i] > rMax) rMax = c.rs[i];
      }
    }
    if (!(rMax > 0)) rMax = 1;
    const scale = R / rMax;

    // rings + spoke grid
    const rt = niceTicks(0, rMax, 3);
    ctx.strokeStyle = st.border;
    ctx.fillStyle = st.dim;
    ctx.font = '10px ' + st.font;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    for (const v of rt.ticks) {
      if (v <= 0 || v > rMax * 1.001) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, v * scale, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const stepDeg = spec.angleTicks || 30;
    for (let d = 0; d < 360; d += stepDeg) {
      const a = (d * Math.PI) / 180; // 0 deg = +z = up, clockwise to +x (right)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // angle labels on the right half
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = 0; d <= 180; d += stepDeg) {
      const a = (d * Math.PI) / 180;
      ctx.fillText(d + '°', cx + (R + 13) * Math.sin(a), cy - (R + 13) * Math.cos(a));
    }
    // radial tick labels along the up axis
    ctx.textAlign = 'left';
    for (const v of rt.ticks) {
      if (v <= 0 || v > rMax * 1.001) continue;
      ctx.fillText(rt.fmt(v), cx + 4, cy - v * scale - 6);
    }

    // curve: right side theta in [0,pi]; mirror reflects through the z-axis
    function tracePath(curve, side) {
      ctx.beginPath();
      for (let i = 0; i < curve.thetas.length; i++) {
        const x = cx + side * curve.rs[i] * scale * Math.sin(curve.thetas[i]);
        const y = cy - curve.rs[i] * scale * Math.cos(curve.thetas[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    const sides = spec.mirror === false ? [1] : [1, -1];
    curves.forEach(function (curve, ci) {
      const color = multi ? (spec.series[ci].color || st.accent) : st.accent;
      for (const side of sides) {
        tracePath(curve, side);
        if (!multi) { // single-series look unchanged: light fill under the curve
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    });

    if (spec.label) {
      ctx.font = '600 12px ' + st.font;
      ctx.fillStyle = st.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(spec.label, 8, 16);
    }

    // small legend for the multi-series form (identity never color-alone in
    // the data area): colored line-key + text-token label, top-left column
    if (multi && spec.series.length >= 2) {
      ctx.font = '11px ' + st.font;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      spec.series.forEach(function (s, i) {
        const y = 30 + i * 16;
        ctx.strokeStyle = s.color || st.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.lineTo(22, y);
        ctx.stroke();
        ctx.fillStyle = st.dim;
        ctx.fillText(s.label || 'series ' + (i + 1), 27, y);
      });
    }
  }

  VV.Plot = {
    line: line,
    heatmap: heatmap,
    polar: polar,
    niceTicks: niceTicks,
  };
})();
