/* Valence View — Gauss-Legendre quadrature (VV.quad).
 * Radial integrals: GL-64 on 8 equal panels of [0, rMax] (smooth exponential
 * decay → ~1e-12 effective accuracy). Angular integrals: GL-32 in x = cosθ ×
 * 64-point uniform (trapezoid/periodic) grid in φ — exact to machine precision
 * for products of real harmonics with l ≤ 3 (degree in cosθ is l+l' ≤ 6 < 63). */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const cache = Object.create(null);

  // Nodes/weights on [-1, 1] by Newton iteration on Legendre roots. Cached; do
  // not mutate the returned arrays.
  function gaussLegendre(N) {
    VV.assert(Number.isInteger(N) && N >= 2, 'gaussLegendre N >= 2');
    if (cache[N]) return cache[N];
    const x = new Float64Array(N), w = new Float64Array(N);
    const M = (N + 1) >> 1;
    for (let i = 0; i < M; i++) {
      let xi = Math.cos(Math.PI * (i + 0.75) / (N + 0.5));
      let pp = 0;
      for (let iter = 0; iter < 100; iter++) {
        // Legendre recurrence for P_N(xi) and P_{N-1}(xi)
        let p0 = 1, p1 = xi;
        for (let k = 2; k <= N; k++) {
          const p2 = ((2 * k - 1) * xi * p1 - (k - 1) * p0) / k;
          p0 = p1; p1 = p2;
        }
        pp = N * (xi * p1 - p0) / (xi * xi - 1);
        const dx = p1 / pp;
        xi -= dx;
        if (Math.abs(dx) < 1e-15) break;
      }
      x[i] = -xi;
      x[N - 1 - i] = xi;
      const wi = 2 / ((1 - xi * xi) * pp * pp);
      w[i] = wi;
      w[N - 1 - i] = wi;
    }
    cache[N] = { x: x, w: w };
    return cache[N];
  }

  // Fresh affine-mapped copy on [a, b] (safe to keep/iterate).
  function glMapped(N, a, b) {
    const g = gaussLegendre(N);
    const x = new Float64Array(N), w = new Float64Array(N);
    const half = 0.5 * (b - a), mid = 0.5 * (b + a);
    for (let i = 0; i < N; i++) { x[i] = mid + half * g.x[i]; w[i] = half * g.w[i]; }
    return { x: x, w: w };
  }

  function integrate(f, a, b, N) {
    const g = gaussLegendre(N || 64);
    const half = 0.5 * (b - a), mid = 0.5 * (b + a);
    let s = 0;
    for (let i = 0; i < g.x.length; i++) s += g.w[i] * f(mid + half * g.x[i]);
    return s * half;
  }

  // ∫_0^{rMax} f(r) dr — caller includes any r² factor in f.
  function radialIntegral(f, rMax, panels, N) {
    panels = panels || 8;
    N = N || 64;
    let s = 0;
    const h = rMax / panels;
    for (let p = 0; p < panels; p++) s += integrate(f, p * h, (p + 1) * h, N);
    return s;
  }

  // ∫_sphere g(θ, φ) dΩ  (the sinθ Jacobian is absorbed by the x = cosθ map).
  function angularIntegral(g, Nx, Nphi) {
    Nx = Nx || 32;
    Nphi = Nphi || 64;
    const gx = gaussLegendre(Nx);
    const dphi = 2 * Math.PI / Nphi;
    let s = 0;
    for (let i = 0; i < Nx; i++) {
      const theta = Math.acos(gx.x[i]);
      let sp = 0;
      for (let k = 0; k < Nphi; k++) sp += g(theta, k * dphi);
      s += gx.w[i] * sp;
    }
    return s * dphi;
  }

  VV.quad = {
    gaussLegendre: gaussLegendre,
    glMapped: glMapped,
    integrate: integrate,
    radialIntegral: radialIntegral,
    angularIntegral: angularIntegral,
  };
})();
