/* Valence View — exact BigInt rational arithmetic (VV.frac).
 * Frac = { n: BigInt, d: BigInt }, always normalized: d > 0, gcd(|n|, d) = 1.
 * Used for Slater screening constants, Laguerre/Legendre coefficients and
 * normalization radicals; converted to floats only at evaluator build time. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  function toBig(v) {
    if (typeof v === 'bigint') return v;
    VV.assert(Number.isInteger(v), 'Frac component must be an integer, got ' + v);
    return BigInt(v);
  }

  function gcdBig(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  function F(n, d) {
    let bn = toBig(n);
    let bd = d === undefined ? 1n : toBig(d);
    VV.assert(bd !== 0n, 'Frac with zero denominator');
    if (bd < 0n) { bn = -bn; bd = -bd; }
    const g = gcdBig(bn, bd);
    if (g > 1n) { bn /= g; bd /= g; }
    return { n: bn, d: bd };
  }

  function fadd(a, b) { return F(a.n * b.d + b.n * a.d, a.d * b.d); }
  function fsub(a, b) { return F(a.n * b.d - b.n * a.d, a.d * b.d); }
  function fmul(a, b) { return F(a.n * b.n, a.d * b.d); }
  function fdiv(a, b) {
    VV.assert(b.n !== 0n, 'Frac division by zero');
    return F(a.n * b.d, a.d * b.n);
  }
  function fneg(a) { return { n: -a.n, d: a.d }; }
  function fabs(a) { return a.n < 0n ? { n: -a.n, d: a.d } : a; }
  function fIsZero(a) { return a.n === 0n; }
  function fcmp(a, b) {
    const diff = a.n * b.d - b.n * a.d;
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  }
  function fPow(a, k) {
    VV.assert(Number.isInteger(k), 'fPow exponent must be an integer');
    if (k === 0) return F(1n, 1n);
    let base = a, e = k;
    if (k < 0) { base = fdiv(F(1n, 1n), a); e = -k; }
    let out = F(1n, 1n);
    for (let i = 0; i < e; i++) out = fmul(out, base);
    return out;
  }

  const FACT_CACHE = [1n, 1n];
  function factorialBig(n) {
    VV.assert(Number.isInteger(n) && n >= 0, 'factorialBig needs n >= 0');
    for (let i = FACT_CACHE.length; i <= n; i++) FACT_CACHE.push(FACT_CACHE[i - 1] * BigInt(i));
    return FACT_CACHE[n];
  }

  function binomBig(n, k) {
    if (k < 0 || k > n) return 0n;
    return factorialBig(n) / (factorialBig(k) * factorialBig(n - k));
  }

  const MAX_SAFE = 9007199254740992n; // 2^53
  function fToNumber(a) {
    const an = a.n < 0n ? -a.n : a.n;
    if (an <= MAX_SAFE && a.d <= MAX_SAFE) return Number(a.n) / Number(a.d);
    return Number((a.n * (10n ** 20n)) / a.d) * 1e-20;
  }

  function fStr(a) { return a.d === 1n ? String(a.n) : String(a.n) + '/' + String(a.d); }

  function isqrtBig(x) {
    if (x < 2n) return x;
    let r = x, y = (x >> 1n) + 1n;
    while (y < r) { r = y; y = (y + x / y) >> 1n; }
    return r;
  }

  // n >= 0 → { outer, rad } with n = outer^2 * rad, rad squarefree.
  // Trial division to 4000 covers every input here ((n+l)! at l<=3, n<=7 and
  // zeff numerators over denominators <= 20^3); a final perfect-square test
  // catches large leftover square factors anyway.
  function squarePart(x) {
    if (x === 0n) return { outer: 0n, rad: 1n };
    let outer = 1n, rad = 1n, rem = x;
    for (let p = 2n; p <= 4000n && p * p <= rem; p += (p === 2n ? 1n : 2n)) {
      if (rem % p) continue;
      let e = 0n;
      while (rem % p === 0n) { rem /= p; e++; }
      outer *= p ** (e >> 1n);
      if (e & 1n) rad *= p;
    }
    if (rem > 1n) {
      const s = isqrtBig(rem);
      if (s * s === rem) outer *= s;
      else rad *= rem;
    }
    return { outer: outer, rad: rad };
  }

  // sqrt(a) = outer * sqrt(radicand); radicand is a squarefree INTEGER Frac
  // (denominator rationalized into outer), so radicals display textbook-style.
  function sqrtReduce(a) {
    VV.assert(a.n >= 0n, 'sqrtReduce of negative Frac');
    const sn = squarePart(a.n), sd = squarePart(a.d);
    // sqrt(n/d) = (sn.outer/sd.outer) * sqrt(sn.rad/sd.rad)
    //           = (sn.outer/(sd.outer*sd.rad)) * sqrt(sn.rad*sd.rad)
    return {
      outer: F(sn.outer, sd.outer * sd.rad),
      radicand: F(sn.rad * sd.rad, 1n),
    };
  }

  VV.frac = {
    F: F, fadd: fadd, fsub: fsub, fmul: fmul, fdiv: fdiv, fneg: fneg,
    fabs: fabs, fcmp: fcmp, fIsZero: fIsZero, fPow: fPow,
    factorialBig: factorialBig, binomBig: binomBig,
    fToNumber: fToNumber, fStr: fStr, sqrtReduce: sqrtReduce,
  };
})();
