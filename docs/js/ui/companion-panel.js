/* Valence View — VV.ui.companionPanel: SPECULATIVE companion / super-structure
 * group. Modes: mo (two-center LCAO), hybrid (standalone sp/sp2/sp3 shapes),
 * cluster (Hückel chain/ring, N=3–6). Mutually exclusive with the field. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  let details = null;
  const dom = {};

  const LOBES = { sp: 2, sp2: 3, sp3: 4 };

  function hybridAvailable(z) {
    if (VV.lcao && typeof VV.lcao.hybridAvailable === 'function') {
      try {
        const kinds = VV.lcao.hybridAvailable(z);
        return Array.isArray(kinds) ? kinds.length > 0 : !!kinds;
      } catch (e) { /* fall through */ }
    }
    // needs same-n s and p orbitals in the valence shell => valence s with n >= 2
    const vs = VV.data.valenceSubshells(z);
    for (const ss of vs) {
      if (ss.l === 0 && ss.n >= 2) return true;
    }
    return false;
  }

  function setComp(patch, transient) {
    VV.store.set({ comp: patch }, 'comp-panel', transient ? { transient: true } : undefined);
  }

  function row(cls) {
    const d = document.createElement('div');
    d.className = 'ctl-row' + (cls ? ' ' + cls : '');
    return d;
  }

  function buildElementSelect() {
    const s = document.createElement('select');
    s.id = 'comp-element';
    const ogCommon = document.createElement('optgroup');
    ogCommon.label = 'Common';
    for (const z of VV.data.COMMON) {
      const el = VV.data.byZ(z);
      const o = document.createElement('option');
      o.value = String(z);
      o.textContent = el.sym + ' — ' + el.name;
      ogCommon.appendChild(o);
    }
    const ogAll = document.createElement('optgroup');
    ogAll.label = 'All elements';
    for (const el of VV.data.ELEMENTS) {
      const o = document.createElement('option');
      o.value = String(el.z);
      o.textContent = el.z + ' — ' + el.sym + ' ' + el.name;
      ogAll.appendChild(o);
    }
    s.appendChild(ogCommon);
    s.appendChild(ogAll);
    s.addEventListener('change', function () {
      setComp({ z: parseInt(s.value, 10) });
    });
    return s;
  }

  function rebuildIndexOptions(kind, selectedIndex) {
    const s = dom.hybridIndex;
    s.textContent = '';
    const n = LOBES[kind] || 2;
    for (let i = 0; i < n; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = 'Lobe ' + (i + 1) + ' of ' + n;
      s.appendChild(o);
    }
    s.value = String(Math.min(selectedIndex, n - 1));
  }

  function rebuildKOptions(nAtoms, selectedK, topology) {
    const s = dom.k;
    s.textContent = '';
    // ring levels peak at k = N/2 (even N); odd rings have no single highest level
    const highest = topology === 'ring'
      ? (nAtoms % 2 === 0 ? nAtoms / 2 : -1)
      : nAtoms - 1;
    for (let i = 0; i < nAtoms; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = 'k = ' + i + (i === 0 ? ' (lowest)' : i === highest ? ' (highest)' : '');
      s.appendChild(o);
    }
    s.value = String(Math.min(selectedK, nAtoms - 1));
  }

  VV.ui.companionPanel = {
    hybridAvailable: hybridAvailable,

    mount: function (group) {
      details = group;
      const body = group.querySelector('.ctl-body') || group;

      // enable
      const enRow = row('ctl-check');
      const en = document.createElement('input');
      en.type = 'checkbox';
      en.id = 'comp-enable';
      en.addEventListener('change', function () {
        setComp({ enabled: en.checked });
      });
      const enLab = document.createElement('label');
      enLab.setAttribute('for', 'comp-enable');
      enLab.textContent = 'Enable companion / super structure';
      enRow.appendChild(en);
      enRow.appendChild(enLab);
      dom.enable = en;
      body.appendChild(enRow);

      // mode radios
      const modeRow = row();
      const modeLabel = document.createElement('span');
      modeLabel.className = 'ctl-label';
      modeLabel.id = 'comp-mode-label';
      modeLabel.textContent = 'Mode';
      modeRow.appendChild(modeLabel);
      const radioWrap = document.createElement('div');
      radioWrap.className = 'radio-row';
      radioWrap.setAttribute('role', 'radiogroup');
      radioWrap.setAttribute('aria-labelledby', 'comp-mode-label');
      for (const opt of [['mo', 'Diatomic MO'], ['hybrid', 'Hybrids'], ['cluster', 'Cluster']]) {
        const lab = document.createElement('label');
        lab.className = 'radio-chip';
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'comp-mode';
        inp.id = 'comp-mode-' + opt[0];
        inp.value = opt[0];
        inp.addEventListener('change', function () {
          if (inp.checked) setComp({ mode: opt[0] });
        });
        const sp = document.createElement('span');
        sp.textContent = opt[1];
        lab.appendChild(inp);
        lab.appendChild(sp);
        radioWrap.appendChild(lab);
        dom['mode-' + opt[0]] = inp;
        dom['modeLab-' + opt[0]] = lab;
      }
      modeRow.appendChild(radioWrap);
      body.appendChild(modeRow);

      // --- mo section ---
      const mo = document.createElement('div');
      mo.className = 'sub-group';
      mo.id = 'comp-sec-mo';

      const elRow = row();
      const elLab = document.createElement('label');
      elLab.setAttribute('for', 'comp-element');
      elLab.textContent = 'Companion';
      elRow.appendChild(elLab);
      dom.element = buildElementSelect();
      elRow.appendChild(dom.element);
      mo.appendChild(elRow);

      const dRow = row();
      const dLab = document.createElement('label');
      dLab.setAttribute('for', 'comp-dist');
      dLab.textContent = 'Distance';
      const dist = document.createElement('input');
      dist.type = 'range';
      dist.id = 'comp-dist';
      dist.min = '0.5';
      dist.max = '10';
      dist.step = '0.1';
      dist.addEventListener('input', function () {
        setComp({ dist: parseFloat(dist.value) }, true);
      });
      dist.addEventListener('change', function () {
        setComp({ dist: parseFloat(dist.value) });
      });
      const dOut = document.createElement('output');
      dOut.id = 'comp-dist-out';
      dOut.setAttribute('for', 'comp-dist');
      dRow.appendChild(dLab);
      dRow.appendChild(dist);
      dRow.appendChild(dOut);
      dom.dist = dist;
      dom.distOut = dOut;
      mo.appendChild(dRow);

      const cRow = row();
      const cLabel = document.createElement('span');
      cLabel.className = 'ctl-label';
      cLabel.id = 'comp-combo-label';
      cLabel.textContent = 'Combination';
      cRow.appendChild(cLabel);
      const comboWrap = document.createElement('div');
      comboWrap.id = 'comp-combo';
      comboWrap.className = 'radio-row';
      comboWrap.setAttribute('role', 'radiogroup');
      comboWrap.setAttribute('aria-labelledby', 'comp-combo-label');
      for (const opt of [['bonding', 'Bonding'], ['antibonding', 'Antibonding']]) {
        const lab = document.createElement('label');
        lab.className = 'radio-chip';
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'comp-combo';
        inp.id = 'comp-combo-' + opt[0];
        inp.value = opt[0];
        inp.addEventListener('change', function () {
          if (inp.checked) setComp({ combo: opt[0] });
        });
        const sp = document.createElement('span');
        sp.textContent = opt[1];
        lab.appendChild(inp);
        lab.appendChild(sp);
        comboWrap.appendChild(lab);
        dom['combo-' + opt[0]] = inp;
      }
      cRow.appendChild(comboWrap);
      mo.appendChild(cRow);
      dom.secMo = mo;
      body.appendChild(mo);

      // --- hybrid section ---
      const hy = document.createElement('div');
      hy.className = 'sub-group';
      hy.id = 'comp-sec-hybrid';

      const hRow = row();
      const hLab = document.createElement('label');
      hLab.setAttribute('for', 'comp-hybrid');
      hLab.textContent = 'Hybrid';
      const hSel = document.createElement('select');
      hSel.id = 'comp-hybrid';
      for (const k of ['sp', 'sp2', 'sp3']) {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = k === 'sp' ? 'sp' : (k === 'sp2' ? 'sp²' : 'sp³');
        hSel.appendChild(o);
      }
      hSel.addEventListener('change', function () {
        setComp({ hybrid: hSel.value, hybridIndex: 0 });
      });
      hRow.appendChild(hLab);
      hRow.appendChild(hSel);
      dom.hybrid = hSel;
      hy.appendChild(hRow);

      const iRow = row();
      const iLab = document.createElement('label');
      iLab.setAttribute('for', 'comp-hybrid-index');
      iLab.textContent = 'Lobe';
      const iSel = document.createElement('select');
      iSel.id = 'comp-hybrid-index';
      iSel.addEventListener('change', function () {
        setComp({ hybridIndex: parseInt(iSel.value, 10) });
      });
      iRow.appendChild(iLab);
      iRow.appendChild(iSel);
      dom.hybridIndex = iSel;
      hy.appendChild(iRow);

      const hNote = document.createElement('p');
      hNote.className = 'ctl-note';
      hNote.id = 'comp-hybrid-note';
      hNote.textContent = 'Hybrids need same-shell s and p orbitals (not available for H or He).';
      hNote.hidden = true;
      hy.appendChild(hNote);
      dom.hybridNote = hNote;
      dom.secHybrid = hy;
      body.appendChild(hy);

      // --- cluster section ---
      const cl = document.createElement('div');
      cl.className = 'sub-group';
      cl.id = 'comp-sec-cluster';

      const tRow = row();
      const tLab = document.createElement('label');
      tLab.setAttribute('for', 'comp-topology');
      tLab.textContent = 'Topology';
      const tSel = document.createElement('select');
      tSel.id = 'comp-topology';
      for (const t of [['chain', 'Chain'], ['ring', 'Ring']]) {
        const o = document.createElement('option');
        o.value = t[0];
        o.textContent = t[1];
        tSel.appendChild(o);
      }
      tSel.addEventListener('change', function () {
        setComp({ topology: tSel.value });
      });
      tRow.appendChild(tLab);
      tRow.appendChild(tSel);
      dom.topology = tSel;
      cl.appendChild(tRow);

      const nRow = row();
      const nLab = document.createElement('label');
      nLab.setAttribute('for', 'comp-natoms');
      nLab.textContent = 'Atoms (N)';
      const nSel = document.createElement('select');
      nSel.id = 'comp-natoms';
      for (let n = 3; n <= 6; n++) {
        const o = document.createElement('option');
        o.value = String(n);
        o.textContent = String(n);
        nSel.appendChild(o);
      }
      nSel.addEventListener('change', function () {
        const n = parseInt(nSel.value, 10);
        const st = VV.store.get();
        setComp({ nAtoms: n, k: Math.min(st.comp.k, n - 1) });
      });
      nRow.appendChild(nLab);
      nRow.appendChild(nSel);
      dom.nAtoms = nSel;
      cl.appendChild(nRow);

      const kRow = row();
      const kLab = document.createElement('label');
      kLab.setAttribute('for', 'comp-k');
      kLab.textContent = 'Level';
      const kSel = document.createElement('select');
      kSel.id = 'comp-k';
      kSel.addEventListener('change', function () {
        setComp({ k: parseInt(kSel.value, 10) });
      });
      kRow.appendChild(kLab);
      kRow.appendChild(kSel);
      dom.k = kSel;
      cl.appendChild(kRow);
      dom.secCluster = cl;
      body.appendChild(cl);

      const note = document.createElement('p');
      note.className = 'ctl-note';
      note.textContent = 'Frozen-orbital LCAO / Hückel — shapes are meaningful, energies indicative.';
      body.appendChild(note);

      const readout = document.createElement('div');
      readout.id = 'comp-readout';
      readout.className = 'readout-block';
      dom.readout = readout;
      body.appendChild(readout);
    },

    update: function (state) {
      const c = state.comp;
      dom.enable.checked = c.enabled;
      dom['mode-mo'].checked = c.mode === 'mo';
      dom['mode-hybrid'].checked = c.mode === 'hybrid';
      dom['mode-cluster'].checked = c.mode === 'cluster';

      dom.secMo.hidden = c.mode !== 'mo';
      dom.secHybrid.hidden = c.mode !== 'hybrid';
      dom.secCluster.hidden = c.mode !== 'cluster';

      dom.element.value = String(c.z);
      if (document.activeElement !== dom.dist) dom.dist.value = String(c.dist);
      dom.distOut.textContent = c.dist.toFixed(1) + ' a₀';
      dom['combo-bonding'].checked = c.combo === 'bonding';
      dom['combo-antibonding'].checked = c.combo === 'antibonding';

      const hOK = hybridAvailable(state.element);
      dom['mode-hybrid'].disabled = !hOK;
      dom['modeLab-hybrid'].classList.toggle('is-disabled', !hOK);
      dom['modeLab-hybrid'].title = hOK ? '' :
        'This element has no same-shell s+p valence orbitals to hybridize.';
      dom.hybridNote.hidden = hOK;
      dom.hybrid.value = c.hybrid;
      rebuildIndexOptions(c.hybrid, c.hybridIndex);

      dom.topology.value = c.topology;
      dom.nAtoms.value = String(c.nAtoms);
      rebuildKOptions(c.nAtoms, c.k, c.topology);

      const locked = state.field.enabled;
      if (locked) {
        details.setAttribute('data-locked', '');
        details.title = 'Disabled while the magnetic field is on — enabling the companion turns the field off.';
      } else {
        details.removeAttribute('data-locked');
        details.removeAttribute('title');
      }
      if (!c.enabled) dom.readout.textContent = '';
    },

    render: function (model) {
      const si = model && model.specInfo;
      if (!si || (si.type !== 'mo' && si.type !== 'cluster')) {
        dom.readout.textContent = '';
        return;
      }
      if (si.type === 'mo') {
        if (si.bondType === 'nonbonding' || si.nonbonding) {
          dom.readout.innerHTML =
            '<span class="readout-label">Two-center MO</span>' +
            '<span class="readout-val">nonbonding (S = 0) — orbitals do not mix</span>';
          return;
        }
        dom.readout.innerHTML =
          '<span class="readout-label">Two-center MO</span>' +
          '<span class="readout-val">S = ' + VV.fmt.num(si.S, 4) +
          ' · β = ' + VV.fmt.num(si.beta, 4) + ' eV</span>' +
          '<span class="readout-val">E<sub>bond</sub> = ' + VV.fmt.num(si.bonding.E, 4) +
          ' eV · E<sub>anti</sub> = ' + VV.fmt.num(si.antibonding.E, 4) + ' eV</span>';
      } else {
        const es = (si.energies || []).map(function (e, i) {
          const s = VV.fmt.num(e, 4);
          return i === si.k ? '<b>' + s + '</b>' : s;
        }).join(', ');
        dom.readout.innerHTML =
          '<span class="readout-label">Hückel levels (units of β)</span>' +
          '<span class="readout-val">' + es + '</span>';
      }
    },
  };
})();
