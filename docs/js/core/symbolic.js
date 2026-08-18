/* Valence View — exact symbolic orbital formulas (VV.symbolic).
 * Every displayed formula is generated from the same exact-rational data the
 * evaluators are built from, so display and numerics cannot disagree (the
 * 'symbolic' verify group asserts it). toAST emits the MathML AST vocabulary
 * of contracts §8: num/sym/add/neg/mul/frac/pow/sub/sqrt/exp/func/paren/row. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  const FR = VV.frac;
  const SP = VV.special;

  // radialSymbolic(n, l, zeffFrac):
  //   R(r) = norm.outer·sqrt(norm.radicand) · ρ^l · Σ laguerre.coeffs[i] ρ^i · e^{-ρ/2},
  //   ρ = rho.coeff · (r/a0), norm in a0^{-3/2}.
  function radialSymbolic(n, l, zeffFrac) {
    const rhoCoeff = FR.fdiv(FR.fmul(FR.F(2, 1), zeffFrac), FR.F(n, 1));
    // (2z/n)^3 (n-l-1)! / (2n (n+l)!)
    const normSq = FR.fmul(
      FR.fPow(rhoCoeff, 3),
      FR.F(FR.factorialBig(n - l - 1), FR.F(2 * n, 1).n * FR.factorialBig(n + l)));
    return {
      n: n, l: l, zeff: zeffFrac,
      rho: { coeff: rhoCoeff },
      norm: FR.sqrtReduce(normSq),
      rhoPower: l,
      laguerre: { k: n - l - 1, alpha: 2 * l + 1, coeffs: SP.laguerreCoeffsFrac(n - l - 1, 2 * l + 1) },
    };
  }

  const CARTESIAN = {
    '0,0': null,
    '1,0': 'z/r', '1,1': 'x/r', '1,-1': 'y/r',
    '2,0': '(3z²−r²)/r²', '2,1': 'xz/r²', '2,-1': 'yz/r²', '2,2': '(x²−y²)/r²', '2,-2': 'xy/r²',
    '3,0': 'z(5z²−3r²)/r³', '3,1': 'x(5z²−r²)/r³', '3,-1': 'y(5z²−r²)/r³',
    '3,2': 'z(x²−y²)/r³', '3,-2': 'xyz/r³', '3,3': 'x(x²−3y²)/r³', '3,-3': 'y(3x²−y²)/r³',
  };

  // angularSymbolic(l, m, kind='real'):
  //   value(θ,φ) = norm.outer·sqrt(norm.radicand/π) · sinθ^sinPower ·
  //                Σ cosPoly[i] cosθ^i · azimuthal
  // The √2 (m≠0, real), the (2|m|-1)!! from the Legendre seed and every sign
  // (Condon–Shortley cancels for real forms; survives as (-1)^m for complex
  // m>0) are folded into norm.outer, so cosPoly is exactly special.legendrePolyFrac.
  function angularSymbolic(l, m, kind) {
    const absM = Math.abs(m);
    const complex = kind === 'complex';
    // (2l+1)(l-|m|)!/(4(l+|m|)!), doubled for real m≠0 (the √2).
    let f = FR.F(BigInt(2 * l + 1) * FR.factorialBig(l - absM), 4n * FR.factorialBig(l + absM));
    if (!complex && m !== 0) f = FR.fmul(f, FR.F(2, 1));
    const sr = FR.sqrtReduce(f);
    let outer = FR.fmul(sr.outer, FR.F(SP.doubleFactorial(2 * absM - 1), 1n));
    if (complex && m > 0 && m % 2 === 1) outer = FR.fneg(outer); // CS phase survives
    return {
      l: l, m: m,
      norm: { outer: outer, radicand: sr.radicand, overPi: true },
      sinPower: absM,
      cosPoly: SP.legendrePolyFrac(l, absM),
      azimuthal: m === 0 ? { fn: 'one' }
        : complex ? { fn: 'expim', mult: m }
        : { fn: m > 0 ? 'cos' : 'sin', mult: absM },
      cartesian: CARTESIAN[l + ',' + m] || null,
    };
  }

  // Numeric evaluators of the symbolic objects (verify cross-checks these
  // against the fast closures in VV.hydro).
  function radialSymbolicEval(rs) {
    const c = FR.fToNumber(rs.rho.coeff);
    const norm = FR.fToNumber(rs.norm.outer) * Math.sqrt(FR.fToNumber(rs.norm.radicand));
    const co = rs.laguerre.coeffs.map(FR.fToNumber);
    return function (r) {
      const rho = c * r;
      let L = 0;
      for (let i = co.length - 1; i >= 0; i--) L = L * rho + co[i];
      return norm * Math.pow(rho, rs.rhoPower) * L * Math.exp(-0.5 * rho);
    };
  }

  function angularSymbolicEval(as) {
    const pref = FR.fToNumber(as.norm.outer) * Math.sqrt(FR.fToNumber(as.norm.radicand) / Math.PI);
    const poly = as.cosPoly.map(FR.fToNumber);
    return function (theta, phi) {
      const ct = Math.cos(theta), st = Math.sin(theta);
      let q = 0;
      for (let i = poly.length - 1; i >= 0; i--) q = q * ct + poly[i];
      let az = 1;
      if (as.azimuthal.fn === 'cos') az = Math.cos(as.azimuthal.mult * phi);
      else if (as.azimuthal.fn === 'sin') az = Math.sin(as.azimuthal.mult * phi);
      return pref * Math.pow(st, as.sinPower) * q * az;
    };
  }

  // ------------------------------------------------------------- AST -------

  function num(v) { return { t: 'num', v: String(v) }; }
  function sym(v) { return { t: 'sym', v: v }; }
  function mul(xs) { return xs.length === 1 ? xs[0] : { t: 'mul', xs: xs }; }
  function row(xs) { return { t: 'row', xs: xs }; }

  // Frac -> AST (negative sign via neg node).
  function fracAST(f) {
    const negv = f.n < 0n;
    const an = negv ? -f.n : f.n;
    const core = f.d === 1n ? num(an) : { t: 'frac', num: num(an), den: num(f.d) };
    return negv ? { t: 'neg', x: core } : core;
  }

  // outer·√(rad/π) or outer·√(rad) as a compact AST product.
  function radicalAST(outerF, radF, overPi) {
    const parts = [];
    const one = FR.fcmp(FR.fabs(outerF), FR.F(1, 1)) === 0;
    if (!one || (radF.n === 1n && !overPi)) parts.push(fracAST(outerF));
    else if (outerF.n < 0n) parts.push({ t: 'neg', x: num(1) });
    if (overPi) {
      const den = sym('π');
      parts.push({ t: 'sqrt', x: { t: 'frac', num: num(radF.n), den: den } });
    } else if (radF.n !== 1n) {
      parts.push({ t: 'sqrt', x: num(radF.n) });
    }
    if (!parts.length) parts.push(num(1));
    // fold a leading neg(1)·√ into neg(√)
    if (parts.length === 2 && parts[0].t === 'neg' && parts[0].x.t === 'num' && parts[0].x.v === '1') {
      return { t: 'neg', x: parts[1] };
    }
    return mul(parts);
  }

  function powAST(base, p) {
    if (p === 0) return null;
    if (p === 1) return base;
    return { t: 'pow', base: base, exp: num(p) };
  }

  // Σ coeffs[i]·X^i as an add node (signs carried by terms); constant-only
  // polynomials return null with the constant folded by the caller.
  function polyAST(coeffs, baseSym) {
    const terms = [];
    for (let i = 0; i < coeffs.length; i++) {
      const cf = coeffs[i];
      if (cf.n === 0n) continue;
      const neg = cf.n < 0n;
      const mag = neg ? FR.fneg(cf) : cf;
      const parts = [];
      const isOne = mag.n === 1n && mag.d === 1n;
      if (!isOne || i === 0) parts.push(fracAST(mag));
      const p = powAST(baseSym, i);
      if (p) parts.push(p);
      const node = mul(parts);
      terms.push(neg ? { t: 'neg', x: node } : node);
    }
    if (!terms.length) return num(0);
    return terms.length === 1 ? terms[0] : { t: 'add', xs: terms };
  }

  /* Full assembled ψ formula:
   *   ψ_label = C · ρ^l · (Laguerre poly) · e^{-ρ/2} · sin^|m|θ ·
   *             (cos poly) · {cos|sin}(|m|φ) | e^{imφ},   ρ = c·r
   * with C the combined exact radical (radial × angular, over π). */
  function toAST(radialSym, angularSym, opts) {
    opts = opts || {};
    const rs = radialSym, as = angularSym;
    // combine radicals: rOuter√rRad · aOuter√(aRad/π) = outer·√(rad/π)
    const merged = FR.sqrtReduce(FR.fmul(rs.norm.radicand, as.norm.radicand));
    const outer = FR.fmul(FR.fmul(rs.norm.outer, as.norm.outer), merged.outer);
    const factors = [radicalAST(outer, merged.radicand, true)];

    const rho = sym('ρ');
    const rp = powAST(rho, rs.rhoPower);
    if (rp) factors.push(rp);

    // Laguerre polynomial (constant L_0 = 1 handled by omission).
    if (rs.laguerre.k > 0) {
      factors.push({ t: 'paren', x: polyAST(rs.laguerre.coeffs, rho) });
    }
    factors.push({ t: 'exp', arg: { t: 'neg', x: { t: 'frac', num: rho, den: num(2) } } });

    // angular: sin^|m|θ · cosPoly(cosθ) · azimuthal
    const sinTheta = { t: 'func', name: 'sin', arg: sym('θ') };
    const sp = powAST(sinTheta, as.sinPower);
    if (sp) factors.push(sp);
    const deg = as.cosPoly.length - 1;
    if (deg > 0) {
      const cosTheta = { t: 'func', name: 'cos', arg: sym('θ') };
      const nonZero = as.cosPoly.filter(function (c) { return c.n !== 0n; }).length;
      const p = polyAST(as.cosPoly, cosTheta);
      factors.push(nonZero > 1 ? { t: 'paren', x: p } : p);
    }
    const az = as.azimuthal;
    if (az.fn === 'cos' || az.fn === 'sin') {
      const arg = az.mult === 1 ? sym('φ') : mul([num(az.mult), sym('φ')]);
      factors.push({ t: 'func', name: az.fn, arg: arg });
    } else if (az.fn === 'expim') {
      const mm = az.mult;
      const mag = Math.abs(mm);
      const parts = [sym('i')];
      if (mag !== 1) parts.push(num(mag));
      parts.push(sym('φ'));
      const arg = mm < 0 ? { t: 'neg', x: mul(parts) } : mul(parts);
      factors.push({ t: 'exp', arg: arg });
    }

    const lhs = { t: 'sub', base: sym('ψ'), sub: sym(opts.label || (rs.n + '' + 'spdf'[rs.l])) };
    return row([
      lhs, sym('='), mul(factors), sym(','),
      row([sym('ρ'), sym('='), fracAST(rs.rho.coeff), sym('r')]),
    ]);
  }

  VV.symbolic = {
    radialSymbolic: radialSymbolic,
    angularSymbolic: angularSymbolic,
    radialSymbolicEval: radialSymbolicEval,
    angularSymbolicEval: angularSymbolicEval,
    toAST: toAST,
    CARTESIAN: CARTESIAN,
  };
})();
