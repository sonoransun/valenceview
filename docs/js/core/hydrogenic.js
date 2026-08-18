/* Valence View — hydrogenic wavefunctions and the OrbitalModel facade
 * (VV.hydro). Lengths in a0, energies in eV. Radial convention ("modern"
 * Laguerre):
 *   R_nl(r) = N_nl e^{-ρ/2} ρ^l L_{n-l-1}^{2l+1}(ρ),  ρ = 2 Z_eff r / n,
 *   N_nl = sqrt( (2Z/n)^3 (n-l-1)! / (2n (n+l)!) ).
 * Real harmonics S_{lm} (chemistry orbitals): S_{l,m>0} = ((-1)^m Y_l^m +
 * Y_l^{-m})/√2 (cos type), S_{l,-m} = ((-1)^m Y_l^m - Y_l^{-m})/(i√2) (sin
 * type) — this identity fixes the precession signs under B‖z: both complex
 * components pick up e^{∓i|m|ω_L t}, so the real density rotates rigidly at
 * ω_L about +z. Psi closures are built for speed: all coefficients folded at
 * factory time, no allocation inside, r^l cancelled between R and S so there
 * is no division (and no r=0 singularity). */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  const FR = VV.frac;

  // ---------------------------------------------------------------- keys ---

  const LETTERS = 'spdf';
  const SUFFIX = {
    1: { 1: 'x', '-1': 'y', 0: 'z' },
    2: { 0: 'z2', 1: 'xz', '-1': 'yz', 2: 'x2y2', '-2': 'xy' },
    3: { 0: 'z3', 1: 'xz2', '-1': 'yz2', 2: 'zx2y2', '-2': 'xyz', 3: 'xx23y2', '-3': 'y3x2y2' },
  };
  const SUFFIX_TO_M = (function () {
    const out = { 1: {}, 2: {}, 3: {} };
    for (const l in SUFFIX) for (const m in SUFFIX[l]) out[l][SUFFIX[l][m]] = +m;
    return out;
  })();
  const SUB_TEXT = {
    x: 'x', y: 'y', z: 'z',
    z2: 'z²', xz: 'xz', yz: 'yz', x2y2: 'x²−y²', xy: 'xy',
    z3: 'z³', xz2: 'xz²', yz2: 'yz²', zx2y2: 'z(x²−y²)', xyz: 'xyz',
    xx23y2: 'x(x²−3y²)', y3x2y2: 'y(3x²−y²)',
  };
  const M_SEQUENCE = [0, 1, -1, 2, -2, 3, -3];

  function orbitalKey(n, l, m) {
    VV.assert(l >= 0 && l <= 3 && Math.abs(m) <= l && n > l, 'bad quantum numbers ' + n + ',' + l + ',' + m);
    if (l === 0) return n + 's';
    return n + LETTERS[l] + '_' + SUFFIX[l][m];
  }

  function parseKey(key) {
    const m = /^([1-9])([spdf])(?:_([a-z0-9]+))?$/.exec(String(key));
    VV.assert(m, 'bad orbital key "' + key + '"');
    const n = +m[1], l = LETTERS.indexOf(m[2]);
    VV.assert(l < n, 'bad orbital key "' + key + '" (l >= n)');
    if (l === 0) {
      VV.assert(!m[3], 'unexpected suffix on s orbital "' + key + '"');
      return { n: n, l: 0, m: 0 };
    }
    const mm = SUFFIX_TO_M[l][m[3]];
    VV.assert(mm !== undefined, 'unknown suffix in "' + key + '"');
    return { n: n, l: l, m: mm };
  }

  function orbitalLabelHTML(key) {
    const q = parseKey(key);
    const base = q.n + LETTERS[q.l];
    return q.l === 0 ? base : base + '<sub>' + SUB_TEXT[SUFFIX[q.l][q.m]] + '</sub>';
  }

  function orbitalLabelPlain(key) {
    const q = parseKey(key);
    const base = q.n + LETTERS[q.l];
    return q.l === 0 ? base : base + ' ' + SUB_TEXT[SUFFIX[q.l][q.m]];
  }

  // -------------------------------------------------------------- radial ---

  function radialNorm(n, l, zeff) {
    const c = 2 * zeff / n;
    let f = Number(FR.factorialBig(n - l - 1)) / (2 * n * Number(FR.factorialBig(n + l)));
    return Math.sqrt(c * c * c * f);
  }

  function radialRfactory(n, l, zeff) {
    VV.assert(n >= 1 && l >= 0 && l < n, 'radialRfactory bad n,l');
    const c = 2 * zeff / n;
    const co = VV.special.laguerreCoeffs(n - l - 1, 2 * l + 1);
    const k = co.length - 1;
    const norm = radialNorm(n, l, zeff);
    return function R(r) {
      const rho = c * r;
      let L = co[k];
      for (let i = k - 1; i >= 0; i--) L = L * rho + co[i];
      let p = 1;
      for (let i = 0; i < l; i++) p *= rho;
      return norm * Math.exp(-0.5 * rho) * p * L;
    };
  }

  function prFactory(n, l, zeff) {
    const R = radialRfactory(n, l, zeff);
    return function Pr(r) { const v = R(r); return r * r * v * v; };
  }

  function suggestedExtent(n, l, zeff) {
    // r where ρ = 2 z r / n reaches 4n + 20 (encloses > 99.9% of P(r)).
    return (2 * n * n + 10 * n) / zeff;
  }

  // rMax(frac): radius enclosing `frac` of the radial probability, from a
  // 2048-point trapezoid CDF of P(r) = r²R² on [0, suggestedExtent].
  function rMaxFactory(n, l, zeff) {
    const N = 2048;
    const ext = suggestedExtent(n, l, zeff);
    const Pr = prFactory(n, l, zeff);
    const dr = ext / (N - 1);
    const cdf = new Float64Array(N);
    let prev = 0, acc = 0;
    for (let i = 1; i < N; i++) {
      const v = Pr(i * dr);
      acc += 0.5 * (prev + v) * dr;
      prev = v;
      cdf[i] = acc;
    }
    const total = cdf[N - 1];
    return function rMax(frac) {
      const target = VV.clamp(frac, 0.001, 0.99999) * total;
      let lo = 0, hi = N - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < target) lo = mid; else hi = mid;
      }
      const c0 = cdf[lo], c1 = cdf[hi];
      const t = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
      return (lo + t) * dr;
    };
  }

  // ------------------------------------------------------------- angular ---

  function normLm(l, m) { // complex-harmonic N_lm, m >= 0
    return Math.sqrt((2 * l + 1) / (4 * Math.PI) *
      Number(FR.factorialBig(l - m)) / Number(FR.factorialBig(l + m)));
  }

  /* Cartesian polynomial forms of the real harmonics: S = kc·poly(x,y,z)/r^l.
   * cart(x,y,z,r2) returns kc·poly (WITHOUT the 1/r^l, which cancels against
   * the ρ^l of R_nl inside psi closures). */
  function cartFactory(l, m) {
    const SQPI = Math.sqrt(Math.PI);
    switch (l * 10 + (m + 5)) {
      case 5: { const k = 0.5 / SQPI; return function (x, y, z, r2) { return k; }; }
      case 15: { const k = Math.sqrt(3 / (4 * Math.PI)); return function (x, y, z, r2) { return k * z; }; }
      case 16: { const k = Math.sqrt(3 / (4 * Math.PI)); return function (x, y, z, r2) { return k * x; }; }
      case 14: { const k = Math.sqrt(3 / (4 * Math.PI)); return function (x, y, z, r2) { return k * y; }; }
      case 25: { const k = Math.sqrt(5 / (16 * Math.PI)); return function (x, y, z, r2) { return k * (3 * z * z - r2); }; }
      case 26: { const k = Math.sqrt(15 / (4 * Math.PI)); return function (x, y, z, r2) { return k * x * z; }; }
      case 24: { const k = Math.sqrt(15 / (4 * Math.PI)); return function (x, y, z, r2) { return k * y * z; }; }
      case 27: { const k = Math.sqrt(15 / (16 * Math.PI)); return function (x, y, z, r2) { return k * (x * x - y * y); }; }
      case 23: { const k = Math.sqrt(15 / (4 * Math.PI)); return function (x, y, z, r2) { return k * x * y; }; }
      case 35: { const k = Math.sqrt(7 / (16 * Math.PI)); return function (x, y, z, r2) { return k * z * (5 * z * z - 3 * r2); }; }
      case 36: { const k = Math.sqrt(21 / (32 * Math.PI)); return function (x, y, z, r2) { return k * x * (5 * z * z - r2); }; }
      case 34: { const k = Math.sqrt(21 / (32 * Math.PI)); return function (x, y, z, r2) { return k * y * (5 * z * z - r2); }; }
      case 37: { const k = Math.sqrt(105 / (16 * Math.PI)); return function (x, y, z, r2) { return k * z * (x * x - y * y); }; }
      case 33: { const k = Math.sqrt(105 / (4 * Math.PI)); return function (x, y, z, r2) { return k * x * y * z; }; }
      case 38: { const k = Math.sqrt(35 / (32 * Math.PI)); return function (x, y, z, r2) { return k * x * (x * x - 3 * y * y); }; }
      case 32: { const k = Math.sqrt(35 / (32 * Math.PI)); return function (x, y, z, r2) { return k * y * (3 * x * x - y * y); }; }
    }
    VV.assert(false, 'no real harmonic for l=' + l + ' m=' + m);
  }

  function realYlm(l, m) {
    const cart = cartFactory(l, m);
    return function S(theta, phi) {
      const st = Math.sin(theta);
      const x = st * Math.cos(phi), y = st * Math.sin(phi), z = Math.cos(theta);
      return cart(x, y, z, 1);
    };
  }

  // P_l^{|m|}(cosθ) with CS phase from (cosθ, sinθ>=0), hardcoded l <= 3.
  function pThetaFactory(l, absM) {
    switch (l * 10 + absM) {
      case 0: return function (ct, st) { return 1; };
      case 10: return function (ct, st) { return ct; };
      case 11: return function (ct, st) { return -st; };
      case 20: return function (ct, st) { return 1.5 * ct * ct - 0.5; };
      case 21: return function (ct, st) { return -3 * ct * st; };
      case 22: return function (ct, st) { return 3 * st * st; };
      case 30: return function (ct, st) { return (2.5 * ct * ct - 1.5) * ct; };
      case 31: return function (ct, st) { return (1.5 - 7.5 * ct * ct) * st; };
      case 32: return function (ct, st) { return 15 * ct * st * st; };
      case 33: return function (ct, st) { return -15 * st * st * st; };
    }
    VV.assert(false, 'pThetaFactory l<=3 only');
  }

  // |angular part| for the sampler: real kind → |S_lm(θ,φ)|; complex kind →
  // |Y_lm| = N_l|m| |P_l^|m|(cosθ)| (φ-independent).
  function absYlmFactory(l, m, kind) {
    if (kind === 'complex') {
      const N = normLm(l, Math.abs(m));
      const pt = pThetaFactory(l, Math.abs(m));
      return function absY(theta, phi) {
        return N * Math.abs(pt(Math.cos(theta), Math.sin(theta)));
      };
    }
    const S = realYlm(l, m);
    return function absY(theta, phi) { return Math.abs(S(theta, phi)); };
  }

  // ----------------------------------------------------------------- psi ---

  // Real orbital ψ = R_nl(r)·S_lm(θ,φ) as a fast closure. The ρ^l of R and
  // the 1/r^l of S cancel: ψ = A·e^{-ρ/2}·L(ρ)·kc·poly(x,y,z), A = N_nl·c^l.
  function psiReal(n, l, m, zeff) {
    const c = 2 * zeff / n;
    const co = VV.special.laguerreCoeffs(n - l - 1, 2 * l + 1);
    const k = co.length - 1;
    let A = radialNorm(n, l, zeff);
    for (let i = 0; i < l; i++) A *= c;
    const cart = cartFactory(l, m);
    return function psi(x, y, z) {
      const r2 = x * x + y * y + z * z;
      const rho = c * Math.sqrt(r2);
      let L = co[k];
      for (let i = k - 1; i >= 0; i--) L = L * rho + co[i];
      return A * Math.exp(-0.5 * rho) * L * cart(x, y, z, r2);
    };
  }

  // Complex orbital: ψ = R·N_l|m|·P_l^|m|(cosθ)·e^{imφ} → {re, im}.
  function psiComplex(n, l, m, zeff) {
    const amp = complexAmp(n, l, m, zeff);
    return function psiC(x, y, z) {
      const a = amp(x, y, z);
      const mphi = m * Math.atan2(y, x);
      return { re: a * Math.cos(mphi), im: a * Math.sin(mphi) };
    };
  }

  // φ-independent signed amplitude of the complex orbital (|ψ|² = amp²); the
  // signed field the iso extractor marches for kind 'complex'.
  // Y_l^{-μ} = (-1)^μ conj(Y_l^μ): the (-1)^μ shows up here for m < 0.
  function complexAmp(n, l, m, zeff) {
    const R = radialRfactory(n, l, zeff);
    const N = normLm(l, Math.abs(m)) * (m < 0 && (m & 1) ? -1 : 1);
    const pt = pThetaFactory(l, Math.abs(m));
    return function amp(x, y, z) {
      const r2 = x * x + y * y + z * z;
      const r = Math.sqrt(r2);
      if (r < 1e-300) return l === 0 ? R(0) * N : 0;
      const ct = z / r;
      const st = Math.sqrt(x * x + y * y) / r;
      return R(r) * N * pt(ct, st);
    };
  }

  // Linear combination of real orbitals at arbitrary origins.
  // terms: [{n, l, m, zeff, origin:[x,y,z], coeff}]
  function combinePsi(terms) {
    const K = terms.length;
    if (K === 1 && !terms[0].origin[0] && !terms[0].origin[1] && !terms[0].origin[2] && terms[0].coeff === 1) {
      return psiReal(terms[0].n, terms[0].l, terms[0].m, terms[0].zeff);
    }
    const fs = terms.map(function (t) { return psiReal(t.n, t.l, t.m, t.zeff); });
    const cf = new Float64Array(K), ox = new Float64Array(K), oy = new Float64Array(K), oz = new Float64Array(K);
    for (let i = 0; i < K; i++) {
      cf[i] = terms[i].coeff;
      ox[i] = terms[i].origin[0]; oy[i] = terms[i].origin[1]; oz[i] = terms[i].origin[2];
    }
    return function psiSum(x, y, z) {
      let s = 0;
      for (let i = 0; i < K; i++) s += cf[i] * fs[i](x - ox[i], y - oy[i], z - oz[i]);
      return s;
    };
  }

  // arg ψ(t) = mφ - (E/ħ)t (caller supplies a display-scaled t).
  function phase(m, phi, energyEv, tSeconds) {
    return m * phi - (energyEv / VV.C.HBAR_EV_S) * tSeconds;
  }

  // -------------------------------------------------------- buildOrbital ---

  function pickCompanionOrbital(zB, mA) {
    const subs = VV.data.valenceSubshells(zB).filter(function (s) { return s.count > 0; });
    const absM = Math.abs(mA);
    for (let i = subs.length - 1; i >= 0; i--) {
      if (subs[i].l >= absM) return { n: subs[i].n, l: subs[i].l, m: mA, matched: true };
    }
    const s = subs[subs.length - 1];
    return { n: s.n, l: s.l, m: 0, matched: false };
  }

  function squeezeWrap(psi, inv) {
    // ψ_B(x,y,z) = (1/s⊥)·ψ(x/s⊥, y/s⊥, z): norm-preserving xy squeeze, B‖z.
    return function psiB(x, y, z) { return inv * psi(x * inv, y * inv, z); };
  }

  function buildOrbital(state) {
    const z = state.element;
    const el = VV.data.byZ(z);
    VV.assert(el, 'buildOrbital: unknown element ' + z);
    const key = state.orbital;
    const q = parseKey(key);
    const n = q.n, l = q.l, m = q.m;
    const viz = state.viz || {};
    const fieldOn = !!(state.field && state.field.enabled);
    const compOn = !!(state.comp && state.comp.enabled);

    const zf = VV.slater.zeffFrac(z, n, l);
    const zeff = FR.fToNumber(zf);
    // Real/complex policy: chips select real orbitals; phase coloring shows
    // the complex e^{imφ} orbital when |m| > 0 and no companion system is on.
    const kind = (!compOn && viz.colorMode === 'phase' && m !== 0) ? 'complex' : 'real';

    const energySlater = VV.slater.slaterEnergyEv(z, n, l);
    const energyHydro = VV.slater.hydrogenicEnergyEv(zeff, n);

    const Rnl = radialRfactory(n, l, zeff);
    const Pr = prFactory(n, l, zeff);
    const rMax = rMaxFactory(n, l, zeff);
    const absYlm = absYlmFactory(l, m, kind);

    // ---- system assembly -------------------------------------------------
    let system = {
      kind: 'atom',
      atoms: [{ z: z, sym: el.sym, pos: [0, 0, 0] }],
      bonds: [],
      terms: [{ n: n, l: l, m: m, zeff: zeff, origin: [0, 0, 0], coeff: 1 }],
      mo: null,
    };
    let specInfo = null;
    let extentTerms = null; // [{pos, ext}]

    if (compOn) {
      const comp = state.comp;
      const mode = comp.mode || 'mo';
      if (mode === 'mo') {
        const zB = comp.z || 1;
        const elB = VV.data.byZ(zB);
        const R = VV.clamp(comp.dist == null ? 2 : comp.dist, 0.5, 10);
        const pick = pickCompanionOrbital(zB, m);
        const zfB = VV.slater.zeffFrac(zB, pick.n, pick.l);
        const zeffB = FR.fToNumber(zfB);
        const orbA = { n: n, l: l, m: m, zeff: zeff };
        const orbB = { n: pick.n, l: pick.l, m: pick.m, zeff: zeffB };
        const bondType = VV.lcao.bondClassify(m, pick.m);
        const alphaA = energySlater;
        const alphaB = VV.slater.slaterEnergyEv(zB, pick.n, pick.l);
        const S = bondType === 'nonbonding' ? 0 : VV.lcao.overlapS(orbA, orbB, R);
        const mo = VV.lcao.moCoefficients(alphaA, alphaB, S);
        const chosenName = comp.combo === 'antibonding' ? 'antibonding' : 'bonding';
        const chosen = mo[chosenName];
        system = {
          kind: 'mo',
          atoms: [
            { z: z, sym: el.sym, pos: [0, 0, -R / 2] },
            { z: zB, sym: elB.sym, pos: [0, 0, R / 2] },
          ],
          bonds: [[0, 1]],
          terms: [
            { n: n, l: l, m: m, zeff: zeff, origin: [0, 0, -R / 2], coeff: chosen.cA },
            { n: pick.n, l: pick.l, m: pick.m, zeff: zeffB, origin: [0, 0, R / 2], coeff: chosen.cB },
          ],
          mo: { S: mo.S, beta: mo.beta, alphaA: alphaA, alphaB: alphaB, bonding: mo.bonding, antibonding: mo.antibonding, chosen: chosenName },
        };
        specInfo = {
          type: 'mo', companionZ: zB, companionKey: orbitalKey(pick.n, pick.l, pick.m),
          R: R, S: mo.S, beta: mo.beta, alphaA: alphaA, alphaB: alphaB,
          bonding: mo.bonding, antibonding: mo.antibonding, chosen: chosenName,
          bondType: bondType, nonbonding: !!mo.nonbonding,
        };
      } else if (mode === 'hybrid') {
        const hkind = (comp.hybrid === 'sp' || comp.hybrid === 'sp2' || comp.hybrid === 'sp3') ? comp.hybrid : 'sp3';
        const count = hkind === 'sp' ? 2 : hkind === 'sp2' ? 3 : 4;
        const index = VV.clamp(Math.round(comp.hybridIndex || 0), 0, count - 1);
        const hterms = VV.lcao.hybridTerms(z, hkind, index);
        system = {
          kind: 'hybrid',
          atoms: [{ z: z, sym: el.sym, pos: [0, 0, 0] }],
          bonds: [],
          terms: hterms,
          mo: null,
        };
        specInfo = {
          type: 'hybrid', kind: hkind, index: index,
          coeffs: hterms.map(function (t) {
            return { orbKey: orbitalKey(t.n, t.l, t.m), coeffLabel: t.coeffLabel };
          }),
        };
      } else { // 'cluster'
        const ct = VV.lcao.clusterTerms(
          comp.z || 1,
          comp.topology === 'ring' ? 'ring' : 'chain',
          comp.nAtoms == null ? 6 : comp.nAtoms,
          comp.k || 0,
          VV.clamp(comp.dist == null ? 2 : comp.dist, 0.5, 10));
        system = {
          kind: 'cluster',
          atoms: ct.atoms,
          bonds: ct.bonds,
          terms: ct.terms,
          mo: null,
        };
        specInfo = {
          type: 'cluster', topology: ct.topology, nAtoms: ct.nAtoms, k: ct.k,
          energies: ct.energies, alpha: ct.alpha, orbKey: orbitalKey(ct.orb.n, 0, 0),
        };
      }
    }

    // ---- psi closures ----------------------------------------------------
    let psi, psiComplexPhase = null;
    if (kind === 'complex') {
      psi = complexAmp(n, l, m, zeff);
      psiComplexPhase = psiComplex(n, l, m, zeff);
    } else {
      psi = combinePsi(system.terms);
    }

    // ---- magnetic field --------------------------------------------------
    if (fieldOn) {
      const B = Math.pow(10, (state.field.logB == null ? 1 : state.field.logB));
      const squeeze = VV.magnetic.squeezeFactor(B, energyHydro);
      const inv = 1 / squeeze;
      psi = squeezeWrap(psi, inv);
      if (psiComplexPhase) {
        const inner = psiComplexPhase;
        psiComplexPhase = function (x, y, z) {
          const v = inner(x * inv, y * inv, z);
          v.re *= inv; v.im *= inv;
          return v;
        };
      }
      const shifts = [];
      for (let mi = -l; mi <= l; mi++) shifts.push({ m: mi, dEeV: VV.magnetic.zeemanShiftEv(mi, B) });
      specInfo = {
        type: 'field', B: B, shifts: shifts,
        omegaLarmor: VV.magnetic.larmorOmega(B),
        larmorPeriodS: VV.magnetic.larmorPeriod(B),
        squeeze: squeeze,
      };
    }

    // ---- extent ----------------------------------------------------------
    let extent = 1.05 * rMax(0.999);
    if (system.terms.length > 1 || system.kind !== 'atom') {
      const cacheR = Object.create(null);
      extent = 0;
      for (let i = 0; i < system.terms.length; i++) {
        const t = system.terms[i];
        const ck = t.n + '_' + t.l + '_' + t.zeff;
        if (!cacheR[ck]) cacheR[ck] = rMaxFactory(t.n, t.l, t.zeff)(0.999);
        const o = t.origin;
        const d = Math.sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]);
        extent = Math.max(extent, d + 1.05 * cacheR[ck]);
      }
    }

    // ---- report + symbolic ----------------------------------------------
    const rep = VV.derived.orbitalReport(z, n, l, m);
    const report = {
      zeff: zeff, zeffFrac: zf,
      energySlaterEv: energySlater, energyHydrogenicEv: energyHydro,
      expectR_a0: rep.expectR_a0, expectR_pm: rep.expectR_a0 * VV.C.A0_PM,
      rmp_a0: rep.rmp_a0, radialNodes: rep.radialNodes, angularNodes: rep.angularNodes,
      configString: VV.data.configString(z), nobleGasString: VV.data.nobleGasString(z),
      valence: VV.data.valenceSubshells(z), predicted: el.predicted,
    };

    // Complex kind displays e^{imφ}, not the real ± combination the chip
    // names — label it by m so the header/formula match what is shown.
    const mLabel = kind === 'complex'
      ? 'm=' + (m > 0 ? '+' : '−') + Math.abs(m) : null;
    const ast = VV.symbolic.toAST(
      VV.symbolic.radialSymbolic(n, l, zf),
      VV.symbolic.angularSymbolic(l, m, kind),
      { kind: kind, m: m,
        label: mLabel ? n + LETTERS[l] + ' ' + mLabel : orbitalLabelPlain(key) });

    return {
      key: key,
      labelHTML: mLabel
        ? n + LETTERS[l] + '<sub>' + mLabel + '</sub>'
        : orbitalLabelHTML(key),
      descriptor: { n: n, l: l, m: m, kind: kind, zeff: zeff, energyEv: energySlater },
      system: system,
      psi: psi,
      psiComplexPhase: psiComplexPhase,
      Rnl: Rnl, Pr: Pr,
      absYlm: absYlm,
      rMax: rMax,
      extent: extent,
      report: report,
      ast: ast,
      specInfo: specInfo,
    };
  }

  // ------------------------------------------------------ buildComposite ---

  function isCompositeState(state) {
    const mu = state && state.multi;
    return !!(mu && mu.enabled && mu.keys && mu.keys.length >= 1);
  }

  // Composite (multi-orbital) model: one real-kind OrbitalModel per selected
  // key of the SAME element — comp forced off and colorMode forced 'sign' so
  // each component goes through the ordinary single-orbital path (per-
  // component B squeeze and specInfo come for free from buildOrbital).
  function buildComposite(state) {
    VV.assert(isCompositeState(state), 'buildComposite: state.multi not active');
    const keys = state.multi.keys.slice();
    const components = keys.map(function (key) {
      return buildOrbital(Object.assign({}, state, {
        orbital: key,
        comp: Object.assign({}, state.comp, { enabled: false }),
        viz: Object.assign({}, state.viz, { colorMode: 'sign' }),
      }));
    });

    const K = components.length;
    const psis = components.map(function (c) { return c.psi; });
    function density(x, y, z) {
      let s = 0;
      for (let i = 0; i < K; i++) { const v = psis[i](x, y, z); s += v * v; }
      return s;
    }

    let extent = 0;
    for (let i = 0; i < K; i++) extent = Math.max(extent, components[i].extent);

    // Distinct (n,l) subshells present, order of first appearance; a subshell
    // with all 2l+1 real orbitals selected is "full" (spherical by Unsöld).
    const subshells = [];
    const byNL = Object.create(null);
    const msByNL = Object.create(null);
    for (let i = 0; i < K; i++) {
      const q = parseKey(keys[i]);
      const id = q.n + ',' + q.l;
      let s = byNL[id];
      if (!s) {
        s = byNL[id] = { n: q.n, l: q.l, count: 0, indices: [] };
        msByNL[id] = Object.create(null);
        subshells.push(s);
      }
      s.count++;
      s.indices.push(i);
      msByNL[id][q.m] = true;
    }
    const fullSubshells = [];
    subshells.forEach(function (s) {
      if (Object.keys(msByNL[s.n + ',' + s.l]).length === 2 * s.l + 1) {
        fullSubshells.push({ n: s.n, l: s.l });
      }
    });

    return {
      kind: 'composite',
      keys: keys,
      components: components,
      extent: extent,
      density: density,
      subshells: subshells,
      fullSubshells: fullSubshells,
      report: components[0].report,
      specInfo: (state.field && state.field.enabled) ? components[0].specInfo : null,
    };
  }

  VV.hydro = {
    M_SEQUENCE: M_SEQUENCE,
    orbitalKey: orbitalKey,
    parseKey: parseKey,
    orbitalLabelHTML: orbitalLabelHTML,
    orbitalLabelPlain: orbitalLabelPlain,
    radialRfactory: radialRfactory,
    prFactory: prFactory,
    rMaxFactory: rMaxFactory,
    suggestedExtent: suggestedExtent,
    normLm: normLm,
    realYlm: realYlm,
    absYlmFactory: absYlmFactory,
    psiReal: psiReal,
    psiComplex: psiComplex,
    complexAmp: complexAmp,
    combinePsi: combinePsi,
    phase: phase,
    buildOrbital: buildOrbital,
    isCompositeState: isCompositeState,
    buildComposite: buildComposite,
  };
})();
