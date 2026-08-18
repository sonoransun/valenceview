/* Valence View — SPECULATIVE LCAO module (VV.lcao).
 * Frozen-atomic-orbital LCAO; no self-consistency; energies are
 * Wolfsberg–Helmholz estimates — shapes are meaningful, numbers indicative.
 * Geometry: atom A at (0,0,-R/2), B at (0,0,+R/2), R in a0 (clamp >= 0.5).
 * Sign convention (critical): both atoms use GLOBAL-frame orbitals, so a
 * p_z–p_z σ pair has facing lobes of opposite sign, S < 0, and the bonding
 * combination comes out φA − φB automatically — overlapS returns the SIGNED
 * overlap and nothing may take |S|. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  function bondClassify(mA, mB) {
    if (mA === 0 && mB === 0) return 'sigma';
    // same real type: both cos (m=+1) or both sin (m=-1)
    if (Math.abs(mA) === 1 && mA === mB) return 'pi';
    return 'nonbonding';
  }

  /* Signed overlap ∫ φA φB d³r in cylindrical coordinates. The azimuthal
   * integral is analytic (2π for σ, π for π); the remaining 2D ρ,ζ integral
   * uses 96×96 Gauss–Legendre sized from both orbitals' extents. The φ-free
   * profile is obtained by evaluating the real orbital in its unit-azimuth
   * plane (y=0 for cos type, x=0 for sin type). Target accuracy ~1e-4. */
  function overlapS(orbA, orbB, R) {
    const type = bondClassify(orbA.m, orbB.m);
    if (type === 'nonbonding') return 0;
    const psiA = VV.hydro.psiReal(orbA.n, orbA.l, orbA.m, orbA.zeff);
    const psiB = VV.hydro.psiReal(orbB.n, orbB.l, orbB.m, orbB.zeff);
    const sinType = orbA.m === -1;
    const L = Math.max(
      VV.hydro.suggestedExtent(orbA.n, orbA.l, orbA.zeff),
      VV.hydro.suggestedExtent(orbB.n, orbB.l, orbB.zeff));
    const gz = VV.quad.glMapped(96, -R / 2 - L, R / 2 + L);
    const gr = VV.quad.glMapped(96, 0, L);
    let sum = 0;
    for (let i = 0; i < 96; i++) {
      const zeta = gz.x[i];
      const zA = zeta + R / 2, zB = zeta - R / 2;
      let inner = 0;
      for (let j = 0; j < 96; j++) {
        const rho = gr.x[j];
        const fA = sinType ? psiA(0, rho, zA) : psiA(rho, 0, zA);
        const fB = sinType ? psiB(0, rho, zB) : psiB(rho, 0, zB);
        inner += gr.w[j] * rho * fA * fB;
      }
      sum += gz.w[i] * inner;
    }
    return (type === 'sigma' ? 2 * Math.PI : Math.PI) * sum;
  }

  /* 2×2 secular problem with overlap: det([[αA-E, β-ES],[β-ES, αB-E]]) = 0,
   * β = k·S·(αA+αB)/2 (Wolfsberg–Helmholz, k = 1.75). Nonbonding (S≈0, β≈0):
   * degenerate levels get cA = cB = 1/√2 and a nonbonding flag; split levels
   * localize on the matching atom. */
  function moCoefficients(alphaA, alphaB, S, k) {
    k = k == null ? 1.75 : k;
    const beta = k * S * (alphaA + alphaB) / 2;
    const scale = Math.max(Math.abs(alphaA), Math.abs(alphaB), 1);
    if (Math.abs(S) < 1e-12 && Math.abs(beta) < 1e-12 * scale) {
      const nb = { S: 0, beta: 0, nonbonding: true };
      if (Math.abs(alphaA - alphaB) < 1e-9 * scale) {
        const q = Math.SQRT1_2;
        nb.bonding = { E: alphaA, cA: q, cB: q };
        nb.antibonding = { E: alphaA, cA: q, cB: -q };
      } else if (alphaA < alphaB) {
        nb.bonding = { E: alphaA, cA: 1, cB: 0 };
        nb.antibonding = { E: alphaB, cA: 0, cB: 1 };
      } else {
        nb.bonding = { E: alphaB, cA: 0, cB: 1 };
        nb.antibonding = { E: alphaA, cA: 1, cB: 0 };
      }
      return nb;
    }
    const a = 1 - S * S;
    const b = -(alphaA + alphaB - 2 * beta * S);
    const c = alphaA * alphaB - beta * beta;
    const disc = Math.sqrt(Math.max(0, b * b - 4 * a * c));
    const Elo = (-b - disc) / (2 * a);
    const Ehi = (-b + disc) / (2 * a);
    function vec(E) {
      const den = beta - E * S;
      let cA, cB;
      if (Math.abs(den) < 1e-12 * scale) {
        if (Math.abs(alphaA - E) <= Math.abs(alphaB - E)) { cA = 1; cB = 0; }
        else { cA = 0; cB = 1; }
      } else {
        cA = 1;
        cB = -(alphaA - E) / den;
      }
      const nrm = Math.sqrt(cA * cA + cB * cB + 2 * cA * cB * S);
      cA /= nrm; cB /= nrm;
      if (cA < 0 || (cA === 0 && cB < 0)) { cA = -cA; cB = -cB; }
      return { E: E, cA: cA, cB: cB };
    }
    return { bonding: vec(Elo), antibonding: vec(Ehi), S: S, beta: beta, nonbonding: false };
  }

  function moPsi(orbA, orbB, coeffs, R) {
    return VV.hydro.combinePsi([
      { n: orbA.n, l: orbA.l, m: orbA.m, zeff: orbA.zeff, origin: [0, 0, -R / 2], coeff: coeffs.cA },
      { n: orbB.n, l: orbB.l, m: orbB.m, zeff: orbB.zeff, origin: [0, 0, R / 2], coeff: coeffs.cB },
    ]);
  }

  // ------------------------------------------------------------- hybrids ---
  // Standalone display combos (NOT fed into the MO machinery). All same-n s/p
  // with the atom's s-subshell zeff for both — documented simplification.
  const SQ2 = Math.SQRT1_2, T3 = 1 / Math.sqrt(3), T6 = 1 / Math.sqrt(6), S23 = Math.sqrt(2 / 3);
  const ORB = { s: [0, 0], px: [1, 1], py: [1, -1], pz: [1, 0] };
  const HYBRID_TABLES = {
    sp: [
      [['s', SQ2, '1/√2'], ['pz', SQ2, '1/√2']],
      [['s', SQ2, '1/√2'], ['pz', -SQ2, '−1/√2']],
    ],
    sp2: [
      [['s', T3, '1/√3'], ['px', S23, '√(2/3)']],
      [['s', T3, '1/√3'], ['px', -T6, '−1/√6'], ['py', SQ2, '1/√2']],
      [['s', T3, '1/√3'], ['px', -T6, '−1/√6'], ['py', -SQ2, '−1/√2']],
    ],
    sp3: [
      [['s', 0.5, '1/2'], ['px', 0.5, '1/2'], ['py', 0.5, '1/2'], ['pz', 0.5, '1/2']],
      [['s', 0.5, '1/2'], ['px', 0.5, '1/2'], ['py', -0.5, '−1/2'], ['pz', -0.5, '−1/2']],
      [['s', 0.5, '1/2'], ['px', -0.5, '−1/2'], ['py', 0.5, '1/2'], ['pz', -0.5, '−1/2']],
      [['s', 0.5, '1/2'], ['px', -0.5, '−1/2'], ['py', -0.5, '−1/2'], ['pz', 0.5, '1/2']],
    ],
  };

  function hybrid(kind, index) {
    const table = HYBRID_TABLES[kind];
    VV.assert(table, 'unknown hybrid kind ' + kind);
    const combo = table[VV.clamp(index, 0, table.length - 1)];
    return combo.map(function (t) {
      return { l: ORB[t[0]][0], m: ORB[t[0]][1], coeff: t[1], coeffLabel: t[2] };
    });
  }

  // Resolved for an element: n = its period (>= 2 so p exists), zeff = the
  // element's s-subshell Slater zeff for BOTH s and p terms.
  function hybridTerms(z, kind, index) {
    const n = Math.max(2, VV.data.periodOf(z));
    const zeff = VV.slater.zeff(z, n, 0);
    return hybrid(kind, index).map(function (t) {
      return { n: n, l: t.l, m: t.m, zeff: zeff, origin: [0, 0, 0], coeff: t.coeff, coeffLabel: t.coeffLabel };
    });
  }

  function hybridAvailable(z) {
    return VV.data.periodOf(z) >= 2 ? ['sp', 'sp2', 'sp3'] : [];
  }

  // ------------------------------------------------------------ clusters ---
  /* Hückel chain/ring presets, N = 3..6 identical atoms, one ns orbital per
   * atom (n = element period). Analytic eigenvectors:
   *   chain: c_kj ∝ sin(π κ j/(N+1)), κ = k+1, E = α + 2β cos(π κ/(N+1))
   *   ring:  c_j ∝ cos(2πkj/N) (k <= N/2) or sin(2π(N−k)j/N) (k > N/2),
   *          E = α + 2β cos(2πk/N)
   * energies are returned in β units (E − α)/β, one per mode. */
  function clusterTerms(z, topology, nAtoms, k, spacing) {
    const N = VV.clamp(Math.round(nAtoms), 3, 6);
    const kSel = VV.clamp(Math.round(k), 0, N - 1);
    const el = VV.data.byZ(z);
    const n = VV.data.periodOf(z);
    const zeff = VV.slater.zeff(z, n, 0);
    const alpha = VV.slater.slaterEnergyEv(z, n, 0);
    const ring = topology === 'ring';
    const atoms = [], bonds = [], coeffs = [], energies = [];
    if (ring) {
      const rad = spacing / (2 * Math.sin(Math.PI / N));
      for (let j = 0; j < N; j++) {
        const a = 2 * Math.PI * j / N;
        atoms.push({ z: z, sym: el.sym, pos: [rad * Math.sin(a), 0, rad * Math.cos(a)] });
        bonds.push([j, (j + 1) % N]);
      }
      for (let kk = 0; kk < N; kk++) energies.push(2 * Math.cos(2 * Math.PI * kk / N));
      for (let j = 0; j < N; j++) {
        let c;
        if (kSel === 0) c = 1 / Math.sqrt(N);
        else if (N % 2 === 0 && kSel === N / 2) c = (j % 2 ? -1 : 1) / Math.sqrt(N);
        else if (kSel <= N / 2) c = Math.sqrt(2 / N) * Math.cos(2 * Math.PI * kSel * j / N);
        else c = Math.sqrt(2 / N) * Math.sin(2 * Math.PI * (N - kSel) * j / N);
        coeffs.push(c);
      }
    } else {
      for (let j = 0; j < N; j++) {
        atoms.push({ z: z, sym: el.sym, pos: [0, 0, (j - (N - 1) / 2) * spacing] });
        if (j) bonds.push([j - 1, j]);
      }
      const kap = kSel + 1;
      for (let kk = 1; kk <= N; kk++) energies.push(2 * Math.cos(Math.PI * kk / (N + 1)));
      const nrm = Math.sqrt(2 / (N + 1));
      for (let j = 1; j <= N; j++) coeffs.push(nrm * Math.sin(Math.PI * kap * j / (N + 1)));
    }
    const terms = atoms.map(function (a, j) {
      return { n: n, l: 0, m: 0, zeff: zeff, origin: a.pos.slice(), coeff: coeffs[j] };
    });
    return {
      topology: ring ? 'ring' : 'chain', nAtoms: N, k: kSel, spacing: spacing,
      orb: { n: n, l: 0 }, zeff: zeff, alpha: alpha,
      energies: energies, coeffs: coeffs,
      atoms: atoms, bonds: bonds, terms: terms,
    };
  }

  VV.lcao = {
    bondClassify: bondClassify,
    overlapS: overlapS,
    moCoefficients: moCoefficients,
    moPsi: moPsi,
    HYBRID_TABLES: HYBRID_TABLES,
    hybrid: hybrid,
    hybridTerms: hybridTerms,
    hybridAvailable: hybridAvailable,
    clusterTerms: clusterTerms,
  };
})();
