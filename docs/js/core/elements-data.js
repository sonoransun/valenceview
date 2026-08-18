/* Valence View — the single element table (VV.data), physics-owned.
 * Authored configuration strings are deliberately redundant with the
 * aufbau()+EXCEPTIONS generator: the verify suite ('config-vs-aufbau')
 * asserts they agree for all 118 elements, turning redundancy into a test.
 * group: 1..18, or 0 for the La–Lu / Ac–Lr f-block members. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const CAT = {
    a: 'alkali', e: 'alkaline', t: 'transition', p: 'post-transition',
    m: 'metalloid', n: 'nonmetal', h: 'halogen', g: 'noble',
    l: 'lanthanide', c: 'actinide',
  };

  // [z, sym, name, mass, period, group, categoryCode, authored config]
  const ROWS = [
    [1, 'H', 'Hydrogen', 1.01, 1, 1, 'n', '1s1'],
    [2, 'He', 'Helium', 4.00, 1, 18, 'g', '1s2'],
    [3, 'Li', 'Lithium', 6.94, 2, 1, 'a', '[He] 2s1'],
    [4, 'Be', 'Beryllium', 9.01, 2, 2, 'e', '[He] 2s2'],
    [5, 'B', 'Boron', 10.81, 2, 13, 'm', '[He] 2s2 2p1'],
    [6, 'C', 'Carbon', 12.01, 2, 14, 'n', '[He] 2s2 2p2'],
    [7, 'N', 'Nitrogen', 14.01, 2, 15, 'n', '[He] 2s2 2p3'],
    [8, 'O', 'Oxygen', 16.00, 2, 16, 'n', '[He] 2s2 2p4'],
    [9, 'F', 'Fluorine', 19.00, 2, 17, 'h', '[He] 2s2 2p5'],
    [10, 'Ne', 'Neon', 20.18, 2, 18, 'g', '[He] 2s2 2p6'],
    [11, 'Na', 'Sodium', 22.99, 3, 1, 'a', '[Ne] 3s1'],
    [12, 'Mg', 'Magnesium', 24.31, 3, 2, 'e', '[Ne] 3s2'],
    [13, 'Al', 'Aluminium', 26.98, 3, 13, 'p', '[Ne] 3s2 3p1'],
    [14, 'Si', 'Silicon', 28.09, 3, 14, 'm', '[Ne] 3s2 3p2'],
    [15, 'P', 'Phosphorus', 30.97, 3, 15, 'n', '[Ne] 3s2 3p3'],
    [16, 'S', 'Sulfur', 32.06, 3, 16, 'n', '[Ne] 3s2 3p4'],
    [17, 'Cl', 'Chlorine', 35.45, 3, 17, 'h', '[Ne] 3s2 3p5'],
    [18, 'Ar', 'Argon', 39.95, 3, 18, 'g', '[Ne] 3s2 3p6'],
    [19, 'K', 'Potassium', 39.10, 4, 1, 'a', '[Ar] 4s1'],
    [20, 'Ca', 'Calcium', 40.08, 4, 2, 'e', '[Ar] 4s2'],
    [21, 'Sc', 'Scandium', 44.96, 4, 3, 't', '[Ar] 3d1 4s2'],
    [22, 'Ti', 'Titanium', 47.87, 4, 4, 't', '[Ar] 3d2 4s2'],
    [23, 'V', 'Vanadium', 50.94, 4, 5, 't', '[Ar] 3d3 4s2'],
    [24, 'Cr', 'Chromium', 52.00, 4, 6, 't', '[Ar] 3d5 4s1'],
    [25, 'Mn', 'Manganese', 54.94, 4, 7, 't', '[Ar] 3d5 4s2'],
    [26, 'Fe', 'Iron', 55.85, 4, 8, 't', '[Ar] 3d6 4s2'],
    [27, 'Co', 'Cobalt', 58.93, 4, 9, 't', '[Ar] 3d7 4s2'],
    [28, 'Ni', 'Nickel', 58.69, 4, 10, 't', '[Ar] 3d8 4s2'],
    [29, 'Cu', 'Copper', 63.55, 4, 11, 't', '[Ar] 3d10 4s1'],
    [30, 'Zn', 'Zinc', 65.38, 4, 12, 't', '[Ar] 3d10 4s2'],
    [31, 'Ga', 'Gallium', 69.72, 4, 13, 'p', '[Ar] 3d10 4s2 4p1'],
    [32, 'Ge', 'Germanium', 72.63, 4, 14, 'm', '[Ar] 3d10 4s2 4p2'],
    [33, 'As', 'Arsenic', 74.92, 4, 15, 'm', '[Ar] 3d10 4s2 4p3'],
    [34, 'Se', 'Selenium', 78.97, 4, 16, 'n', '[Ar] 3d10 4s2 4p4'],
    [35, 'Br', 'Bromine', 79.90, 4, 17, 'h', '[Ar] 3d10 4s2 4p5'],
    [36, 'Kr', 'Krypton', 83.80, 4, 18, 'g', '[Ar] 3d10 4s2 4p6'],
    [37, 'Rb', 'Rubidium', 85.47, 5, 1, 'a', '[Kr] 5s1'],
    [38, 'Sr', 'Strontium', 87.62, 5, 2, 'e', '[Kr] 5s2'],
    [39, 'Y', 'Yttrium', 88.91, 5, 3, 't', '[Kr] 4d1 5s2'],
    [40, 'Zr', 'Zirconium', 91.22, 5, 4, 't', '[Kr] 4d2 5s2'],
    [41, 'Nb', 'Niobium', 92.91, 5, 5, 't', '[Kr] 4d4 5s1'],
    [42, 'Mo', 'Molybdenum', 95.95, 5, 6, 't', '[Kr] 4d5 5s1'],
    [43, 'Tc', 'Technetium', 98.00, 5, 7, 't', '[Kr] 4d5 5s2'],
    [44, 'Ru', 'Ruthenium', 101.07, 5, 8, 't', '[Kr] 4d7 5s1'],
    [45, 'Rh', 'Rhodium', 102.91, 5, 9, 't', '[Kr] 4d8 5s1'],
    [46, 'Pd', 'Palladium', 106.42, 5, 10, 't', '[Kr] 4d10'],
    [47, 'Ag', 'Silver', 107.87, 5, 11, 't', '[Kr] 4d10 5s1'],
    [48, 'Cd', 'Cadmium', 112.41, 5, 12, 't', '[Kr] 4d10 5s2'],
    [49, 'In', 'Indium', 114.82, 5, 13, 'p', '[Kr] 4d10 5s2 5p1'],
    [50, 'Sn', 'Tin', 118.71, 5, 14, 'p', '[Kr] 4d10 5s2 5p2'],
    [51, 'Sb', 'Antimony', 121.76, 5, 15, 'm', '[Kr] 4d10 5s2 5p3'],
    [52, 'Te', 'Tellurium', 127.60, 5, 16, 'm', '[Kr] 4d10 5s2 5p4'],
    [53, 'I', 'Iodine', 126.90, 5, 17, 'h', '[Kr] 4d10 5s2 5p5'],
    [54, 'Xe', 'Xenon', 131.29, 5, 18, 'g', '[Kr] 4d10 5s2 5p6'],
    [55, 'Cs', 'Caesium', 132.91, 6, 1, 'a', '[Xe] 6s1'],
    [56, 'Ba', 'Barium', 137.33, 6, 2, 'e', '[Xe] 6s2'],
    [57, 'La', 'Lanthanum', 138.91, 6, 0, 'l', '[Xe] 5d1 6s2'],
    [58, 'Ce', 'Cerium', 140.12, 6, 0, 'l', '[Xe] 4f1 5d1 6s2'],
    [59, 'Pr', 'Praseodymium', 140.91, 6, 0, 'l', '[Xe] 4f3 6s2'],
    [60, 'Nd', 'Neodymium', 144.24, 6, 0, 'l', '[Xe] 4f4 6s2'],
    [61, 'Pm', 'Promethium', 145.00, 6, 0, 'l', '[Xe] 4f5 6s2'],
    [62, 'Sm', 'Samarium', 150.36, 6, 0, 'l', '[Xe] 4f6 6s2'],
    [63, 'Eu', 'Europium', 151.96, 6, 0, 'l', '[Xe] 4f7 6s2'],
    [64, 'Gd', 'Gadolinium', 157.25, 6, 0, 'l', '[Xe] 4f7 5d1 6s2'],
    [65, 'Tb', 'Terbium', 158.93, 6, 0, 'l', '[Xe] 4f9 6s2'],
    [66, 'Dy', 'Dysprosium', 162.50, 6, 0, 'l', '[Xe] 4f10 6s2'],
    [67, 'Ho', 'Holmium', 164.93, 6, 0, 'l', '[Xe] 4f11 6s2'],
    [68, 'Er', 'Erbium', 167.26, 6, 0, 'l', '[Xe] 4f12 6s2'],
    [69, 'Tm', 'Thulium', 168.93, 6, 0, 'l', '[Xe] 4f13 6s2'],
    [70, 'Yb', 'Ytterbium', 173.05, 6, 0, 'l', '[Xe] 4f14 6s2'],
    [71, 'Lu', 'Lutetium', 174.97, 6, 0, 'l', '[Xe] 4f14 5d1 6s2'],
    [72, 'Hf', 'Hafnium', 178.49, 6, 4, 't', '[Xe] 4f14 5d2 6s2'],
    [73, 'Ta', 'Tantalum', 180.95, 6, 5, 't', '[Xe] 4f14 5d3 6s2'],
    [74, 'W', 'Tungsten', 183.84, 6, 6, 't', '[Xe] 4f14 5d4 6s2'],
    [75, 'Re', 'Rhenium', 186.21, 6, 7, 't', '[Xe] 4f14 5d5 6s2'],
    [76, 'Os', 'Osmium', 190.23, 6, 8, 't', '[Xe] 4f14 5d6 6s2'],
    [77, 'Ir', 'Iridium', 192.22, 6, 9, 't', '[Xe] 4f14 5d7 6s2'],
    [78, 'Pt', 'Platinum', 195.08, 6, 10, 't', '[Xe] 4f14 5d9 6s1'],
    [79, 'Au', 'Gold', 196.97, 6, 11, 't', '[Xe] 4f14 5d10 6s1'],
    [80, 'Hg', 'Mercury', 200.59, 6, 12, 't', '[Xe] 4f14 5d10 6s2'],
    [81, 'Tl', 'Thallium', 204.38, 6, 13, 'p', '[Xe] 4f14 5d10 6s2 6p1'],
    [82, 'Pb', 'Lead', 207.20, 6, 14, 'p', '[Xe] 4f14 5d10 6s2 6p2'],
    [83, 'Bi', 'Bismuth', 208.98, 6, 15, 'p', '[Xe] 4f14 5d10 6s2 6p3'],
    [84, 'Po', 'Polonium', 209.00, 6, 16, 'p', '[Xe] 4f14 5d10 6s2 6p4'],
    [85, 'At', 'Astatine', 210.00, 6, 17, 'h', '[Xe] 4f14 5d10 6s2 6p5'],
    [86, 'Rn', 'Radon', 222.00, 6, 18, 'g', '[Xe] 4f14 5d10 6s2 6p6'],
    [87, 'Fr', 'Francium', 223.00, 7, 1, 'a', '[Rn] 7s1'],
    [88, 'Ra', 'Radium', 226.00, 7, 2, 'e', '[Rn] 7s2'],
    [89, 'Ac', 'Actinium', 227.00, 7, 0, 'c', '[Rn] 6d1 7s2'],
    [90, 'Th', 'Thorium', 232.04, 7, 0, 'c', '[Rn] 6d2 7s2'],
    [91, 'Pa', 'Protactinium', 231.04, 7, 0, 'c', '[Rn] 5f2 6d1 7s2'],
    [92, 'U', 'Uranium', 238.03, 7, 0, 'c', '[Rn] 5f3 6d1 7s2'],
    [93, 'Np', 'Neptunium', 237.00, 7, 0, 'c', '[Rn] 5f4 6d1 7s2'],
    [94, 'Pu', 'Plutonium', 244.00, 7, 0, 'c', '[Rn] 5f6 7s2'],
    [95, 'Am', 'Americium', 243.00, 7, 0, 'c', '[Rn] 5f7 7s2'],
    [96, 'Cm', 'Curium', 247.00, 7, 0, 'c', '[Rn] 5f7 6d1 7s2'],
    [97, 'Bk', 'Berkelium', 247.00, 7, 0, 'c', '[Rn] 5f9 7s2'],
    [98, 'Cf', 'Californium', 251.00, 7, 0, 'c', '[Rn] 5f10 7s2'],
    [99, 'Es', 'Einsteinium', 252.00, 7, 0, 'c', '[Rn] 5f11 7s2'],
    [100, 'Fm', 'Fermium', 257.00, 7, 0, 'c', '[Rn] 5f12 7s2'],
    [101, 'Md', 'Mendelevium', 258.00, 7, 0, 'c', '[Rn] 5f13 7s2'],
    [102, 'No', 'Nobelium', 259.00, 7, 0, 'c', '[Rn] 5f14 7s2'],
    [103, 'Lr', 'Lawrencium', 266.00, 7, 0, 'c', '[Rn] 5f14 7s2 7p1'],
    [104, 'Rf', 'Rutherfordium', 267.00, 7, 4, 't', '[Rn] 5f14 6d2 7s2'],
    [105, 'Db', 'Dubnium', 268.00, 7, 5, 't', '[Rn] 5f14 6d3 7s2'],
    [106, 'Sg', 'Seaborgium', 269.00, 7, 6, 't', '[Rn] 5f14 6d4 7s2'],
    [107, 'Bh', 'Bohrium', 270.00, 7, 7, 't', '[Rn] 5f14 6d5 7s2'],
    [108, 'Hs', 'Hassium', 269.00, 7, 8, 't', '[Rn] 5f14 6d6 7s2'],
    [109, 'Mt', 'Meitnerium', 278.00, 7, 9, 't', '[Rn] 5f14 6d7 7s2'],
    [110, 'Ds', 'Darmstadtium', 281.00, 7, 10, 't', '[Rn] 5f14 6d8 7s2'],
    [111, 'Rg', 'Roentgenium', 282.00, 7, 11, 't', '[Rn] 5f14 6d9 7s2'],
    [112, 'Cn', 'Copernicium', 285.00, 7, 12, 't', '[Rn] 5f14 6d10 7s2'],
    [113, 'Nh', 'Nihonium', 286.00, 7, 13, 'p', '[Rn] 5f14 6d10 7s2 7p1'],
    [114, 'Fl', 'Flerovium', 289.00, 7, 14, 'p', '[Rn] 5f14 6d10 7s2 7p2'],
    [115, 'Mc', 'Moscovium', 290.00, 7, 15, 'p', '[Rn] 5f14 6d10 7s2 7p3'],
    [116, 'Lv', 'Livermorium', 293.00, 7, 16, 'p', '[Rn] 5f14 6d10 7s2 7p4'],
    [117, 'Ts', 'Tennessine', 294.00, 7, 17, 'h', '[Rn] 5f14 6d10 7s2 7p5'],
    [118, 'Og', 'Oganesson', 294.00, 7, 18, 'g', '[Rn] 5f14 6d10 7s2 7p6'],
  ];

  const COMMON = [1, 2, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 19, 20, 26, 29, 30, 35, 47, 79, 80, 82];

  // Aufbau exceptions (map z -> config string); Z >= 104 stays pure Madelung.
  const EXCEPTIONS = {
    24: '[Ar] 3d5 4s1', 29: '[Ar] 3d10 4s1',
    41: '[Kr] 4d4 5s1', 42: '[Kr] 4d5 5s1', 44: '[Kr] 4d7 5s1',
    45: '[Kr] 4d8 5s1', 46: '[Kr] 4d10', 47: '[Kr] 4d10 5s1',
    57: '[Xe] 5d1 6s2', 58: '[Xe] 4f1 5d1 6s2', 64: '[Xe] 4f7 5d1 6s2',
    78: '[Xe] 4f14 5d9 6s1', 79: '[Xe] 4f14 5d10 6s1',
    89: '[Rn] 6d1 7s2', 90: '[Rn] 6d2 7s2', 91: '[Rn] 5f2 6d1 7s2',
    92: '[Rn] 5f3 6d1 7s2', 93: '[Rn] 5f4 6d1 7s2', 96: '[Rn] 5f7 6d1 7s2',
    103: '[Rn] 5f14 7s2 7p1',
  };

  const VALENCE_OVERRIDES = {}; // escape hatch; intentionally empty

  const L_OF = { s: 0, p: 1, d: 2, f: 3 };
  const LETTER_OF = 'spdf';

  const ELEMENTS = ROWS.map(function (r) {
    return {
      z: r[0], sym: r[1], name: r[2], mass: r[3], period: r[4], group: r[5],
      category: CAT[r[6]], config: r[7],
      common: COMMON.indexOf(r[0]) >= 0,
      predicted: r[0] >= 104,
    };
  });

  function byZ(z) { return ELEMENTS[z - 1] || null; }

  const symIndex = Object.create(null);
  ELEMENTS.forEach(function (e) { symIndex[e.sym] = e; });
  function bySym(sym) { return symIndex[sym] || null; }

  // '[Ar] 3d6 4s2' -> [{n, l, count}], noble-gas prefix expanded recursively.
  function parseConfig(str) {
    const out = [];
    const parts = String(str).trim().split(/\s+/);
    for (let i = 0; i < parts.length; i++) {
      const tok = parts[i];
      const core = /^\[([A-Z][a-z]?)\]$/.exec(tok);
      if (core) {
        const el = bySym(core[1]);
        VV.assert(el, 'unknown noble-gas core ' + tok);
        const inner = parseConfig(el.config);
        for (let j = 0; j < inner.length; j++) out.push(inner[j]);
        continue;
      }
      const m = /^([1-9])([spdf])([0-9]+)$/.exec(tok);
      VV.assert(m, 'bad config token "' + tok + '"');
      out.push({ n: +m[1], l: L_OF[m[2]], count: +m[3] });
    }
    return out;
  }

  const configCache = Object.create(null);
  function configOf(z) {
    if (!configCache[z]) configCache[z] = parseConfig(byZ(z).config);
    return configCache[z].map(function (s) { return { n: s.n, l: s.l, count: s.count }; });
  }

  // Madelung fill order (sort by n+l, then n), capacities 2(2l+1).
  const MADELUNG = (function () {
    const shells = [];
    for (let n = 1; n <= 8; n++) for (let l = 0; l <= Math.min(n - 1, 3); l++) shells.push([n, l]);
    shells.sort(function (a, b) {
      const sa = a[0] + a[1], sb = b[0] + b[1];
      return sa - sb || a[0] - b[0];
    });
    return shells;
  })();

  function aufbau(z) {
    const out = [];
    let left = z;
    for (let i = 0; i < MADELUNG.length && left > 0; i++) {
      const n = MADELUNG[i][0], l = MADELUNG[i][1];
      const cap = 2 * (2 * l + 1);
      const c = Math.min(cap, left);
      out.push({ n: n, l: l, count: c });
      left -= c;
    }
    return out;
  }

  const NOBLE_Z = [2, 10, 18, 36, 54, 86, 118];
  function periodOf(z) {
    for (let i = 0; i < NOBLE_Z.length; i++) if (z <= NOBLE_Z[i]) return i + 1;
    return 8;
  }

  function countOf(config, n, l) {
    for (let i = 0; i < config.length; i++)
      if (config[i].n === n && config[i].l === l) return config[i].count;
    return 0;
  }

  /* Valence subshells (deterministic, spec-physics §3.3):
   * P from noble-gas boundaries (handles Pd, whose max occupied n is 4 but P=5);
   * always Ps (even empty), Pp if occupied; (P-1)d if occupied and (d<10 or no
   * Pp electrons); (P-2)f if occupied and (f<14 or (no (P-1)d and no Pp)). */
  function valenceSubshells(z) {
    if (VALENCE_OVERRIDES[z]) return VALENCE_OVERRIDES[z].map(function (s) { return { n: s.n, l: s.l, count: s.count }; });
    const cfg = configOf(z);
    const P = periodOf(z);
    const out = [];
    const sCount = countOf(cfg, P, 0);
    const pCount = P >= 2 ? countOf(cfg, P, 1) : 0;
    const dCount = P >= 4 ? countOf(cfg, P - 1, 2) : 0;
    const fCount = P >= 6 ? countOf(cfg, P - 2, 3) : 0;
    out.push({ n: P, l: 0, count: sCount });
    if (pCount > 0) out.push({ n: P, l: 1, count: pCount });
    if (dCount > 0 && (dCount < 10 || pCount === 0)) out.push({ n: P - 1, l: 2, count: dCount });
    if (fCount > 0 && (fCount < 14 || (dCount === 0 && pCount === 0))) out.push({ n: P - 2, l: 3, count: fCount });
    // Madelung (energy) order, ascending — the last entry is the default chip.
    out.sort(function (a, b) {
      const sa = a.n + a.l, sb = b.n + b.l;
      return sa - sb || a.n - b.n;
    });
    return out;
  }

  function fmtShells(shells) {
    return shells.map(function (s) { return s.n + LETTER_OF[s.l] + s.count; }).join(' ');
  }

  function sortNL(shells) {
    return shells.slice().sort(function (a, b) { return a.n - b.n || a.l - b.l; });
  }

  function configString(z) {
    return fmtShells(sortNL(configOf(z)));
  }

  function nobleGasString(z) {
    const el = byZ(z);
    if (z <= 2) return el.config;
    let core = null;
    for (let i = NOBLE_Z.length - 1; i >= 0; i--) if (NOBLE_Z[i] < z) { core = NOBLE_Z[i]; break; }
    if (core == null) return configString(z);
    const coreCfg = configOf(core);
    const cfg = configOf(z);
    const rest = cfg.filter(function (s) { return countOf(coreCfg, s.n, s.l) < s.count; })
      .map(function (s) { return { n: s.n, l: s.l, count: s.count - countOf(coreCfg, s.n, s.l) }; });
    return '[' + byZ(core).sym + '] ' + fmtShells(sortNL(rest));
  }

  VV.data = {
    ELEMENTS: ELEMENTS,
    COMMON: COMMON,
    EXCEPTIONS: EXCEPTIONS,
    VALENCE_OVERRIDES: VALENCE_OVERRIDES,
    byZ: byZ,
    bySym: bySym,
    parseConfig: parseConfig,
    configOf: configOf,
    aufbau: aufbau,
    periodOf: periodOf,
    valenceSubshells: valenceSubshells,
    configString: configString,
    nobleGasString: nobleGasString,
  };
})();
