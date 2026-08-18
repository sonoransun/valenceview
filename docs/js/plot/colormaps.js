/* Valence View — VV.Cmap: embedded colormap LUTs (256 x RGB, no fetch).
 * Palette follows the dataviz method with the site's design tokens as the
 * system parameters: the diverging pair is the CVD-safe red/blue lobe pair
 * (--pos-lobe #ff6b6b / --neg-lobe #4dabf7 from css/base.css) around a
 * NEUTRAL midpoint, per-arm lightness monotone (validated in test-render.js).
 * DIVERGING is dark-centered (the canonical map: 3D panel and default theme
 * are dark, so |psi|~0 recedes into the surface); DIVERGING_LIGHT mirrors it
 * with a near-white midpoint for the light theme's 2D plots. Indices 16 and
 * 240 hold the exact lobe tokens — they are the single source of the 3D lobe
 * colors (uColorPos/uColorNeg), one palette across 2D and 3D.
 * SEQUENTIAL is the perceptually-uniform viridis ramp (8 anchors, lerped).
 * PHASE is cyclic hsv(h, 0.85, 1.0), matching the point-cloud shader's
 * hsv2rgb so 2D phase hues equal 3D phase hues. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // stops: [[index0..255, '#rrggbb'], ...] ascending; linear sRGB-space lerp.
  function buildLUT(stops) {
    const lut = new Uint8Array(768);
    let s = 0;
    for (let i = 0; i < 256; i++) {
      while (s < stops.length - 2 && i > stops[s + 1][0]) s++;
      const [i0, h0] = stops[s], [i1, h1] = stops[s + 1];
      const a = hex(h0), b = hex(h1);
      const t = i1 > i0 ? Math.min(1, Math.max(0, (i - i0) / (i1 - i0))) : 0;
      lut[i * 3] = Math.round(a[0] + (b[0] - a[0]) * t);
      lut[i * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * t);
      lut[i * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * t);
    }
    return lut;
  }

  const DIVERGING = buildLUT([
    [0, '#8ed1ff'],
    [16, '#4dabf7'],   // == --neg-lobe
    [76, '#2c68a8'],
    [128, '#262a31'],  // neutral dark midpoint (zero recedes into the panel)
    [180, '#a04a45'],
    [240, '#ff6b6b'],  // == --pos-lobe
    [255, '#ffb1a6'],
  ]);

  const DIVERGING_LIGHT = buildLUT([
    [0, '#0b4a8a'],
    [16, '#1c6dc2'],
    [76, '#8ab6e8'],
    [128, '#f0efec'],  // near-white neutral midpoint
    [180, '#e89083'],
    [240, '#c0392f'],
    [255, '#8c221c'],
  ]);

  const SEQUENTIAL = buildLUT([
    [0, '#440154'], [36, '#46327e'], [73, '#365c8d'], [109, '#277f8e'],
    [146, '#1fa187'], [182, '#4ac16d'], [219, '#a0da39'], [255, '#fde725'],
  ]);

  // h,s,v in [0,1] -> [r,g,b] in [0,1]; same formulation as the GLSL helper.
  function hsv2rgb(h, s, v) {
    h = h - Math.floor(h);
    const out = [0, 0, 0];
    const K = [0, 2 / 3, 1 / 3];
    for (let i = 0; i < 3; i++) {
      let p = Math.abs(((h + K[i]) % 1) * 6 - 3) - 1;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      out[i] = v * (1 + s * (p - 1));
    }
    return out;
  }

  const PHASE = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    const c = hsv2rgb(i / 256, 0.85, 1.0);
    PHASE[i * 3] = Math.round(c[0] * 255);
    PHASE[i * 3 + 1] = Math.round(c[1] * 255);
    PHASE[i * 3 + 2] = Math.round(c[2] * 255);
  }

  /* CATEGORICAL: composite-mode per-orbital identity palette (dataviz method).
   * 8 hues in the validated fixed order; component i uses entry i % 8 in every
   * layer (3D clouds, iso lobes, chips, legend, 2D series). `css` is the
   * chip/series color — passes all six categorical checks on both site themes
   * (worst adjacent CVD dE 8.4, normal 19.3, contrast >= 3:1 on #171b22 and
   * #ffffff). Sign-as-shade: `pos` is a light tint and `neg` a clearly darker
   * shade of the SAME OKLCH hue (per-slot dL >= 0.21), OKLCH-derived and
   * gamut-mapped for the fixed #0b0e14 3D ground with additive blending
   * (derived-set worst adjacent CVD dE 9.4 pos / 8.6 neg, normal 17.6 / 19.7,
   * Machado-Oliveira-Fernandes severity-1.0). Floats are display-sRGB 0..1,
   * the same space as the lobeColors() uniforms. */
  const CATEGORICAL = [
    ['#3987e5', '#87bafd', '#1467c2'], // blue
    ['#d95926', '#f9875e', '#b03d05'], // orange
    ['#199e70', '#6ed8a9', '#037651'], // aqua
    ['#c98500', '#ffba58', '#b17500'], // yellow
    ['#d55181', '#f48cac', '#ad3564'], // magenta
    ['#008300', '#61b55c', '#016501'], // green
    ['#9085e9', '#9f96f7', '#6352bb'], // violet
    ['#e66767', '#fb9894', '#c04347'], // red
  ].map(function (row) {
    const p = hex(row[1]), n = hex(row[2]);
    return {
      css: row[0],
      pos: [p[0] / 255, p[1] / 255, p[2] / 255],
      neg: [n[0] / 255, n[1] / 255, n[2] / 255],
    };
  });

  function sample(lut, t01) {
    let t = t01;
    if (!isFinite(t)) t = 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const f = t * 255;
    const i0 = Math.floor(f);
    const i1 = Math.min(255, i0 + 1);
    const ft = f - i0;
    return [
      Math.round(lut[i0 * 3] + (lut[i1 * 3] - lut[i0 * 3]) * ft),
      Math.round(lut[i0 * 3 + 1] + (lut[i1 * 3 + 1] - lut[i0 * 3 + 1]) * ft),
      Math.round(lut[i0 * 3 + 2] + (lut[i1 * 3 + 2] - lut[i0 * 3 + 2]) * ft),
    ];
  }

  function toCSS(lut, t01) {
    const c = sample(lut, t01);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  // 3D lobe colors, [0,1] floats for GL uniforms; single source of truth.
  function lobeColors() {
    return {
      pos: [DIVERGING[240 * 3] / 255, DIVERGING[240 * 3 + 1] / 255, DIVERGING[240 * 3 + 2] / 255],
      neg: [DIVERGING[16 * 3] / 255, DIVERGING[16 * 3 + 1] / 255, DIVERGING[16 * 3 + 2] / 255],
    };
  }

  VV.Cmap = {
    DIVERGING: DIVERGING,
    DIVERGING_LIGHT: DIVERGING_LIGHT,
    SEQUENTIAL: SEQUENTIAL,
    PHASE: PHASE,
    CATEGORICAL: CATEGORICAL,
    sample: sample,
    toCSS: toCSS,
    lobeColors: lobeColors,
    hsv2rgb: hsv2rgb,
  };
})();
