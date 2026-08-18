/* Valence View — VV.ui.vizGlue: OrbitalModel -> Scene descriptor (contracts.md
 * §6), plus the 2D plot view manager driving VV.Plot inside #plot2d-host.
 * 2D animations are first-class: phase-hue LUT remap for complex orbitals and
 * rigid xy-slice rotation under Larmor precession. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  const TIERS = {
    low: { points: 30000, grid: 48 },
    med: { points: 80000, grid: 64 },
    high: { points: 200000, grid: 96 },
  };
  const TOUCH = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  // One hue cycle per 8 s at speed 1 (display speed not to scale: real
  // periods are ~1e-16 s). NEGATIVE: both renderers apply offset =
  // -omegaVis*t to arg(psi), so displayed arg = m*phi - (E/hbar)t with bound
  // E < 0 — the pattern drifts toward -phi for m > 0 (theory.html §5).
  const PHASE_OMEGA = -2 * Math.PI / 8;

  /* ---------- small helpers ---------- */

  function hashSeed(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hexToRgb01(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // CPK-ish tints; fallback is a neutral slate
  const CPK = {
    H: '#e8e8e8', He: '#d9ffff', Li: '#cc80ff', Be: '#c2ff00', B: '#ffb5b5',
    C: '#909090', N: '#3050f8', O: '#ff0d0d', F: '#90e050', Ne: '#b3e3f5',
    Na: '#ab5cf2', Mg: '#8aff00', Al: '#bfa6a6', Si: '#f0c8a0', P: '#ff8000',
    S: '#ffff30', Cl: '#1ff01f', K: '#8f40d4', Ca: '#3dff00', Fe: '#e06633',
    Cu: '#c88033', Zn: '#7d80b0', Br: '#a62929', Ag: '#c0c0c0', I: '#940094',
    Au: '#ffd123', Hg: '#b8b8d0', Pb: '#575961',
  };

  function atomColorCss(sym) { return CPK[sym] || '#9aa3b2'; }

  // categorical component colors (render-owned palette; index-stable rule:
  // component i uses CATEGORICAL[i % length] everywhere). Neutral fallback
  // only guards a missing palette — it never replaces it.
  const CAT_FALLBACK = { css: '#9aa3b2', pos: [0.75, 0.78, 0.84], neg: [0.35, 0.38, 0.45] };
  function catEntry(i) {
    const cat = VV.Cmap && VV.Cmap.CATEGORICAL;
    return (cat && cat.length) ? cat[i % cat.length] : CAT_FALLBACK;
  }

  function plainLabel(cm, key) {
    const html = cm && cm.labelHTML;
    if (html) return String(html).replace(/<[^>]*>/g, '');
    return String(key || (cm && cm.key) || '');
  }

  function cssToken(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  /* ---------- adaptive VV.hydro primitive wrappers ----------
   * CORE owns the exact signatures; accept both factory and direct-eval forms. */

  function radialFn(n, l, zeff) {
    const f = VV.hydro.radialRfactory(n, l, zeff);
    if (typeof f === 'function') return f;
    if (f && typeof f.R === 'function') return f.R;
    if (f && typeof f.Rnl === 'function') return f.Rnl;
    return function (r) { return VV.hydro.radialRfactory(n, l, zeff, r); };
  }

  function ylmFn(l, m) {
    let y = null;
    try { y = VV.hydro.realYlm(l, m); } catch (e) { y = null; }
    if (typeof y === 'function') return y;
    return function (th, ph) { return VV.hydro.realYlm(l, m, th, ph); };
  }

  function makeTermState(term) {
    const R = radialFn(term.n, term.l, term.zeff);
    const Y = ylmFn(term.l, term.m);
    const psi = function (x, y, z) {
      const r = Math.sqrt(x * x + y * y + z * z);
      if (r === 0) return term.l === 0 ? R(1e-12) * Y(0, 0) : 0;
      const theta = Math.acos(VV.clamp(z / r, -1, 1));
      const phi = Math.atan2(y, x);
      return R(r) * Y(theta, phi);
    };
    const Pr = function (r) { const v = R(r); return r * r * v * v; };
    const absY = function (th, ph) { return Math.abs(Y(th, ph)); };
    let ext;
    try {
      ext = VV.hydro.suggestedExtent(term.n, term.l, term.zeff);
    } catch (e) {
      ext = (2 * term.n * term.n + 10 * term.n) / (2 * term.zeff) * 2;
    }
    return {
      psi: psi, Pr: Pr, absYlm: absY,
      rMax: function () { return ext; },
      origin: (term.origin || [0, 0, 0]).slice(),
      orient: null,
    };
  }

  /* ---------- scene descriptor ---------- */

  // Composite (multi-orbital) branch: one single-state sampler per component,
  // reusing the single-orbital construction (postScale squeeze included) with
  // per-component categorical colors. Top-level sampler/psi stay null — the
  // scene consumes desc.components instead.
  function buildCompositeDesc(model, state) {
    const viz = state.viz;
    const tier = TIERS[viz.quality] || TIERS.med;
    const K = model.components.length;
    // split the tier budget, floor 10k each; the touch cap bounds the TOTAL
    let per = Math.max(10000, Math.floor(tier.points / K));
    if (TOUCH) per = Math.max(1, Math.min(per, Math.floor(30000 / K)));

    const fieldOn = state.field.enabled;
    const B = fieldOn ? Math.pow(10, state.field.logB) : 0;
    let anyM = false;

    const components = model.components.map(function (cm, i) {
      const mQ = (cm.descriptor && cm.descriptor.m) || 0;
      if (mQ !== 0) anyM = true;
      let psi0 = cm.psi;
      let postScale = null;
      const si = cm.specInfo;
      const sq = (fieldOn && si && si.type === 'field') ? si.squeeze : 1;
      if (sq < 0.999) {
        // same draw-then-squeeze mapping as the single-orbital path, using
        // this component's own squeeze
        const inner = psi0;
        psi0 = function (x, y, z) { return inner(sq * x, sq * y, z); };
        postScale = [sq, sq, 1];
      }
      const cc = catEntry(i);
      const key = (model.keys && model.keys[i]) || cm.key;
      return {
        sampler: {
          states: [{
            psi: psi0,
            Pr: cm.Pr,
            absYlm: cm.absYlm,
            rMax: cm.rMax,
            origin: [0, 0, 0],
            orient: null,
            postScale: postScale,
          }],
          coeffs: [{ re: 1, im: 0 }],
          count: per,
          seed: hashSeed('comp|' + key + '|' + state.element),
          chunkSize: 8192,
        },
        psi: cm.psi, // signed psi for this component's iso grid (squeeze inside)
        colorPos: (cc.pos || CAT_FALLBACK.pos).slice(),
        colorNeg: (cc.neg || CAT_FALLBACK.neg).slice(),
        label: plainLabel(cm, key),
      };
    });

    let atoms = [];
    const el = VV.data.byZ(state.element);
    if (viz.showNucleus && el) {
      const css = atomColorCss(el.sym);
      atoms = [{
        sym: el.sym, pos: [0, 0, 0],
        radiusPx: 6 + el.period,
        color: hexToRgb01(css),
        colorCss: css,
      }];
    }

    // rigid precession of the whole system (visible-time mapping as single)
    const precessOmegaVis = (fieldOn && anyM)
      ? 2 * Math.PI / VV.clamp(10 / B, 2, 60) : 0;

    // grid: tier's resolution for K <= 3; drop one tier (min 48^3) for K >= 4
    let gridN = tier.grid;
    if (K >= 4) gridN = Math.max(48, gridN === 96 ? 64 : 48);
    if (TOUCH && gridN > 64) gridN = 64;

    return {
      atoms: atoms,
      bonds: [],
      extent: model.extent,
      colorMode: 'sign',
      components: components,
      sampler: null,
      psi: null,
      bAxis: fieldOn ? [0, 0, 1] : null,
      precessOmegaVis: precessOmegaVis,
      phase: null,
      gridN: gridN,
      showAxes: viz.showAxes,
      showNucleus: viz.showNucleus,
      transparent: viz.transparent,
      iso: { mode: viz.isoMode, frac: viz.isoFrac, k: viz.isoK },
    };
  }

  function buildSceneDesc(model, state) {
    if (model && model.kind === 'composite') return buildCompositeDesc(model, state);
    const viz = state.viz;
    const tier = TIERS[viz.quality] || TIERS.med;
    const sys = model.system || { kind: 'atom', atoms: [{ z: state.element, sym: '?', pos: [0, 0, 0] }], terms: [], bonds: [] };
    let count = tier.points;
    if (TOUCH) count = Math.min(count, 30000);
    if ((sys.atoms || []).length > 2) count = Math.min(count, 50000);

    const complex = model.descriptor && model.descriptor.kind === 'complex';
    const terms = sys.terms && sys.terms.length ? sys.terms : null;
    const states = [];
    const coeffs = [];
    if (!terms || (terms.length === 1 && sys.kind === 'atom')) {
      // primary orbital: use the model's own closures (B-squeeze included)
      let psi0 = (complex && model.psiComplexPhase) ? model.psiComplexPhase : model.psi;
      let postScale = null;
      const si = model.specInfo;
      const sq = (state.field.enabled && si && si.type === 'field') ? si.squeeze : 1;
      if (sq < 0.999) {
        // Pr/absYlm proposals are unsqueezed, so draws follow the unsqueezed
        // |psi|^2; evaluate psi_B at the squeezed (displayed) point and map
        // the draw there via postScale. q stays proportional to the draw
        // density, the stored re/im are psi_B at the final world point, and
        // the Jacobian 1/sq^2 matches the squeeze normalization — exact
        // |psi|^2 draws become exact |psi_B|^2 points.
        const inner = psi0;
        psi0 = function (x, y, z) { return inner(sq * x, sq * y, z); };
        postScale = [sq, sq, 1];
      }
      states.push({
        psi: psi0,
        Pr: model.Pr,
        absYlm: model.absYlm,
        rMax: model.rMax,
        origin: terms ? (terms[0].origin || [0, 0, 0]).slice() : [0, 0, 0],
        orient: null,
        postScale: postScale,
      });
      coeffs.push({ re: 1, im: 0 });
    } else {
      for (const t of terms) {
        states.push(makeTermState(t));
        coeffs.push({ re: t.coeff, im: 0 });
      }
    }

    let atoms = (sys.atoms || []).map(function (a) {
      const css = atomColorCss(a.sym);
      const el = VV.data.bySym(a.sym);
      return {
        sym: a.sym,
        pos: (a.pos || [0, 0, 0]).slice(),
        radiusPx: 6 + (el ? el.period : 2),
        color: hexToRgb01(css),
        colorCss: css,
      };
    });
    let bonds = (sys.bonds || []).map(function (b) { return b.slice(); });
    if (!viz.showNucleus) { atoms = []; bonds = []; }

    const fieldOn = state.field.enabled;
    const B = fieldOn ? Math.pow(10, state.field.logB) : 0;
    const m = model.descriptor ? model.descriptor.m : 0;
    let precessOmegaVis = 0;
    if (fieldOn && m !== 0 && !complex) {
      // visible-time mapping per spec-render §5.2(c): T = clamp(10 s / B[T], 2, 60)
      precessOmegaVis = 2 * Math.PI / VV.clamp(10 / B, 2, 60);
    }

    const seedKey = model.key + '|' + sys.kind + '|' + (sys.atoms || []).length +
      '|' + (state.comp.enabled ? state.comp.mode : '') + '|' + state.element;

    return {
      atoms: atoms,
      bonds: bonds,
      extent: model.extent,
      colorMode: viz.colorMode,
      sampler: {
        states: states,
        coeffs: coeffs,
        count: count,
        seed: hashSeed(seedKey),
        chunkSize: 8192,
      },
      psi: model.psi,
      bAxis: fieldOn ? [0, 0, 1] : null,
      precessOmegaVis: precessOmegaVis,
      phase: (complex && viz.colorMode === 'phase')
        ? { m: m, omegaVis: PHASE_OMEGA } : null,
      // advisory extras (renderer may use or ignore)
      gridN: (TOUCH && tier.grid > 64) ? 64 : tier.grid,
      showAxes: viz.showAxes,
      showNucleus: viz.showNucleus,
      transparent: viz.transparent,
      iso: { mode: viz.isoMode, frac: viz.isoFrac, k: viz.isoK },
    };
  }

  /* ---------- 2D plot views ---------- */

  const MARGIN = { l: 56, t: 28, r: 16, b: 44 };  // VV.Plot geometry (no colorbar)
  const SLICE_N = 160;      // static slice resolution
  const ANIM_N = 128;       // animated overlay resolution

  function hsv2rgb(h, s, v) {
    h = h - Math.floor(h);
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return [r * 255, g * 255, b * 255];
  }

  // 256-entry phase wheel (hue), shared by 2D phase remap
  const WHEEL = (function () {
    const w = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const rgb = hsv2rgb(i / 256, 0.85, 1);
      w[i * 3] = rgb[0]; w[i * 3 + 1] = rgb[1]; w[i * 3 + 2] = rgb[2];
    }
    return w;
  })();

  function planeEval(psi, plane, u, v) {
    if (plane === 'xy') return psi(u, v, 0);
    if (plane === 'yz') return psi(0, u, v);
    return psi(u, 0, v); // xz
  }

  function createPlot2d() {
    let host = null;
    let model = null;
    let st = null;
    let canvases = [];
    let anim = { kind: null };     // {kind:'phase',hue,val}|{kind:'precess',fieldCanvas,zeroColor}
    let lastAngle = null;
    let lastHue = null;

    function clearHost() {
      VV.sched.cancelOwner('plot2d');
      anim = { kind: null };
      lastAngle = null;
      lastHue = null;
      if (host) host.textContent = '';
      canvases = [];
    }

    function addCanvas(cls) {
      const c = document.createElement('canvas');
      c.className = 'plot2d-canvas ' + cls;
      host.appendChild(c);
      canvases.push(c);
      return c;
    }

    function visible() {
      return !!host && host.clientWidth > 0 && host.clientHeight > 0;
    }

    function seriesColor(i) {
      return i === 0 ? cssToken('--accent', '#4cc9f0') : cssToken('--accent-2', '#b18aff');
    }

    function drawRadial() {
      const cR = addCanvas('plot-radial-r');
      const cP = addCanvas('plot-radial-p');
      const rep = model.report || {};
      let rmax;
      try { rmax = model.rMax(0.999); } catch (e) { rmax = model.extent; }
      if (!isFinite(rmax) || rmax <= 0) rmax = model.extent || 10;
      const N = 400;
      const xs = new Float32Array(N);
      const yR = new Float32Array(N);
      const yP = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const r = rmax * i / (N - 1);
        xs[i] = r;
        yR[i] = model.Rnl(r);
        yP[i] = model.Pr(r);
      }
      const markers = [];
      if (isFinite(rep.expectR_a0)) markers.push({ x: rep.expectR_a0, label: '⟨r⟩' });
      if (isFinite(rep.rmp_a0)) markers.push({ x: rep.rmp_a0, label: 'r mp' });
      VV.Plot.line(cR, {
        series: [{ xs: xs, ys: yR, color: seriesColor(0), label: 'R(r)', width: 1.5 }],
        xLabel: 'r (a₀)', yLabel: 'R(r)', yZeroLine: true, legend: false,
      });
      VV.Plot.line(cP, {
        series: [{ xs: xs, ys: yP, color: seriesColor(1), label: 'r²R²', width: 1.5 }],
        xLabel: 'r (a₀)', yLabel: 'r²R²', yZeroLine: true, legend: false,
        markers: markers,
      });
    }

    /* ---- composite (multi-orbital) views ---- */

    function drawRadialComposite() {
      const cR = addCanvas('plot-radial-r');
      const cP = addCanvas('plot-radial-p');
      const comps = model.components;
      let rmax = 0;
      for (const cm of comps) {
        let r;
        try { r = cm.rMax(0.999); } catch (e) { r = 0; }
        if (isFinite(r) && r > rmax) rmax = r;
      }
      if (!(rmax > 0)) rmax = model.extent || 10;
      const N = 400;
      const xs = new Float32Array(N);
      for (let i = 0; i < N; i++) xs[i] = rmax * i / (N - 1);

      // one series per DISTINCT subshell (members share R_nl); color follows
      // the subshell's first component so it matches the 3D clouds
      const rSeries = [];
      const pSeries = [];
      for (const ss of (model.subshells || [])) {
        const ci = ss.indices[0];
        const cm = comps[ci];
        const label = ss.n + 'spdfg'.charAt(ss.l);
        const color = catEntry(ci).css;
        const yR = new Float32Array(N);
        const yP = new Float32Array(N);
        for (let i = 0; i < N; i++) { yR[i] = cm.Rnl(xs[i]); yP[i] = cm.Pr(xs[i]); }
        rSeries.push({ xs: xs, ys: yR, color: color, label: label, width: 2 });
        pSeries.push({ xs: xs, ys: yP, color: color, label: label, width: 2 });
      }
      // total D(r) = sum over COMPONENTS of r^2 R_i^2 — neutral dashed
      const yT = new Float32Array(N);
      for (const cm of comps) {
        for (let i = 0; i < N; i++) yT[i] += cm.Pr(xs[i]);
      }
      pSeries.push({
        xs: xs, ys: yT, color: cssToken('--text-dim', '#9aa3b2'),
        label: 'total D(r)', width: 2, dash: [6, 4],
      });

      VV.Plot.line(cR, {
        series: rSeries, xLabel: 'r (a₀)', yLabel: 'R(r)', yZeroLine: true,
      });
      VV.Plot.line(cP, {
        series: pSeries, xLabel: 'r (a₀)', yLabel: 'r²R²', yZeroLine: true,
      });
    }

    function drawSliceComposite() {
      const canvas = addCanvas('plot-slice');
      const plane = st.viz.plane;
      const ext = model.extent || 10;
      const n = SLICE_N;
      const field = new Float32Array(n * n);
      let row = 0;
      const density = model.density;

      VV.sched.submit(function (deadline) {
        while (row < n && VV.now() < deadline) {
          const v = -ext + 2 * ext * (row + 0.5) / n;
          for (let i = 0; i < n; i++) {
            const u = -ext + 2 * ext * (i + 0.5) / n;
            field[row * n + i] = planeEval(density, plane, u, v);
          }
          row++;
        }
        if (row < n) return false;
        if (!canvases.includes(canvas)) return true; // view switched mid-job
        const labels = { xy: ['x (a₀)', 'y (a₀)'], yz: ['y (a₀)', 'z (a₀)'], xz: ['x (a₀)', 'z (a₀)'] };
        const lab = labels[plane] || labels.xz;
        const el = VV.data.byZ(st.element);
        VV.Plot.heatmap(canvas, {
          field: field, nx: n, ny: n,
          extent: { x0: -ext, x1: ext, y0: -ext, y1: ext },
          cmap: 'sequential', symmetric: false, gamma: 0.35,
          xLabel: lab[0], yLabel: lab[1],
          colorbar: false,
          overlays: (st.viz.showNucleus && el) ? [{ x: 0, y: 0, label: el.sym }] : [],
        });
        return true; // static: no phase/precession overlay in composite
      }, { owner: 'plot2d' });
    }

    function drawAngularComposite() {
      const canvas = addCanvas('plot-polar');
      const series = model.components.map(function (cm, i) {
        // each series in its own maximal-azimuth plane: φ = π/(2|m|) for
        // m < 0 (sin-type), φ = 0 otherwise — same rule as single mode
        const m = (cm.descriptor && cm.descriptor.m) || 0;
        const phi = m < 0 ? Math.PI / (2 * -m) : 0;
        return {
          fn: function (theta) { return cm.absYlm(theta, phi); },
          color: catEntry(i).css,
          label: plainLabel(cm, model.keys && model.keys[i]),
        };
      });
      VV.Plot.polar(canvas, {
        series: series,
        mirror: true,
        angleTicks: 30,
        label: '|Y(θ)| per orbital, each at its max-φ plane',
      });
    }

    function atomsOverlay(plane, ext) {
      const out = [];
      const atoms = (model.system && model.system.atoms) || [];
      for (const a of atoms) {
        const p = a.pos || [0, 0, 0];
        let x, y, off;
        if (plane === 'xy') { x = p[0]; y = p[1]; off = p[2]; }
        else if (plane === 'yz') { x = p[1]; y = p[2]; off = p[0]; }
        else { x = p[0]; y = p[2]; off = p[1]; }
        if (Math.abs(off) < 0.05 * ext + 1e-9) out.push({ x: x, y: y, label: a.sym });
      }
      return out;
    }

    function plotRect(canvas) {
      // interior of VV.Plot's documented margins, in device px
      const dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
      return {
        x: MARGIN.l * dpr, y: MARGIN.t * dpr,
        w: Math.max(1, canvas.width - (MARGIN.l + MARGIN.r) * dpr),
        h: Math.max(1, canvas.height - (MARGIN.t + MARGIN.b) * dpr),
      };
    }

    function drawSlice() {
      const canvas = addCanvas('plot-slice');
      const plane = st.viz.plane;
      const ext = model.extent || 10;
      const complexPhase = model.descriptor && model.descriptor.kind === 'complex' &&
        st.viz.colorMode === 'phase' && typeof model.psiComplexPhase === 'function';
      const n = SLICE_N;
      const field = new Float32Array(n * n);
      const mag = complexPhase ? new Float32Array(n * n) : null;
      const ph = complexPhase ? new Float32Array(n * n) : null;
      let row = 0;

      VV.sched.submit(function (deadline) {
        while (row < n && VV.now() < deadline) {
          const v = -ext + 2 * ext * (row + 0.5) / n;
          for (let i = 0; i < n; i++) {
            const u = -ext + 2 * ext * (i + 0.5) / n;
            if (complexPhase) {
              const c = planeEval(model.psiComplexPhase, plane, u, v);
              const a = Math.sqrt(c.re * c.re + c.im * c.im);
              field[row * n + i] = a * a;
              mag[row * n + i] = a;
              ph[row * n + i] = Math.atan2(c.im, c.re);
            } else {
              field[row * n + i] = planeEval(model.psi, plane, u, v);
            }
          }
          row++;
        }
        if (row < n) return false;
        finishSlice(canvas, plane, ext, field, mag, ph);
        return true;
      }, { owner: 'plot2d' });
    }

    function finishSlice(canvas, plane, ext, field, mag, ph) {
      if (!canvases.includes(canvas)) return; // view switched mid-job
      const labels = { xy: ['x (a₀)', 'y (a₀)'], yz: ['y (a₀)', 'z (a₀)'], xz: ['x (a₀)', 'z (a₀)'] };
      const lab = labels[plane] || labels.xz;
      const n = SLICE_N;
      const extents = { x0: -ext, x1: ext, y0: -ext, y1: ext };
      const complexPhase = !!mag;

      VV.Plot.heatmap(canvas, {
        field: field, nx: n, ny: n, extent: extents,
        cmap: complexPhase ? 'sequential' : 'diverging',
        symmetric: !complexPhase,
        gamma: complexPhase ? 0.35 : 1,
        xLabel: lab[0], yLabel: lab[1],
        colorbar: false, // keeps MARGIN geometry valid for the anim overlays
        overlays: atomsOverlay(plane, ext),
        onDone: function () {
          // a chunked blit lands after the overlay was first painted and
          // overwrites it; repaint and force the next tick to redraw
          if (anim && anim.canvas === canvas) {
            lastHue = null;
            lastAngle = null;
            if (anim.kind === 'phase') drawPhaseOverlay(0);
            else if (anim.kind === 'precess') drawPrecessOverlay(0);
          }
        },
      });

      const fieldOn = st.field.enabled;
      const m = model.descriptor ? model.descriptor.m : 0;

      if (complexPhase) {
        // per-pixel hue/value bytes for the animated LUT remap
        const N2 = ANIM_N;
        const hue = new Uint8Array(N2 * N2);
        const val = new Uint8Array(N2 * N2);
        let magMax = 0;
        for (let i = 0; i < mag.length; i++) if (mag[i] > magMax) magMax = mag[i];
        if (magMax <= 0) magMax = 1;
        for (let j = 0; j < N2; j++) {
          const sj = Math.min(n - 1, Math.floor(j * n / N2));
          for (let i = 0; i < N2; i++) {
            const si = Math.min(n - 1, Math.floor(i * n / N2));
            const idx = sj * n + si;
            hue[j * N2 + i] = Math.round(((ph[idx] / (2 * Math.PI)) % 1 + 1) * 256) & 255;
            val[j * N2 + i] = Math.min(255, Math.round(Math.pow(mag[idx] / magMax, 0.7) * 255));
          }
        }
        anim = {
          kind: 'phase', canvas: canvas, hue: hue, val: val, n: N2,
          omegaVis: PHASE_OMEGA,
          buf: document.createElement('canvas'),
        };
        anim.buf.width = N2;
        anim.buf.height = N2;
        anim.img = anim.buf.getContext('2d').createImageData(N2, N2);
        drawPhaseOverlay(0);
      } else if (fieldOn && m !== 0 && plane === 'xy') {
        // rigid Larmor rotation of the xy slice: pre-render the LUT-mapped
        // field once, rotate it per frame
        const buf = document.createElement('canvas');
        buf.width = n;
        buf.height = n;
        const bctx = buf.getContext('2d');
        const img = bctx.createImageData(n, n);
        let vmax = 0;
        for (let i = 0; i < field.length; i++) {
          const a = Math.abs(field[i]);
          if (a > vmax) vmax = a;
        }
        if (vmax <= 0) vmax = 1;
        const lut = (typeof matchMedia === 'function' &&
                     matchMedia('(prefers-color-scheme: light)').matches)
          ? VV.Cmap.DIVERGING_LIGHT : VV.Cmap.DIVERGING;
        for (let i = 0; i < field.length; i++) {
          const t = VV.clamp(0.5 + 0.5 * field[i] / vmax, 0, 1);
          const li = Math.min(255, Math.round(t * 255));
          img.data[i * 4] = lut[li * 3];
          img.data[i * 4 + 1] = lut[li * 3 + 1];
          img.data[i * 4 + 2] = lut[li * 3 + 2];
          img.data[i * 4 + 3] = 255;
        }
        bctx.putImageData(img, 0, 0);
        const zi = 128;
        const B = Math.pow(10, st.field.logB);
        anim = {
          kind: 'precess', canvas: canvas, fieldCanvas: buf,
          omegaVis: 2 * Math.PI / VV.clamp(10 / B, 2, 60),
          zeroColor: 'rgb(' + lut[zi * 3] + ',' + lut[zi * 3 + 1] + ',' + lut[zi * 3 + 2] + ')',
        };
        drawPrecessOverlay(0);
      }
    }

    function drawPhaseOverlay(offsetByte) {
      const a = anim;
      if (a.kind !== 'phase') return;
      const data = a.img.data;
      const N2 = a.n;
      for (let i = 0; i < N2 * N2; i++) {
        const wi = ((a.hue[i] + offsetByte) & 255) * 3;
        const v = a.val[i] / 255;
        data[i * 4] = WHEEL[wi] * v;
        data[i * 4 + 1] = WHEEL[wi + 1] * v;
        data[i * 4 + 2] = WHEEL[wi + 2] * v;
        data[i * 4 + 3] = 255;
      }
      a.buf.getContext('2d').putImageData(a.img, 0, 0);
      const ctx = a.canvas.getContext('2d');
      const r = plotRect(a.canvas);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      // image row 0 = y0 (bottom): flip vertically into the plot rect
      ctx.translate(r.x, r.y + r.h);
      ctx.scale(1, -1);
      ctx.drawImage(a.buf, 0, 0, r.w, r.h);
      ctx.restore();
    }

    function drawPrecessOverlay(angle) {
      const a = anim;
      if (a.kind !== 'precess') return;
      const ctx = a.canvas.getContext('2d');
      const r = plotRect(a.canvas);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.fillStyle = a.zeroColor;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.imageSmoothingEnabled = true;
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      // canvas y points down: negative angle = counter-clockwise in world xy
      ctx.scale(1, -1);
      ctx.rotate(angle);
      ctx.drawImage(a.fieldCanvas, -r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }

    function drawAngular() {
      const canvas = addCanvas('plot-polar');
      // sin-type real orbitals (m < 0) vanish identically at φ = 0; evaluate in
      // the maximal-azimuth plane φ = π/(2|m|) where sin(|m|φ) = 1
      const m = (model.descriptor && model.descriptor.m) || 0;
      const phi = m < 0 ? Math.PI / (2 * -m) : 0;
      VV.Plot.polar(canvas, {
        fn: function (theta) { return model.absYlm(theta, phi); },
        mirror: true,
        angleTicks: 30,
        label: '|Y(θ)| at φ = ' + (m < 0 ? Math.round(90 / -m) + '°' : '0'),
      });
    }

    function rebuild() {
      clearHost();
      if (!model || !visible()) return;
      const composite = model.kind === 'composite';
      try {
        if (st.viz.plot2d === 'radial') (composite ? drawRadialComposite : drawRadial)();
        else if (st.viz.plot2d === 'slice') (composite ? drawSliceComposite : drawSlice)();
        else (composite ? drawAngularComposite : drawAngular)();
      } catch (e) {
        if (typeof console !== 'undefined') console.error('plot2d:', e);
      }
    }

    return {
      mount: function (el) { host = el; },

      render: function (m, state) {
        model = m;
        st = state;
        rebuild();
      },

      // called on resize / tab-shown; redraws with current data
      resize: function () {
        if (st) rebuild();
      },

      updateState: function (state) { st = state; },

      needsAnim: function () { return anim.kind !== null; },

      tick: function (clock) {
        if (!anim.kind || !visible()) return false;
        if (anim.kind === 'phase') {
          const off = Math.round(-anim.omegaVis * clock.t / (2 * Math.PI) * 256) & 255;
          const b = (off + 256) & 255;
          if (b === lastHue) return false;
          lastHue = b;
          drawPhaseOverlay(b);
          return true;
        }
        if (anim.kind === 'precess') {
          const angle = anim.omegaVis * clock.t;
          if (lastAngle !== null && Math.abs(angle - lastAngle) < 0.002) return false;
          lastAngle = angle;
          drawPrecessOverlay(angle);
          return true;
        }
        return false;
      },
    };
  }

  VV.ui.vizGlue = {
    TIERS: TIERS,
    isTouch: TOUCH,
    buildSceneDesc: buildSceneDesc,
    plot2d: createPlot2d(),
  };
})();
