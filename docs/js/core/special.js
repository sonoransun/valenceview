/* Valence View — special functions (VV.special).
 * Generalized Laguerre in the "modern" (A&S/Griffiths) convention:
 *   L_k^α(x) = Σ_{i=0}^k (-1)^i C(k+α, k-i) x^i / i!
 * Associated Legendre WITH the Condon–Shortley phase:
 *   P_m^m(x) = (-1)^m (2m-1)!! (1-x²)^{m/2}
 * The exact-rational Legendre generator returns q_{l,m} defined by
 *   P_l^m(x) = (-1)^m (2m-1)!! (1-x²)^{m/2} · q_{l,m}(x)
 * so the (2m-1)!! and the CS sign can be folded into a norm prefactor. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  const FR = VV.frac;

  function horner(coeffs, x) {
    let s = coeffs[coeffs.length - 1];
    for (let i = coeffs.length - 2; i >= 0; i--) s = s * x + coeffs[i];
    return s;
  }

  function doubleFactorial(n) { // (2m-1)!! style; (-1)!! = 1
    let out = 1n;
    for (let i = n; i >= 2; i -= 2) out *= BigInt(i);
    return out;
  }

  // Exact coefficients of L_k^α as Fracs, index i = coefficient of x^i.
  function laguerreCoeffsFrac(k, alpha) {
    VV.assert(k >= 0 && alpha >= 0, 'laguerreCoeffsFrac k, alpha >= 0');
    const out = [];
    for (let i = 0; i <= k; i++) {
      const num = FR.binomBig(k + alpha, k - i) * (i % 2 ? -1n : 1n);
      out.push(FR.F(num, FR.factorialBig(i)));
    }
    return out;
  }

  function laguerreCoeffs(k, alpha) {
    const fr = laguerreCoeffsFrac(k, alpha);
    const out = new Float64Array(k + 1);
    for (let i = 0; i <= k; i++) out[i] = FR.fToNumber(fr[i]);
    return out;
  }

  // Independent cross-check path: the three-term recurrence.
  function laguerreRecurrence(k, alpha, x) {
    if (k === 0) return 1;
    let lm1 = 1, l = 1 + alpha - x;
    for (let i = 1; i < k; i++) {
      const lp1 = ((2 * i + 1 + alpha - x) * l - (i + alpha) * lm1) / (i + 1);
      lm1 = l; l = lp1;
    }
    return l;
  }

  // Float associated Legendre P_l^m(x), m >= 0, CS phase included.
  function legendreAssoc(l, m, x) {
    VV.assert(m >= 0 && l >= m, 'legendreAssoc needs 0 <= m <= l');
    let pmm = 1;
    if (m > 0) {
      const s = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
      let f = 1;
      for (let i = 1; i <= m; i++) { pmm *= -f * s; f += 2; }
    }
    if (l === m) return pmm;
    let pm1 = x * (2 * m + 1) * pmm;
    if (l === m + 1) return pm1;
    let p = 0;
    for (let ll = m + 2; ll <= l; ll++) {
      p = (x * (2 * ll - 1) * pm1 - (ll + m - 1) * pmm) / (ll - m);
      pmm = pm1; pm1 = p;
    }
    return p;
  }

  // Exact-rational q_{l,m}(x) coefficients (see header identity); the same
  // recurrences as legendreAssoc run over Frac polynomials, with the seed
  // (-1)^m (2m-1)!! (1-x²)^{m/2} stripped out.
  function legendrePolyFrac(l, m) {
    VV.assert(m >= 0 && l >= m, 'legendrePolyFrac needs 0 <= m <= l');
    const one = FR.F(1n, 1n);
    let qmm = [one]; // q_{m,m} = 1
    if (l === m) return qmm;
    // q_{m+1,m} = (2m+1) x
    let qm1 = [FR.F(0n, 1n), FR.F(2 * m + 1, 1)];
    if (l === m + 1) return qm1;
    let q = null;
    for (let ll = m + 2; ll <= l; ll++) {
      // (ll-m) q_ll = (2ll-1) x q_{ll-1} - (ll+m-1) q_{ll-2}
      const a = FR.F(2 * ll - 1, ll - m);
      const b = FR.F(ll + m - 1, ll - m);
      q = [];
      for (let i = 0; i <= qm1.length; i++) q.push(FR.F(0n, 1n));
      for (let i = 0; i < qm1.length; i++) q[i + 1] = FR.fmul(a, qm1[i]);
      for (let i = 0; i < qmm.length; i++) q[i] = FR.fsub(q[i], FR.fmul(b, qmm[i]));
      qmm = qm1; qm1 = q;
    }
    return q;
  }

  VV.special = {
    horner: horner,
    doubleFactorial: doubleFactorial,
    laguerreCoeffsFrac: laguerreCoeffsFrac,
    laguerreCoeffs: laguerreCoeffs,
    laguerreRecurrence: laguerreRecurrence,
    legendreAssoc: legendreAssoc,
    legendrePolyFrac: legendrePolyFrac,
  };
})();
