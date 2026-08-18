/* Valence View — physical constants (CODATA 2018). Internal units: lengths in
 * Bohr radii (a0), energies in eV, magnetic field in tesla. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  VV.C = {
    A0_M: 5.29177210903e-11,       // Bohr radius, m
    A0_PM: 52.9177210903,          // Bohr radius, pm
    RY_EV: 13.605693122994,        // Rydberg energy, eV
    MU_B_EV_T: 5.7883818060e-5,    // Bohr magneton, eV/T
    HBAR_EV_S: 6.582119569e-16,    // reduced Planck constant, eV*s
    B_ATOMIC_T: 2.35051757e5,      // atomic unit of magnetic field, T
    EV_J: 1.602176634e-19,         // electron-volt, J
  };
})();
