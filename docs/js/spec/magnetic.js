/* Valence View — SPECULATIVE magnetic-field module (VV.magnetic).
 * Orbital Zeeman only: spin, spin–orbit and the full quadratic Zeeman term are
 * omitted; the strong-field squeeze is an honest heuristic interpolation. The
 * UI must label everything here SPECULATIVE. B in tesla, energies in eV. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  function zeemanShiftEv(m, B) { return VV.C.MU_B_EV_T * B * m; }

  // Level diagram input: E_nl (Slater estimate) + linear Zeeman shifts.
  function splitLevels(z, n, l, B) {
    const E = VV.slater.slaterEnergyEv(z, n, l);
    const out = [];
    for (let m = -l; m <= l; m++) out.push({ m: m, energyEv: E + zeemanShiftEv(m, B) });
    return out;
  }

  function larmorOmega(B) { return (VV.C.MU_B_EV_T / VV.C.HBAR_EV_S) * B; } // rad/s
  function larmorPeriod(B) { return 2 * Math.PI / larmorOmega(B); }         // s

  // Display rotation angle: α = ω_L · t_display · speedup, wrapped to 2π.
  // (Real periods are ~ps; callers pass a tiny speedup like 1e-11.)
  function precessionAngle(B, tDisplay, speedup) {
    const a = larmorOmega(B) * tDisplay * (speedup == null ? 1 : speedup);
    const TAU = 2 * Math.PI;
    return a - TAU * Math.floor(a / TAU);
  }

  /* Diamagnetic squeeze heuristic: γ = ħω_c/(2|E|) = μ_B·B/|E_nl|,
   * s⊥ = (1+γ²)^(-1/4). Exact in both limits (s⊥→1 as B→0; s⊥ ∝ B^(-1/2)
   * magnetic length in the Landau regime), interpolation in between.
   * γ ≈ 1 needs B ~ 1e4–1e5 T — white-dwarf territory, not laboratory. */
  function squeezeFactor(B, energyEv) {
    const gamma = VV.C.MU_B_EV_T * B / Math.abs(energyEv);
    return Math.pow(1 + gamma * gamma, -0.25);
  }

  VV.magnetic = {
    zeemanShiftEv: zeemanShiftEv,
    splitLevels: splitLevels,
    larmorOmega: larmorOmega,
    larmorPeriod: larmorPeriod,
    precessionAngle: precessionAngle,
    squeezeFactor: squeezeFactor,
  };
})();
