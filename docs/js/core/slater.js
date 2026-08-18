/* Valence View — Slater's rules (VV.slater), exact-Frac screening.
 * Groups in fixed order: 1s | 2s,2p | 3s,3p | 3d | 4s,4p | 4d | 4f | 5s,5p |
 * 5d | 5f | 6s,6p | 6d | 7s,7p. Constants are exact rationals (3/10, 7/20,
 * 17/20, 1). For an (n,l) subshell that is EMPTY in the configuration, the
 * screening is computed for a probe electron added to that subshell (all
 * same-group occupants count as "others") — this backs the shown-empty
 * valence chips (e.g. Pd 5s, alkaline-earth np). */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  const FR = VV.frac;

  const S_1S = FR.F(3, 10);
  const S_SAME = FR.F(7, 20);
  const S_NM1 = FR.F(17, 20);
  const S_DEEP = FR.F(1, 1);

  // Group ordering index; l<=1 shares the "nsp" group, d and f stand alone.
  function groupIndex(n, l) {
    const ORDER = ['1s', '2sp', '3sp', '3d', '4sp', '4d', '4f', '5sp', '5d', '5f', '6sp', '6d', '7sp'];
    const key = l <= 1 ? (n + (n === 1 ? 's' : 'sp')) : (n + 'df'[l - 2]);
    const idx = ORDER.indexOf(key);
    VV.assert(idx >= 0, 'no Slater group for n=' + n + ' l=' + l);
    return idx;
  }

  function screeningFrac(z, n, l) {
    VV.assert(n >= 1 && n <= 7 && l >= 0 && l <= 3 && l < n, 'bad (n,l) for Slater: ' + n + ',' + l);
    const cfg = VV.data.configOf(z);
    const gTarget = groupIndex(n, l);
    let s = FR.F(0, 1);
    let sameGroup = 0;
    let occupied = false;
    for (let i = 0; i < cfg.length; i++) {
      const sh = cfg[i];
      const g = groupIndex(sh.n, sh.l);
      if (g === gTarget) {
        sameGroup += sh.count;
        if (sh.n === n && sh.l === l && sh.count > 0) occupied = true;
        continue;
      }
      if (g > gTarget) continue; // later groups never screen
      if (l <= 1) {
        // ns,np target: 0.85 per n-1 electron, 1.00 per n-2 or deeper;
        // same-n d/f electrons sit in LATER groups and were skipped above.
        if (sh.n === n - 1) s = FR.fadd(s, FR.fmul(S_NM1, FR.F(sh.count, 1)));
        else if (sh.n <= n - 2) s = FR.fadd(s, FR.fmul(S_DEEP, FR.F(sh.count, 1)));
      } else {
        // nd/nf target: 1.00 per electron in every earlier group.
        s = FR.fadd(s, FR.fmul(S_DEEP, FR.F(sh.count, 1)));
      }
    }
    const others = occupied ? sameGroup - 1 : sameGroup;
    if (others > 0) {
      const per = (n === 1 && l === 0) ? S_1S : S_SAME;
      s = FR.fadd(s, FR.fmul(per, FR.F(others, 1)));
    }
    return s;
  }

  function zeffFrac(z, n, l) {
    const zf = FR.fsub(FR.F(z, 1), screeningFrac(z, n, l));
    // Cannot occur for any valence subshell; guard for exotic probes anyway.
    if (zf.n <= 0n) return FR.F(1, 10);
    return zf;
  }

  function zeff(z, n, l) { return FR.fToNumber(zeffFrac(z, n, l)); }

  const NSTAR = { 1: 1, 2: 2, 3: 3, 4: 3.7, 5: 4.0, 6: 4.2, 7: 4.3 }; // 7: extrapolated

  // Slater estimate with effective principal quantum number n*.
  function slaterEnergyEv(z, n, l) {
    const zf = zeff(z, n, l);
    const q = zf / NSTAR[n];
    return -VV.C.RY_EV * q * q;
  }

  // Energy of the hydrogenic wavefunction actually drawn (integer n).
  function hydrogenicEnergyEv(zeffNum, n) {
    return -VV.C.RY_EV * zeffNum * zeffNum / (n * n);
  }

  VV.slater = {
    NSTAR: NSTAR,
    screeningFrac: screeningFrac,
    zeffFrac: zeffFrac,
    zeff: zeff,
    slaterEnergyEv: slaterEnergyEv,
    hydrogenicEnergyEv: hydrogenicEnergyEv,
  };
})();
