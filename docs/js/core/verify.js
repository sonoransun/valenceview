/* Valence View — in-browser verification suite (VV.verify).
 * Check = { id, name, group, subject, kind:'abs'|'rel'|'info'|'bool', tol,
 *           run() -> { computed, expected, error, pass } }   (run is SYNC)
 * What is VERIFIED: the hydrogenic basis functions and their advertised
 * properties (normalization, orthogonality, moments, nodes, symbolic =
 * numeric). What is ESTIMATED: Slater Z_eff and energies ('info' checks
 * document the model's honesty gaps). The 'theory-anchors' group hardcodes
 * the textbook closed forms printed in theory.html, pinning display to
 * numerics. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  const FR = VV.frac;

  const LETTER = 'spdf';

  function finish(kind, tol, r) {
    let error = r.error;
    let pass = r.pass;
    if (kind === 'abs') {
      if (error == null) error = Math.abs(r.computed - r.expected);
      if (pass == null) pass = error <= tol;
    } else if (kind === 'rel') {
      if (error == null) error = Math.abs(r.computed - r.expected) / Math.max(Math.abs(r.expected), 1e-300);
      if (pass == null) pass = error <= tol;
    } else if (kind === 'bool') {
      if (error == null) error = r.computed === r.expected ? 0 : 1;
      if (pass == null) pass = r.computed === r.expected;
    } else { // info
      if (error == null) error = 0;
      pass = true;
    }
    return { computed: r.computed, expected: r.expected, error: error, pass: pass };
  }

  function mk(id, name, group, subject, kind, tol, fn) {
    return {
      id: id, name: name, group: group, subject: subject, kind: kind, tol: tol,
      run: function () { return finish(kind, tol, fn()); },
    };
  }

  // Guarded max relative error over paired samples (near-zero-safe).
  function maxRelErr(pairs) {
    let scale = 0;
    for (let i = 0; i < pairs.length; i++) scale = Math.max(scale, Math.abs(pairs[i][1]));
    let worst = 0;
    for (let i = 0; i < pairs.length; i++) {
      const d = Math.abs(pairs[i][0] - pairs[i][1]);
      worst = Math.max(worst, d / Math.max(Math.abs(pairs[i][1]), 1e-9 * scale, 1e-300));
    }
    return worst;
  }

  const NL_LIST = (function () {
    const out = [];
    for (let n = 1; n <= 7; n++) for (let l = 0; l <= Math.min(n - 1, 3); l++) out.push([n, l]);
    return out;
  })();

  const LM_LIST = (function () {
    const out = [];
    for (let l = 0; l <= 3; l++) for (let m = -l; m <= l; m++) out.push([l, m]);
    return out;
  })();

  // Radial integral with the tail fully captured: suggestedExtent encloses
  // >99.9% of P(r), but the 1e-9 norm tolerance needs the remaining tail, so
  // integrate over twice that span (12 panels × GL-64 → machine precision).
  function rInt(f, n, l, z) {
    return VV.quad.radialIntegral(f, 2 * VV.hydro.suggestedExtent(n, l, z), 12);
  }

  // Full 3D ∫ψ² over an r×θ×φ product grid using a cartesian psi closure.
  function norm3D(psi, rmax) {
    const gx = VV.quad.gaussLegendre(32);
    const NPHI = 64;
    const dphi = 2 * Math.PI / NPHI;
    let total = 0;
    const panels = 8, NR = 64;
    for (let p = 0; p < panels; p++) {
      const gr = VV.quad.glMapped(NR, p * rmax / panels, (p + 1) * rmax / panels);
      for (let i = 0; i < NR; i++) {
        const r = gr.x[i];
        let sAng = 0;
        for (let j = 0; j < 32; j++) {
          const ct = gx.x[j], st = Math.sqrt(1 - ct * ct);
          let sp = 0;
          for (let kph = 0; kph < NPHI; kph++) {
            const phi = kph * dphi;
            const v = psi(r * st * Math.cos(phi), r * st * Math.sin(phi), r * ct);
            sp += v * v;
          }
          sAng += gx.w[j] * sp;
        }
        total += gr.w[i] * r * r * sAng * dphi;
      }
    }
    return total;
  }

  // ------------------------------------------------- static suite builder ---

  function buildStatic() {
    const checks = [];
    const RSAMPLES = [0.17, 0.42, 0.83, 1.27, 1.9, 2.6, 3.4, 4.9, 6.3, 8.1];

    // -- special: Laguerre Horner vs recurrence ----------------------------
    for (let n = 1; n <= 7; n++) {
      (function (n) {
        checks.push(mk('laguerre-xcheck-n' + n, 'Laguerre Horner vs recurrence', 'special',
          'all l, n=' + n + ', 50 pts', 'rel', 1e-10, function () {
            const pairs = [];
            for (let l = 0; l <= Math.min(n - 1, 3); l++) {
              const k = n - l - 1, alpha = 2 * l + 1;
              const co = VV.special.laguerreCoeffs(k, alpha);
              for (let i = 1; i <= 50; i++) {
                const x = i * 0.8;
                pairs.push([VV.special.horner(co, x), VV.special.laguerreRecurrence(k, alpha, x)]);
              }
            }
            return { computed: maxRelErr(pairs), expected: 0, error: maxRelErr(pairs), pass: maxRelErr(pairs) <= 1e-10 };
          }));
      })(n);
    }

    // -- radial: normalization, orthogonality, <r> -------------------------
    [1, 3.25].forEach(function (z) {
      NL_LIST.forEach(function (nl) {
        const n = nl[0], l = nl[1];
        checks.push(mk('radial-norm-' + n + LETTER[l] + '-z' + z, '∫r²R² = 1', 'radial',
          'R_' + n + l + ', z=' + z, 'abs', 1e-9, function () {
            const Pr = VV.hydro.prFactory(n, l, z);
            return { computed: rInt(Pr, n, l, z), expected: 1 };
          }));
      });
    });

    [[1, 0, 2, 0], [2, 0, 3, 0], [2, 1, 3, 1], [3, 2, 4, 2], [4, 3, 5, 3]].forEach(function (p) {
      const n1 = p[0], l1 = p[1], n2 = p[2], l2 = p[3];
      const name = n1 + LETTER[l1] + '-' + n2 + LETTER[l2];
      checks.push(mk('radial-ortho-' + name, 'radial orthogonality', 'radial',
        name + ', z=1', 'abs', 1e-9, function () {
          const Ra = VV.hydro.radialRfactory(n1, l1, 1);
          const Rb = VV.hydro.radialRfactory(n2, l2, 1);
          const rmax = Math.max(VV.hydro.suggestedExtent(n1, l1, 1), VV.hydro.suggestedExtent(n2, l2, 1));
          const v = VV.quad.radialIntegral(function (r) { return r * r * Ra(r) * Rb(r); }, rmax);
          return { computed: v, expected: 0 };
        }));
    });

    NL_LIST.forEach(function (nl) {
      const n = nl[0], l = nl[1], z = 3.25;
      checks.push(mk('r-expect-' + n + LETTER[l], '⟨r⟩ vs closed form', 'radial',
        n + LETTER[l] + ', z=' + z, 'rel', 1e-8, function () {
          const R = VV.hydro.radialRfactory(n, l, z);
          const v = rInt(function (r) { return r * r * r * R(r) * R(r); }, n, l, z);
          return { computed: v, expected: VV.derived.expectationR(n, l, z) };
        }));
    });

    // -- angular: full Gram matrix of the 16 real harmonics ----------------
    checks.push(mk('angular-orthonorm', 'real-harmonic Gram = identity', 'angular',
      '{S_lm : l ≤ 3}, 16×16', 'abs', 1e-12, function () {
        const fns = LM_LIST.map(function (lm) { return VV.hydro.realYlm(lm[0], lm[1]); });
        let worst = 0;
        for (let i = 0; i < fns.length; i++) {
          for (let j = i; j < fns.length; j++) {
            const g = VV.quad.angularIntegral(function (t, p) { return fns[i](t, p) * fns[j](t, p); });
            worst = Math.max(worst, Math.abs(g - (i === j ? 1 : 0)));
          }
        }
        return { computed: worst, expected: 0 };
      }));

    // Unsöld's theorem: Σ_m S_lm² = (2l+1)/4π — the physics behind the
    // composite UI's "a full subshell is spherically symmetric" note.
    checks.push(mk('unsold-sum', 'Unsöld: Σ_m S_lm² = (2l+1)/4π', 'angular',
      'l ∈ {1,2,3}, 20 pts', 'abs', 1e-12, function () {
        const THETAS = [0.35, 1.05, 1.75, 2.65];
        const PHIS = [0.2, 1.3, 2.5, 3.8, 5.4];
        let worst = 0;
        for (let l = 1; l <= 3; l++) {
          const want = (2 * l + 1) / (4 * Math.PI);
          const fns = [];
          for (let m = -l; m <= l; m++) fns.push(VV.hydro.realYlm(l, m));
          THETAS.forEach(function (t) {
            PHIS.forEach(function (p) {
              let s = 0;
              fns.forEach(function (S) { const v = S(t, p); s += v * v; });
              worst = Math.max(worst, Math.abs(s - want));
            });
          });
        }
        return { computed: worst, expected: 0 };
      }));

    // -- assembled 3D normalization (renderer's psiReal path) --------------
    checks.push(mk('norm-3d', 'full 3D ∫|ψ|² = 1', 'assembled',
      '3d m=−2, z=6.25', 'abs', 1e-6, function () {
        const psi = VV.hydro.psiReal(3, 2, -2, 6.25);
        return { computed: norm3D(psi, 2 * VV.hydro.suggestedExtent(3, 2, 6.25)), expected: 1 };
      }));

    // -- derived: most probable radius anchor ------------------------------
    [1, 3.25].forEach(function (z) {
      for (let n = 1; n <= 4; n++) {
        (function (n, z) {
          checks.push(mk('rmp-anchor-n' + n + '-z' + z, 'r_mp(n, n−1) = n²/z', 'derived',
            n + LETTER[n - 1] + ', z=' + z, 'rel', 1e-8, function () {
              return { computed: VV.derived.mostProbableRadius(n, n - 1, z), expected: n * n / z };
            }));
        })(n, z);
      }
    });

    // -- theory anchors: the closed forms printed in theory.html -----------
    const RADIAL_ANCHORS = {
      '10': function (z, r) { return 2 * Math.pow(z, 1.5) * Math.exp(-z * r); },
      '20': function (z, r) { return Math.pow(z, 1.5) / (2 * Math.SQRT2) * (2 - z * r) * Math.exp(-z * r / 2); },
      '21': function (z, r) { return Math.pow(z, 1.5) / (2 * Math.sqrt(6)) * (z * r) * Math.exp(-z * r / 2); },
      '30': function (z, r) { return 2 * Math.pow(z, 1.5) / (81 * Math.sqrt(3)) * (27 - 18 * z * r + 2 * z * z * r * r) * Math.exp(-z * r / 3); },
      '31': function (z, r) { return 4 * Math.pow(z, 1.5) / (81 * Math.sqrt(6)) * (z * r) * (6 - z * r) * Math.exp(-z * r / 3); },
      '32': function (z, r) { return 2 * Math.SQRT2 * Math.pow(z, 1.5) / (81 * Math.sqrt(15)) * (z * r) * (z * r) * Math.exp(-z * r / 3); },
    };
    Object.keys(RADIAL_ANCHORS).forEach(function (key) {
      const n = +key[0], l = +key[1];
      checks.push(mk('anchor-R' + key, 'R_' + key + ' vs textbook form', 'theory-anchors',
        'z ∈ {1, 3.25}, 10 pts', 'rel', 1e-10, function () {
          const pairs = [];
          [1, 3.25].forEach(function (z) {
            const R = VV.hydro.radialRfactory(n, l, z);
            RSAMPLES.forEach(function (r) { pairs.push([R(r), RADIAL_ANCHORS[key](z, r)]); });
          });
          const e = maxRelErr(pairs);
          return { computed: e, expected: 0, error: e, pass: e <= 1e-10 };
        }));
    });

    const ANGULAR_ANCHORS = [
      ['Y00', 0, 0, function (t, p) { return 0.5 / Math.sqrt(Math.PI); }],
      ['pz', 1, 0, function (t, p) { return Math.sqrt(3 / (4 * Math.PI)) * Math.cos(t); }],
      ['px', 1, 1, function (t, p) { return Math.sqrt(3 / (4 * Math.PI)) * Math.sin(t) * Math.cos(p); }],
      ['py', 1, -1, function (t, p) { return Math.sqrt(3 / (4 * Math.PI)) * Math.sin(t) * Math.sin(p); }],
      ['dz2', 2, 0, function (t, p) { const ct = Math.cos(t); return Math.sqrt(5 / (16 * Math.PI)) * (3 * ct * ct - 1); }],
    ];
    ANGULAR_ANCHORS.forEach(function (a) {
      checks.push(mk('anchor-' + a[0], a[0] + ' vs textbook form', 'theory-anchors',
        'l=' + a[1] + ' m=' + a[2], 'rel', 1e-10, function () {
          const S = VV.hydro.realYlm(a[1], a[2]);
          const pairs = [];
          [0.3, 0.8, 1.2, 1.9, 2.6].forEach(function (t) {
            [0.25, 1.1, 2.4, 3.9, 5.5].forEach(function (p) {
              pairs.push([S(t, p), a[3](t, p)]);
            });
          });
          const e = maxRelErr(pairs);
          return { computed: e, expected: 0, error: e, pass: e <= 1e-10 };
        }));
    });

    // -- symbolic layer = numeric evaluators -------------------------------
    checks.push(mk('symbolic-radial', 'radialSymbolic = radialRfactory', 'symbolic',
      '6 (n,l), z=13/4', 'rel', 1e-10, function () {
        const zf = FR.F(13, 4), z = 3.25;
        const pairs = [];
        [[1, 0], [2, 0], [2, 1], [3, 2], [4, 3], [5, 0]].forEach(function (nl) {
          const ev = VV.symbolic.radialSymbolicEval(VV.symbolic.radialSymbolic(nl[0], nl[1], zf));
          const R = VV.hydro.radialRfactory(nl[0], nl[1], z);
          RSAMPLES.forEach(function (r) { pairs.push([ev(r), R(r)]); });
        });
        const e = maxRelErr(pairs);
        return { computed: e, expected: 0, error: e, pass: e <= 1e-10 };
      }));
    checks.push(mk('symbolic-angular', 'angularSymbolic = realYlm', 'symbolic',
      'all 16 (l,m)', 'rel', 1e-10, function () {
        const pairs = [];
        LM_LIST.forEach(function (lm) {
          const ev = VV.symbolic.angularSymbolicEval(VV.symbolic.angularSymbolic(lm[0], lm[1]));
          const S = VV.hydro.realYlm(lm[0], lm[1]);
          [0.3, 0.8, 1.2, 1.9, 2.6].forEach(function (t) {
            [0.25, 1.1, 2.4, 3.9, 5.5].forEach(function (p) {
              pairs.push([ev(t, p), S(t, p)]);
            });
          });
        });
        const e = maxRelErr(pairs);
        return { computed: e, expected: 0, error: e, pass: e <= 1e-10 };
      }));

    checks.push(mk('symbolic-complex', 'complex Y convention (CS + conj identity)', 'symbolic',
      'all l ≤ 3, m ≠ 0', 'rel', 1e-10, function () {
        // Y_l^m = N P_l^m e^{imφ} (m>0, CS in P); Y_l^{-μ} = (-1)^μ conj(Y_l^μ).
        const pairs = [];
        LM_LIST.forEach(function (lm) {
          const l = lm[0], m = lm[1];
          if (m === 0) return;
          const absM = Math.abs(m);
          const ev = VV.symbolic.angularSymbolicEval(VV.symbolic.angularSymbolic(l, m, 'complex'));
          const amp = VV.hydro.complexAmp(l + 1, l, m, 2.0); // n=l+1: R nodeless
          const R = VV.hydro.radialRfactory(l + 1, l, 2.0);
          [0.4, 1.0, 1.7, 2.4].forEach(function (t) {
            const ct = Math.cos(t), st = Math.sin(t);
            const sign = (m < 0 && absM % 2 === 1) ? -1 : 1;
            const want = sign * VV.hydro.normLm(l, absM) * VV.special.legendreAssoc(l, absM, ct);
            pairs.push([ev(t, 0), want]);            // symbolic amplitude
            const r = 1.3;
            pairs.push([amp(r * st, 0, r * ct), R(r) * want]); // evaluator amplitude
          });
        });
        const e = maxRelErr(pairs);
        return { computed: e, expected: 0, error: e, pass: e <= 1e-10 };
      }));

    // -- Slater regressions (exact Fracs) ----------------------------------
    [
      ['He-1s', 2, 1, 0, FR.F(17, 10)],
      ['C-2p', 6, 2, 1, FR.F(13, 4)],
      ['Fe-3d', 26, 3, 2, FR.F(25, 4)],
      ['Fe-4s', 26, 4, 0, FR.F(15, 4)],
      ['Br-4p', 35, 4, 1, FR.F(38, 5)],
      ['U-5f', 92, 5, 3, FR.F(133, 10)],
    ].forEach(function (row) {
      checks.push(mk('slater-regression-' + row[0], 'Z_eff exact vs hand-computed', 'slater',
        row[0], 'abs', 0, function () {
          const zf = VV.slater.zeffFrac(row[1], row[2], row[3]);
          const exact = FR.fcmp(zf, row[4]) === 0;
          return {
            computed: FR.fToNumber(zf), expected: FR.fToNumber(row[4]),
            error: exact ? 0 : Math.abs(FR.fToNumber(zf) - FR.fToNumber(row[4])),
            pass: exact,
          };
        }));
    });

    // -- Slater vs Clementi–Raimondi (documented limitation, info) ---------
    [
      ['He 1s', 2, 1, 0, 1.688], ['C 2p', 6, 2, 1, 3.136], ['N 2p', 7, 2, 1, 3.834],
      ['O 2p', 8, 2, 1, 4.453], ['F 2p', 9, 2, 1, 5.100], ['Ne 2p', 10, 2, 1, 5.758],
      ['Na 3s', 11, 3, 0, 2.507], ['Si 3p', 14, 3, 1, 4.285], ['Cl 3p', 17, 3, 1, 6.116],
      ['K 4s', 19, 4, 0, 3.495],
    ].forEach(function (row) {
      checks.push(mk('slater-vs-clementi-' + row[0].replace(' ', '-'), 'Z_eff vs Clementi (info)', 'slater',
        row[0], 'info', 0.4, function () {
          const zf = VV.slater.zeff(row[1], row[2], row[3]);
          return { computed: zf, expected: row[4], error: Math.abs(zf - row[4]) / row[4] };
        }));
    });

    checks.push(mk('subshell-nonortho', 'Slater non-orthogonality (info)', 'slater',
      'Fe ⟨R_3d(6.25)|R_4s(3.75)⟩', 'info', 0, function () {
        const Ra = VV.hydro.radialRfactory(3, 2, 6.25);
        const Rb = VV.hydro.radialRfactory(4, 0, 3.75);
        const rmax = Math.max(VV.hydro.suggestedExtent(3, 2, 6.25), VV.hydro.suggestedExtent(4, 0, 3.75));
        const v = VV.quad.radialIntegral(function (r) { return r * r * Ra(r) * Rb(r); }, rmax);
        return { computed: v, expected: 0, error: Math.abs(v) };
      }));

    // -- element data: authored configs = aufbau + EXCEPTIONS --------------
    for (let p = 1; p <= 7; p++) {
      (function (p) {
        checks.push(mk('config-vs-aufbau-p' + p, 'authored config = generator', 'data',
          'period ' + p, 'abs', 0, function () {
            let bad = 0;
            VV.data.ELEMENTS.forEach(function (el) {
              if (el.period !== p) return;
              const gen = VV.data.EXCEPTIONS[el.z]
                ? VV.data.parseConfig(VV.data.EXCEPTIONS[el.z])
                : VV.data.aufbau(el.z);
              const auth = VV.data.configOf(el.z);
              const map = Object.create(null);
              let sum = 0;
              gen.forEach(function (s) { map[s.n + ',' + s.l] = (map[s.n + ',' + s.l] || 0) + s.count; });
              auth.forEach(function (s) { map[s.n + ',' + s.l] = (map[s.n + ',' + s.l] || 0) - s.count; sum += s.count; });
              const clean = Object.keys(map).every(function (k) { return map[k] === 0; });
              if (!clean || sum !== el.z) bad++;
            });
            return { computed: bad, expected: 0 };
          }));
      })(p);
    }

    // -- LCAO --------------------------------------------------------------
    checks.push(mk('lcao-s-r0', 'S(1s,1s) → 1 as R → 0', 'lcao', 'z=1, R=0.001', 'abs', 1e-3, function () {
      const o = { n: 1, l: 0, m: 0, zeff: 1 };
      return { computed: VV.lcao.overlapS(o, o, 0.001), expected: 1 };
    }));
    // Analytic 1s–1s overlap: S(R) = e^{-R}(1 + R + R²/3) (z = 1). At R=8 the
    // true value is 0.01017 — checked against the closed form, not "< 0.01".
    [2, 8].forEach(function (Rd) {
      checks.push(mk('lcao-s-r' + Rd, 'S(1s,1s) vs analytic', 'lcao', 'z=1, R=' + Rd, 'rel', 1e-3, function () {
        const o = { n: 1, l: 0, m: 0, zeff: 1 };
        const exact = Math.exp(-Rd) * (1 + Rd + Rd * Rd / 3);
        return { computed: VV.lcao.overlapS(o, o, Rd), expected: exact };
      }));
    });
    checks.push(mk('lcao-pz-sigma-sign', 'σ(p_z,p_z): facing lobes ⇒ S < 0', 'lcao',
      '2p_z, z=3.25, R=3', 'bool', 0, function () {
        const o = { n: 2, l: 1, m: 0, zeff: 3.25 };
        const S = VV.lcao.overlapS(o, o, 3);
        return { computed: S < 0 ? 1 : 0, expected: 1 };
      }));
    checks.push(mk('lcao-px-pi-sign', 'π(p_x,p_x): parallel lobes ⇒ S > 0', 'lcao',
      '2p_x, z=3.25, R=3', 'bool', 0, function () {
        const o = { n: 2, l: 1, m: 1, zeff: 3.25 };
        const S = VV.lcao.overlapS(o, o, 3);
        return { computed: S > 0 ? 1 : 0, expected: 1 };
      }));
    checks.push(mk('mo-homonuclear', 'H₂: c_A = c_B, E ordering', 'lcao', 'H–H, R=1.4', 'bool', 0, function () {
      const o = { n: 1, l: 0, m: 0, zeff: 1 };
      const alpha = VV.slater.slaterEnergyEv(1, 1, 0);
      const S = VV.lcao.overlapS(o, o, 1.4);
      const mo = VV.lcao.moCoefficients(alpha, alpha, S);
      const ok = Math.abs(mo.bonding.cA - mo.bonding.cB) < 1e-9 &&
        mo.bonding.E < mo.antibonding.E && mo.bonding.E < alpha && S > 0;
      return { computed: ok ? 1 : 0, expected: 1 };
    }));
    checks.push(mk('hybrid-orthonorm', 'hybrid tables orthonormal', 'lcao', 'sp, sp², sp³', 'abs', 1e-12, function () {
      let worst = 0;
      ['sp', 'sp2', 'sp3'].forEach(function (kind) {
        const table = VV.lcao.HYBRID_TABLES[kind];
        const vecs = table.map(function (combo, i) {
          const v = { '0,0': 0, '1,1': 0, '1,-1': 0, '1,0': 0 };
          VV.lcao.hybrid(kind, i).forEach(function (t) { v[t.l + ',' + t.m] = t.coeff; });
          return v;
        });
        for (let i = 0; i < vecs.length; i++) {
          for (let j = i; j < vecs.length; j++) {
            let dot = 0;
            Object.keys(vecs[i]).forEach(function (kk) { dot += vecs[i][kk] * vecs[j][kk]; });
            worst = Math.max(worst, Math.abs(dot - (i === j ? 1 : 0)));
          }
        }
      });
      return { computed: worst, expected: 0 };
    }));
    [['chain', 5], ['ring', 6]].forEach(function (row) {
      checks.push(mk('cluster-trace-' + row[0], 'Hückel Σ energies = 0', 'lcao',
        row[0] + ' N=' + row[1], 'abs', 1e-12, function () {
          const ct = VV.lcao.clusterTerms(1, row[0], row[1], 0, 2);
          const s = ct.energies.reduce(function (a, b) { return a + b; }, 0);
          return { computed: s, expected: 0 };
        }));
    });

    // -- magnetic ----------------------------------------------------------
    [1, 2, 3].forEach(function (l) {
      checks.push(mk('zeeman-sym-l' + l, 'Σ_m ΔE(m) = 0', 'magnetic', 'l=' + l + ', B=100 T', 'abs', 1e-15, function () {
        let s = 0;
        for (let m = -l; m <= l; m++) s += VV.magnetic.zeemanShiftEv(m, 100);
        return { computed: s, expected: 0 };
      }));
    });
    checks.push(mk('squeeze-limit-b0', 's⊥(0) = 1', 'magnetic', 'B=0', 'abs', 1e-15, function () {
      return { computed: VV.magnetic.squeezeFactor(0, -13.6), expected: 1 };
    }));
    checks.push(mk('squeeze-limit-binf', 's⊥·√B → const as B → ∞', 'magnetic', 'B=1e8 vs 4e8', 'rel', 1e-3, function () {
      const a = VV.magnetic.squeezeFactor(1e8, -13.6) * Math.sqrt(1e8);
      const b = VV.magnetic.squeezeFactor(4e8, -13.6) * Math.sqrt(4e8);
      return { computed: b / a, expected: 1 };
    }));
    checks.push(mk('larmor-anchor', 'ω_L(1 T) = μ_B/ħ', 'magnetic', 'B=1 T', 'rel', 1e-4, function () {
      return { computed: VV.magnetic.larmorOmega(1), expected: 8.7941e10 };
    }));

    // -- OrbitalModel facade (every state combination) ---------------------
    const BASE_STATE = {
      element: 6, orbital: '2p_z',
      viz: { tab: '3d', mode: 'points', colorMode: 'sign', quality: 'med', showAxes: true, showNucleus: true, plot2d: 'radial', plane: 'xz', isoMode: 'prob', isoFrac: 0.9, isoK: 0.1, transparent: true },
      anim: { playing: true, speed: 1 },
      field: { enabled: false, logB: 1 },
      comp: { enabled: false, mode: 'mo', z: 1, dist: 2.0, combo: 'bonding', hybrid: 'sp', hybridIndex: 0, topology: 'chain', nAtoms: 6, k: 0 },
    };
    function st(patch) {
      const s = JSON.parse(JSON.stringify(BASE_STATE));
      Object.keys(patch || {}).forEach(function (kk) {
        if (typeof patch[kk] === 'object' && s[kk]) Object.keys(patch[kk]).forEach(function (k2) { s[kk][k2] = patch[kk][k2]; });
        else s[kk] = patch[kk];
      });
      return s;
    }

    checks.push(mk('model-atom', 'buildOrbital: plain atom', 'model', 'C 2p_z', 'bool', 0, function () {
      const m = VV.hydro.buildOrbital(st({}));
      const direct = VV.hydro.psiReal(2, 1, 0, 3.25);
      let ok = m.descriptor.kind === 'real' && m.system.kind === 'atom' &&
        m.extent > 0 && isFinite(m.psi(0.5, 0.3, 0.8)) && m.specInfo === null &&
        m.psiComplexPhase === null && m.report.radialNodes === 0 &&
        Math.abs(m.report.zeff - 3.25) < 1e-14 && m.labelHTML.indexOf('2p') === 0;
      [[0.5, 0.3, 0.8], [1.2, -0.7, 0.1], [0, 0, 2.5]].forEach(function (p2) {
        ok = ok && Math.abs(m.psi(p2[0], p2[1], p2[2]) - direct(p2[0], p2[1], p2[2])) < 1e-12;
      });
      ok = ok && Math.abs(m.Pr(1.3) - 1.3 * 1.3 * m.Rnl(1.3) * m.Rnl(1.3)) < 1e-14;
      ok = ok && m.rMax(0.9) > 0 && m.rMax(0.9) < m.rMax(0.999);
      return { computed: ok ? 1 : 0, expected: 1 };
    }));

    checks.push(mk('model-complex', 'buildOrbital: complex kind (|ψ|² = re²+im²)', 'model',
      'Fe 3d_xy, phase colors', 'bool', 0, function () {
        const m = VV.hydro.buildOrbital(st({ element: 26, orbital: '3d_xy', viz: { colorMode: 'phase' } }));
        let ok = m.descriptor.kind === 'complex' && typeof m.psiComplexPhase === 'function';
        [[0.9, 0.4, 0.6], [-1.1, 0.8, -0.3], [0.2, -1.4, 1.0]].forEach(function (p2) {
          const c = m.psiComplexPhase(p2[0], p2[1], p2[2]);
          const a = m.psi(p2[0], p2[1], p2[2]);
          ok = ok && Math.abs(c.re * c.re + c.im * c.im - a * a) <= 1e-10 * Math.max(a * a, 1e-30);
        });
        // density is φ-independent for the complex orbital
        const a1 = m.psi(1.2, 0, 0.5), a2 = m.psi(0, 1.2, 0.5);
        ok = ok && Math.abs(Math.abs(a1) - Math.abs(a2)) < 1e-12;
        return { computed: ok ? 1 : 0, expected: 1 };
      }));

    checks.push(mk('model-field', 'buildOrbital: B-field squeeze + shifts', 'model',
      'Fe 3d_z2, B=10³ T', 'bool', 0, function () {
        const m0 = VV.hydro.buildOrbital(st({ element: 26, orbital: '3d_z2' }));
        const m = VV.hydro.buildOrbital(st({ element: 26, orbital: '3d_z2', field: { enabled: true, logB: 3 } }));
        const si = m.specInfo;
        let ok = si && si.type === 'field' && Math.abs(si.B - 1000) < 1e-9 &&
          si.squeeze > 0 && si.squeeze < 1 && si.shifts.length === 5 &&
          si.omegaLarmor > 0 && si.larmorPeriodS > 0;
        const sum = si.shifts.reduce(function (a, s2) { return a + s2.dEeV; }, 0);
        ok = ok && Math.abs(sum) < 1e-15;
        const inv = 1 / si.squeeze;
        [[0.8, 0.5, 1.1], [0, 0, 1.7]].forEach(function (p2) {
          const want = inv * m0.psi(p2[0] * inv, p2[1] * inv, p2[2]);
          ok = ok && Math.abs(m.psi(p2[0], p2[1], p2[2]) - want) < 1e-12;
        });
        return { computed: ok ? 1 : 0, expected: 1 };
      }));

    checks.push(mk('model-mo', 'buildOrbital: diatomic MO', 'model', 'H–H 1s, R=1.4', 'bool', 0, function () {
      const m = VV.hydro.buildOrbital(st({
        element: 1, orbital: '1s',
        comp: { enabled: true, mode: 'mo', z: 1, dist: 1.4, combo: 'bonding' },
      }));
      const mo = m.system.mo;
      let ok = m.system.kind === 'mo' && m.system.atoms.length === 2 &&
        m.system.terms.length === 2 && mo && mo.chosen === 'bonding' &&
        Math.abs(mo.bonding.cA - mo.bonding.cB) < 1e-9 &&
        mo.bonding.E < mo.antibonding.E && mo.S > 0 &&
        m.specInfo.type === 'mo' && m.extent > 0.7 &&
        Math.abs(m.system.atoms[0].pos[2] + 0.7) < 1e-12 &&
        m.psi(0, 0, 0) > 0;
      // antibonding has a node at the midplane
      const ma = VV.hydro.buildOrbital(st({
        element: 1, orbital: '1s',
        comp: { enabled: true, mode: 'mo', z: 1, dist: 1.4, combo: 'antibonding' },
      }));
      ok = ok && Math.abs(ma.psi(0.3, -0.2, 0)) < 1e-12 && ma.system.mo.chosen === 'antibonding';
      return { computed: ok ? 1 : 0, expected: 1 };
    }));

    checks.push(mk('model-hybrid', 'buildOrbital: sp³ hybrid', 'model', 'C sp³ #0', 'bool', 0, function () {
      const m = VV.hydro.buildOrbital(st({
        comp: { enabled: true, mode: 'hybrid', hybrid: 'sp3', hybridIndex: 0 },
      }));
      let ok = m.system.kind === 'hybrid' && m.system.terms.length === 4 &&
        m.specInfo.type === 'hybrid' && m.specInfo.coeffs.length === 4 &&
        m.specInfo.coeffs[0].orbKey === '2s' && isFinite(m.psi(0.4, 0.4, 0.4));
      // psi is exactly the ½(s+px+py+pz) combination…
      const zs = VV.slater.zeff(6, 2, 0);
      const parts = [[0, 0], [1, 1], [1, -1], [1, 0]].map(function (lm) {
        return VV.hydro.psiReal(2, lm[0], lm[1], zs);
      });
      [[0.7, 0.4, 1.1], [-0.9, 0.5, -0.2]].forEach(function (p2) {
        let want = 0;
        parts.forEach(function (f) { want += 0.5 * f(p2[0], p2[1], p2[2]); });
        ok = ok && Math.abs(m.psi(p2[0], p2[1], p2[2]) - want) < 1e-12;
      });
      // …and is asymmetric along the ±(1,1,1) hybrid axis (unlike pure s/p).
      ok = ok && Math.abs(Math.abs(m.psi(0.8, 0.8, 0.8)) - Math.abs(m.psi(-0.8, -0.8, -0.8))) > 1e-6;
      return { computed: ok ? 1 : 0, expected: 1 };
    }));

    checks.push(mk('model-cluster', 'buildOrbital: Hückel ring', 'model', 'H₆ ring, k=0', 'bool', 0, function () {
      const m = VV.hydro.buildOrbital(st({
        comp: { enabled: true, mode: 'cluster', z: 1, topology: 'ring', nAtoms: 6, k: 0, dist: 2 },
      }));
      const si = m.specInfo;
      let ok = m.system.kind === 'cluster' && m.system.atoms.length === 6 &&
        m.system.bonds.length === 6 && si.type === 'cluster' &&
        si.energies.length === 6 && Math.abs(si.energies[0] - 2) < 1e-12 &&
        Math.abs(si.energies.reduce(function (a, b) { return a + b; }, 0)) < 1e-12 &&
        isFinite(m.psi(0.1, 0.2, 0.3)) && m.extent > 2;
      // chain variant
      const mc = VV.hydro.buildOrbital(st({
        comp: { enabled: true, mode: 'cluster', z: 1, topology: 'chain', nAtoms: 4, k: 1, dist: 2 },
      }));
      ok = ok && mc.system.atoms.length === 4 && mc.system.bonds.length === 3 &&
        Math.abs(mc.psi(0.15, -0.25, 0)) < 1e-12; // k=1 chain mode is odd about center
      return { computed: ok ? 1 : 0, expected: 1 };
    }));

    checks.push(mk('model-ast-vocab', 'AST uses only the contract vocabulary', 'model', 'C 2p_z ast', 'bool', 0, function () {
      const ALLOWED = { num: 1, sym: 1, add: 1, neg: 1, mul: 1, frac: 1, pow: 1, sub: 1, sqrt: 1, exp: 1, func: 1, paren: 1, row: 1 };
      const m = VV.hydro.buildOrbital(st({ viz: { colorMode: 'phase' }, orbital: '2p_x' }));
      let ok = true;
      (function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node.t !== undefined && !ALLOWED[node.t]) ok = false;
        ['x', 'xs', 'num', 'den', 'base', 'exp', 'sub', 'arg'].forEach(function (kk) {
          if (node[kk] !== undefined && typeof node[kk] === 'object') walk(node[kk]);
        });
      })(m.ast);
      ok = ok && m.ast.t === 'row' && m.descriptor.kind === 'complex';
      return { computed: ok ? 1 : 0, expected: 1 };
    }));

    checks.push(mk('composite-model', 'buildComposite: full Fe 3d subshell', 'model',
      'Fe 3d ×5', 'bool', 0, function () {
        const keys = ['3d_z2', '3d_xz', '3d_yz', '3d_x2y2', '3d_xy'];
        const state = st({ element: 26, orbital: '3d_z2', multi: { enabled: true, keys: keys } });
        let ok = VV.hydro.isCompositeState(state) && !VV.hydro.isCompositeState(st({}));
        const m = VV.hydro.buildComposite(state);
        ok = ok && m.kind === 'composite' && m.components.length === 5 &&
          m.keys.join('+') === keys.join('+');
        // density(0.5,0.4,0.3) = manual Σ ψ_i²; extent = max component extent
        let manual = 0, maxExt = 0;
        m.components.forEach(function (c) {
          const v = c.psi(0.5, 0.4, 0.3);
          manual += v * v;
          maxExt = Math.max(maxExt, c.extent);
        });
        const d = m.density(0.5, 0.4, 0.3);
        ok = ok && Math.abs(d - manual) <= 1e-12 * Math.max(Math.abs(manual), 1e-300);
        ok = ok && m.extent === maxExt;
        ok = ok && m.subshells.length === 1 && m.subshells[0].n === 3 &&
          m.subshells[0].l === 2 && m.subshells[0].count === 5 &&
          m.subshells[0].indices.join(',') === '0,1,2,3,4';
        ok = ok && m.fullSubshells.some(function (s) { return s.n === 3 && s.l === 2; });
        // element-level report is shared; every component is real-kind; no
        // specInfo without a field
        ok = ok && m.report === m.components[0].report && m.specInfo === null &&
          m.components.every(function (c) { return c.descriptor.kind === 'real'; });
        return { computed: ok ? 1 : 0, expected: 1 };
      }));

    return checks;
  }

  // -- conditional MC self-test (only when the render layer is loaded) -----
  function buildMcChecks() {
    let cached = null;
    function build() {
      if (cached) return cached;
      const n = 48, halfSize = 1.6, R = 1;
      const values = new Float32Array(n * n * n);
      const step = 2 * halfSize / (n - 1);
      let min = Infinity, max = -Infinity;
      let idx = 0;
      for (let iz = 0; iz < n; iz++) {
        const zz = -halfSize + iz * step;
        for (let iy = 0; iy < n; iy++) {
          const yy = -halfSize + iy * step;
          for (let ix = 0; ix < n; ix++) {
            const xx = -halfSize + ix * step;
            const v = 1 - (xx * xx + yy * yy + zz * zz) / (R * R);
            values[idx++] = v;
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      }
      const grid = { values: values, n: n, center: [0, 0, 0], halfSize: halfSize, min: min, max: max, dV: step * step * step, step: step };
      const iso = 0.1;
      const mesh = VV.Iso.extract(grid, iso);
      cached = { mesh: mesh, iso: iso, R: R };
      return cached;
    }
    function meshStats(mesh) {
      const d = mesh.data, vc = mesh.vcount;
      let area = 0, degenerate = 0, tris = 0;
      const areas = [];
      const floats = Math.min(d.length, vc * 6); // stride 6: x,y,z,nx,ny,nz
      for (let i = 0; i + 18 <= floats; i += 18) {
        const ax = d[i], ay = d[i + 1], az = d[i + 2];
        const bx = d[i + 6], by = d[i + 7], bz = d[i + 8];
        const cx = d[i + 12], cy = d[i + 13], cz = d[i + 14];
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const a = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
        area += a;
        areas.push(a);
        tris++;
      }
      const mean = tris ? area / tris : 0;
      for (let i = 0; i < areas.length; i++) if (areas[i] < 1e-9 * mean) degenerate++;
      return { area: area, degenerate: degenerate, tris: tris };
    }
    return [
      mk('mc-area-pos', 'MC surface area (+iso sphere)', 'mc', 'ψ=1−r², iso=0.1', 'rel', 0.02, function () {
        const b = build();
        const s = meshStats(b.mesh.pos);
        return { computed: s.area, expected: 4 * Math.PI * (1 - b.iso) };
      }),
      mk('mc-area-neg', 'MC surface area (−iso sphere)', 'mc', 'ψ=1−r², iso=0.1', 'rel', 0.02, function () {
        const b = build();
        const s = meshStats(b.mesh.neg);
        return { computed: s.area, expected: 4 * Math.PI * (1 + b.iso) };
      }),
      mk('mc-degenerate', 'no degenerate triangles', 'mc', 'both meshes', 'abs', 0, function () {
        const b = build();
        const bad = meshStats(b.mesh.pos).degenerate + meshStats(b.mesh.neg).degenerate;
        return { computed: bad, expected: 0 };
      }),
    ];
  }

  let staticChecks = null;
  function list() {
    if (!staticChecks) staticChecks = buildStatic();
    const out = staticChecks.slice();
    if (VV.MC && VV.Iso && typeof VV.Iso.extract === 'function') {
      out.push.apply(out, buildMcChecks());
    }
    return out;
  }

  // Per-orbital factory (info panel's "Verify this orbital" deep link).
  function forOrbital(z, key) {
    const el = VV.data.byZ(z);
    VV.assert(el, 'forOrbital: unknown element ' + z);
    const q = VV.hydro.parseKey(key);
    const n = q.n, l = q.l, m = q.m;
    const subject = el.sym + ' ' + key;
    const zf = VV.slater.zeffFrac(z, n, l);
    const zeff = FR.fToNumber(zf);
    return [
      mk('orb-' + el.sym + '-' + key + '-norm3d', '3D ∫|ψ|² = 1', 'orbital', subject, 'abs', 1e-6, function () {
        const psi = VV.hydro.psiReal(n, l, m, zeff);
        return { computed: norm3D(psi, 2 * VV.hydro.suggestedExtent(n, l, zeff)), expected: 1 };
      }),
      mk('orb-' + el.sym + '-' + key + '-rexpect', '⟨r⟩ vs closed form', 'orbital', subject, 'rel', 1e-8, function () {
        const R = VV.hydro.radialRfactory(n, l, zeff);
        const v = rInt(function (r) { return r * r * r * R(r) * R(r); }, n, l, zeff);
        return { computed: v, expected: VV.derived.expectationR(n, l, zeff) };
      }),
      mk('orb-' + el.sym + '-' + key + '-nodes', 'radial node count = n−l−1', 'orbital', subject, 'abs', 0, function () {
        const R = VV.hydro.radialRfactory(n, l, zeff);
        const ext = VV.hydro.suggestedExtent(n, l, zeff);
        const N = 4001;
        let maxAbs = 0;
        const vals = new Float64Array(N);
        for (let i = 0; i < N; i++) {
          vals[i] = R((i + 1) * ext / N);
          maxAbs = Math.max(maxAbs, Math.abs(vals[i]));
        }
        const thr = 1e-12 * maxAbs;
        let nodes = 0, prev = 0;
        for (let i = 0; i < N; i++) {
          if (Math.abs(vals[i]) <= thr) continue;
          const s = vals[i] > 0 ? 1 : -1;
          if (prev !== 0 && s !== prev) nodes++;
          prev = s;
        }
        return { computed: nodes, expected: n - l - 1 };
      }),
      mk('orb-' + el.sym + '-' + key + '-zeff', 'Z_eff exact (denominator | 20)', 'orbital', subject, 'bool', 0, function () {
        const ok = zeff > 0 && (20n % zf.d) === 0n;
        return { computed: ok ? 1 : 0, expected: 1 };
      }),
      mk('orb-' + el.sym + '-' + key + '-energy', 'E_Slater formula consistency', 'orbital', subject, 'rel', 1e-12, function () {
        const q2 = zeff / VV.slater.NSTAR[n];
        return { computed: VV.slater.slaterEnergyEv(z, n, l), expected: -VV.C.RY_EV * q2 * q2 };
      }),
    ];
  }

  VV.verify = { list: list, forOrbital: forOrbital };
})();
