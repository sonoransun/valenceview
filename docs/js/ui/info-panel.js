/* Valence View — VV.ui.infoPanel: element facts, configuration with valence
 * highlighted, quantum numbers, both energy estimates, generated MathML
 * formula, theory/verify links, amber speculative sub-block. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  let root = null;
  const blocks = {};

  const SUBSHELL = ['s', 'p', 'd', 'f', 'g'];

  function div(id, cls) {
    const d = document.createElement('div');
    d.id = id;
    if (cls) d.className = cls;
    return d;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fracStr(f) {
    // Frac = { n: BigInt, d: BigInt }
    if (!f || typeof f !== 'object' || f.n === undefined || f.d === undefined) return null;
    const d = String(f.d);
    return d === '1' ? String(f.n) : String(f.n) + '/' + d;
  }

  // wraps valence subshell tokens (e.g. "3d6") of a config string in <mark>
  function highlightConfig(str, valence) {
    const val = {};
    for (const v of (valence || [])) val[v.n + SUBSHELL[v.l]] = true;
    return esc(str).replace(/(\[[A-Z][a-z]?[a-z]?\])|(\d[spdfg])(\d+)/g,
      function (all, noble, ss, count) {
        if (noble) return noble;
        return val[ss] ? '<mark class="val">' + ss + count + '</mark>' : ss + count;
      });
  }

  const CAT_FALLBACK = { css: '#9aa3b2' };
  function catCss(i) {
    const cat = VV.Cmap && VV.Cmap.CATEGORICAL;
    return ((cat && cat.length) ? cat[i % cat.length] : CAT_FALLBACK).css;
  }

  // composite legend: one entry per component (swatch + label + n,l,m + E),
  // plus the Unsoeld note when whole subshells are selected
  function renderCompositeLegend(model) {
    const wrap = blocks['info-orbital'];
    const n = model.components.length;
    wrap.innerHTML = '<h3>Composite of ' + n + ' orbital' + (n === 1 ? '' : 's') + '</h3>';
    const ul = document.createElement('ul');
    ul.className = 'comp-legend';
    model.components.forEach(function (cm, i) {
      const d = cm.descriptor || {};
      const rep = cm.report || {};
      const eEv = (typeof d.energyEv === 'number') ? d.energyEv : rep.energySlaterEv;
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="comp-swatch" style="background:' + catCss(i) + '"></span>' +
        '<span class="comp-label">' + (cm.labelHTML || esc(cm.key)) + '</span>' +
        '<span class="comp-meta">n = ' + d.n + ', ℓ = ' + d.l + ', m<sub>ℓ</sub> = ' +
        (d.m > 0 ? '+' : '') + d.m +
        (eEv != null ? ' · E = ' + VV.fmt.num(eEv, 5) + ' eV' : '') + '</span>';
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    const fss = model.fullSubshells || [];
    if (fss.length) {
      const names = fss.map(function (ss) { return ss.n + SUBSHELL[ss.l]; }).join(', ');
      const p = document.createElement('p');
      p.className = 'ctl-note note-unsold';
      p.innerHTML = 'All 2ℓ+1 ' + names + ' orbitals are selected — their summed ' +
        'density is spherically symmetric (Unsoeld’s theorem; verified by the ' +
        '<a href="verify.html">unsold-sum check</a>).';
      wrap.appendChild(p);
    }
  }

  function dl(pairs) {
    const el = document.createElement('dl');
    el.className = 'info-dl';
    for (const p of pairs) {
      if (p[1] == null || p[1] === '') continue;
      const dt = document.createElement('dt');
      dt.innerHTML = p[0];
      const dd = document.createElement('dd');
      dd.innerHTML = p[1];
      el.appendChild(dt);
      el.appendChild(dd);
    }
    return el;
  }

  VV.ui.infoPanel = {
    mount: function (container) {
      root = container;
      const h = document.createElement('h2');
      h.className = 'info-heading';
      h.textContent = 'Orbital details';
      root.appendChild(h);
      for (const id of ['info-element', 'info-config', 'info-orbital',
                        'info-formula', 'info-spec', 'info-links']) {
        blocks[id] = div(id, 'info-block');
        root.appendChild(blocks[id]);
      }
      blocks['info-spec'].className = 'info-block info-spec';
      blocks['info-spec'].hidden = true;
    },

    render: function (model, state) {
      if (!root || !model) return;
      const st = state || VV.store.get();
      const el = VV.data.byZ(st.element);
      const rep = model.report || {};
      const desc = model.descriptor || {};
      const catLabel = VV.ui.periodicTable
        ? VV.ui.periodicTable.categoryLabel(el.category) : el.category;

      // element facts
      blocks['info-element'].innerHTML =
        '<h3>' + esc(el.name) + ' <span class="sym">' + esc(el.sym) + '</span></h3>';
      blocks['info-element'].appendChild(dl([
        ['Atomic number', String(el.z)],
        ['Mass', VV.fmt.num(el.mass, 6) + ' u'],
        ['Category', esc(catLabel)],
        ['Period / group', el.period + ' / ' + (el.group > 0 ? el.group : '— (f-block)')],
      ]));

      // configuration
      let cfg = '<h3>Configuration</h3>' +
        '<code class="config">' + highlightConfig(rep.configString || '', rep.valence) + '</code>';
      if (rep.nobleGasString && rep.nobleGasString !== rep.configString) {
        cfg += '<code class="config config-short">' +
               highlightConfig(rep.nobleGasString, rep.valence) + '</code>';
      }
      if (rep.predicted || el.predicted) {
        cfg += '<p class="note-predicted">Predicted configuration — not experimentally confirmed (Z ≥ 104).</p>';
      }
      blocks['info-config'].innerHTML = cfg;

      const composite = model.kind === 'composite';
      if (composite) {
        // composite legend replaces the quantum-number block; no MathML
        // formula in composite v1 (per-component formulas remain in single)
        renderCompositeLegend(model);
        blocks['info-formula'].innerHTML = '';
      } else {
        // orbital numbers
        blocks['info-orbital'].innerHTML =
          '<h3>' + (model.labelHTML || esc(model.key)) + '</h3>';
        const m = desc.m || 0;
        let mText;
        if (desc.kind === 'complex') {
          mText = String(m) + ' (complex orbital e<sup>' + (m < 0 ? '−' : '') + 'i' +
                  (Math.abs(m) === 1 ? '' : Math.abs(m)) + 'φ</sup>)';
        } else if (desc.l > 0 && m !== 0) {
          mText = (m > 0 ? 'cos' : 'sin') + ' combination of m = ±' + Math.abs(m);
        } else {
          mText = '0';
        }
        const zf = fracStr(rep.zeffFrac);
        const pairs = [
          ['n', String(desc.n)],
          ['ℓ', String(desc.l)],
          ['m<sub>ℓ</sub>', mText],
          ['Z<sub>eff</sub> (Slater)', VV.fmt.num(rep.zeff, 5) + (zf ? ' (= ' + zf + ')' : '')],
          ['E (Slater n*)', VV.fmt.num(rep.energySlaterEv, 5) + ' eV'],
          ['E (hydrogenic, integer n)', VV.fmt.num(rep.energyHydrogenicEv, 5) + ' eV'],
          ['⟨r⟩', VV.fmt.num(rep.expectR_a0, 4) + ' a₀ = ' + VV.fmt.num(rep.expectR_pm, 4) + ' pm'],
          ['Most probable r', rep.rmp_a0 != null ? VV.fmt.num(rep.rmp_a0, 4) + ' a₀' : null],
          ['Radial nodes', String(rep.radialNodes)],
          ['Angular nodes', String(rep.angularNodes)],
        ];
        blocks['info-orbital'].appendChild(dl(pairs));
        if (desc.kind === 'complex') {
          const note = document.createElement('p');
          note.className = 'ctl-note';
          note.textContent = 'Phase color mode shows the complex orbital; its |ψ|² is φ-symmetric and the phase circulates in time. The chip labels the real ± combination.';
          blocks['info-orbital'].appendChild(note);
        }

        // formula
        const fb = blocks['info-formula'];
        fb.innerHTML = '<h3>Wavefunction</h3>';
        if (model.ast) {
          try {
            const math = VV.mathml.fromAST(model.ast);
            const wrap = document.createElement('div');
            wrap.className = 'formula-scroll';
            wrap.appendChild(math);
            fb.appendChild(wrap);
            const asciiEl = document.createElement('code');
            asciiEl.className = 'formula-ascii';
            asciiEl.textContent = math.getAttribute('data-ascii') || '';
            fb.appendChild(asciiEl);
          } catch (e) {
            const p = document.createElement('p');
            p.className = 'ctl-note';
            p.textContent = 'Formula unavailable: ' + e.message;
            fb.appendChild(p);
          }
        }
      }

      // speculative sub-block
      const spec = blocks['info-spec'];
      const si = model.specInfo;
      if (si) {
        spec.hidden = false;
        let html = '<h3><span class="badge-spec">Speculative</span> ';
        if (si.type === 'field') {
          html += 'Zeeman (orbital only)</h3>';
          html += '<p>B = ' + VV.fmt.num(si.B, 4) + ' T along +z. Shifts ΔE = μ<sub>B</sub>·B·m:</p><ul>';
          for (const s of (si.shifts || [])) {
            html += '<li>m = ' + (s.m > 0 ? '+' : '') + s.m + ': ' +
                    (s.dEeV === 0 ? '0' : VV.fmt.sci(s.dEeV, 4)) + ' eV</li>';
          }
          html += '</ul><p>ω<sub>L</sub> = ' + VV.fmt.sci(si.omegaLarmor, 4) + ' rad/s</p>';
        } else if (si.type === 'mo') {
          const comp = VV.data.byZ(si.companionZ);
          html += 'Two-center LCAO</h3>';
          html += '<p>Companion ' + esc(comp ? comp.sym : '?') + ' at R = ' +
                  VV.fmt.num(si.R, 3) + ' a₀ · signed overlap S = ' + VV.fmt.num(si.S, 4) +
                  ' · β = ' + VV.fmt.num(si.beta, 4) + ' eV</p>';
          if (si.bondType === 'nonbonding' || si.nonbonding) {
            html += '<p>Nonbonding by symmetry — zero overlap (S = 0); the orbitals do ' +
                    'not mix and each level stays localized on its own atom.</p>';
          } else {
            const b = si.bonding, a = si.antibonding;
            html += '<ul><li>bonding: E = ' + VV.fmt.num(b.E, 4) + ' eV, c<sub>A</sub> = ' +
                    VV.fmt.num(b.cA, 3) + ', c<sub>B</sub> = ' + VV.fmt.num(b.cB, 3) + '</li>' +
                    '<li>antibonding: E = ' + VV.fmt.num(a.E, 4) + ' eV, c<sub>A</sub> = ' +
                    VV.fmt.num(a.cA, 3) + ', c<sub>B</sub> = ' + VV.fmt.num(a.cB, 3) + '</li></ul>' +
                    '<p>Showing the <b>' + si.chosen + '</b> combination.</p>';
          }
        } else if (si.type === 'hybrid') {
          html += esc(si.kind) + ' hybrid</h3><p>Lobe ' + (si.index + 1) + ':</p><ul>';
          for (const c of (si.coeffs || [])) {
            html += '<li>' + esc(c.coeffLabel) + ' · ' + esc(c.orbKey) + '</li>';
          }
          html += '</ul>';
        } else if (si.type === 'cluster') {
          html += 'Hückel ' + esc(si.topology) + ', N = ' + si.nAtoms + '</h3>';
          html += '<p>Level k = ' + si.k + '. Levels (E − α)/β, in units of β: ' +
                  (si.energies || []).map(function (e, i) {
                    const s = VV.fmt.num(e, 4);
                    return i === si.k ? '<b>' + s + '</b>' : s;
                  }).join(', ') + '</p>';
        } else {
          html += '</h3>';
        }
        html += '<p class="ctl-note">First-order approximation — not ab-initio. ' +
                '<a href="theory.html#' +
                (si.type === 'field' ? 'zeeman' :
                 si.type === 'cluster' ? 'superstructure' : 'lcao') +
                '">Details</a></p>';
        spec.innerHTML = html;
      } else {
        spec.hidden = true;
        spec.innerHTML = '';
      }

      // links (composite deep-links the first selected key)
      const linkKey = composite
        ? ((model.keys && model.keys[0]) || '') : model.key;
      blocks['info-links'].innerHTML =
        '<a href="theory.html#radial">How this is derived →</a> ' +
        '<a href="verify.html' + (linkKey ? '#' + esc(el.sym) + '-' + esc(linkKey) : '') +
        '">Verify this orbital →</a>';
    },
  };
})();
