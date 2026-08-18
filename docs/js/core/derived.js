/* Valence View — closed-form derived quantities (VV.derived). r in a0,
 * z = Z_eff as a Number. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  function expectationR(n, l, z) { return (3 * n * n - l * (l + 1)) / (2 * z); }
  function expectationR2(n, l, z) { return n * n * (5 * n * n + 1 - 3 * l * (l + 1)) / (2 * z * z); }
  function expectationInvR(n, l, z) { return z / (n * n); }
  function radialNodes(n, l) { return n - l - 1; }
  function angularNodes(l) { return l; }
  function nodeGeometry(l, m) { return { planar: Math.abs(m), conical: l - Math.abs(m) }; }

  /* Most probable radius: global max of P(r) = r²R². 512-point scan on
   * (0, 2<r>] brackets the global max; then bisection on
   *   u'(r) = (2l+2)/r − c + 2c·Q'(ρ)/Q(ρ),  ρ = c·r,  c = 2z/n
   * (the derivative of ln P written via the Laguerre polynomial Q) nails it to
   * machine precision; golden-section fallback if the bracket is unusual.
   * Exact anchor: l = n−1 → Q ≡ const → r* = n²/z. */
  function mostProbableRadius(n, l, z) {
    const c = 2 * z / n;
    const co = VV.special.laguerreCoeffs(n - l - 1, 2 * l + 1);
    const k = co.length - 1;
    function Q(rho) {
      let s = co[k];
      for (let i = k - 1; i >= 0; i--) s = s * rho + co[i];
      return s;
    }
    function Qp(rho) {
      if (k === 0) return 0;
      let s = co[k] * k;
      for (let i = k - 1; i >= 1; i--) s = s * rho + co[i] * i;
      return s;
    }
    function P(r) {
      const rho = c * r;
      const q = Q(rho);
      return Math.pow(rho, 2 * l + 2) * Math.exp(-rho) * q * q;
    }
    function uprime(r) {
      const rho = c * r;
      return (2 * l + 2) / r - c + 2 * c * Qp(rho) / Q(rho);
    }
    const hi = 2 * expectationR(n, l, z);
    const N = 512, dr = hi / N;
    let best = 1, bestV = -1;
    for (let i = 1; i <= N; i++) {
      const v = P(i * dr);
      if (v > bestV) { bestV = v; best = i; }
    }
    let a = Math.max(dr * 0.5, (best - 1) * dr), b = Math.min(hi, (best + 1) * dr);
    if (uprime(a) > 0 && uprime(b) < 0) {
      for (let i = 0; i < 200; i++) {
        const mid = 0.5 * (a + b);
        if (uprime(mid) > 0) a = mid; else b = mid;
        if (b - a < 1e-14 * b) break;
      }
      return 0.5 * (a + b);
    }
    // golden-section fallback
    const GR = (Math.sqrt(5) - 1) / 2;
    let x1 = b - GR * (b - a), x2 = a + GR * (b - a);
    let f1 = P(x1), f2 = P(x2);
    for (let i = 0; i < 300 && (b - a) > 1e-14 * b; i++) {
      if (f1 < f2) {
        a = x1; x1 = x2; f1 = f2;
        x2 = a + GR * (b - a); f2 = P(x2);
      } else {
        b = x2; x2 = x1; f2 = f1;
        x1 = b - GR * (b - a); f1 = P(x1);
      }
    }
    return 0.5 * (a + b);
  }

  function orbitalReport(z, n, l, m) {
    const zf = VV.slater.zeffFrac(z, n, l);
    const zeff = VV.frac.fToNumber(zf);
    return {
      z: z, n: n, l: l, m: m,
      zeff: zeff, zeffFrac: zf,
      energySlaterEv: VV.slater.slaterEnergyEv(z, n, l),
      energyHydrogenicEv: VV.slater.hydrogenicEnergyEv(zeff, n),
      expectR_a0: expectationR(n, l, zeff),
      expectR2_a0: expectationR2(n, l, zeff),
      expectInvR_a0: expectationInvR(n, l, zeff),
      rmp_a0: mostProbableRadius(n, l, zeff),
      radialNodes: radialNodes(n, l),
      angularNodes: angularNodes(l),
      nodeGeometry: nodeGeometry(l, m),
    };
  }

  VV.derived = {
    expectationR: expectationR,
    expectationR2: expectationR2,
    expectationInvR: expectationInvR,
    radialNodes: radialNodes,
    angularNodes: angularNodes,
    nodeGeometry: nodeGeometry,
    mostProbableRadius: mostProbableRadius,
    suggestedExtent: null, // aliased below (hydro loads first)
    orbitalReport: orbitalReport,
  };
  VV.derived.suggestedExtent = VV.hydro.suggestedExtent;
})();
