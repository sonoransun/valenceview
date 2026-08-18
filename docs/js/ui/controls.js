/* Valence View — VV.ui.controls: View + Animation control groups, plus the
 * 2D plot-bar selects (#plot2d-mode / #plot2d-plane). Slider 'input' events
 * write transient state; 'change' commits. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  let viewBody = null;
  let animBody = null;
  const dom = {};

  function row(cls) {
    const d = document.createElement('div');
    d.className = 'ctl-row' + (cls ? ' ' + cls : '');
    return d;
  }

  function labelFor(id, text) {
    const l = document.createElement('label');
    l.setAttribute('for', id);
    l.textContent = text;
    return l;
  }

  function select(id, options, onChange) {
    const s = document.createElement('select');
    s.id = id;
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o[0];
      opt.textContent = o[1];
      s.appendChild(opt);
    }
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  function checkbox(id, text, onChange) {
    const wrap = row('ctl-check');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.id = id;
    c.addEventListener('change', function () { onChange(c.checked); });
    wrap.appendChild(c);
    wrap.appendChild(labelFor(id, text));
    dom[id] = c;
    return wrap;
  }

  function range(id, min, max, step, commit) {
    const r = document.createElement('input');
    r.type = 'range';
    r.id = id;
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    r.addEventListener('input', function () { commit(parseFloat(r.value), true); });
    r.addEventListener('change', function () { commit(parseFloat(r.value), false); });
    dom[id] = r;
    return r;
  }

  function setViz(patch, transient) {
    VV.store.set({ viz: patch }, 'controls', transient ? { transient: true } : undefined);
  }

  function buildView() {
    // view mode radios
    const modeRow = row();
    const modeLegend = document.createElement('span');
    modeLegend.className = 'ctl-label';
    modeLegend.id = 'view-mode-label';
    modeLegend.textContent = 'Mode';
    modeRow.appendChild(modeLegend);
    const modeWrap = document.createElement('div');
    modeWrap.id = 'view-mode';
    modeWrap.className = 'radio-row';
    modeWrap.setAttribute('role', 'radiogroup');
    modeWrap.setAttribute('aria-labelledby', 'view-mode-label');
    for (const opt of [['points', 'Points'], ['iso', 'Isosurface']]) {
      const lab = document.createElement('label');
      lab.className = 'radio-chip';
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'view-mode';
      inp.id = 'view-mode-' + opt[0];
      inp.value = opt[0];
      inp.addEventListener('change', function () {
        if (inp.checked) setViz({ mode: opt[0] });
      });
      const sp = document.createElement('span');
      sp.textContent = opt[1];
      lab.appendChild(inp);
      lab.appendChild(sp);
      modeWrap.appendChild(lab);
      dom['view-mode-' + opt[0]] = inp;
    }
    modeRow.appendChild(modeWrap);
    viewBody.appendChild(modeRow);

    // color mode
    const colorRow = row();
    colorRow.appendChild(labelFor('color-mode', 'Color'));
    const colorSel = select('color-mode', [
      ['sign', 'Sign (± lobes)'],
      ['phase', 'Phase (complex)'],
    ], function (v) { setViz({ colorMode: v }); });
    colorRow.appendChild(colorSel);
    dom['color-mode'] = colorSel;
    viewBody.appendChild(colorRow);

    // quality
    const qRow = row();
    qRow.appendChild(labelFor('quality', 'Quality'));
    const qSel = select('quality', [
      ['low', 'Low (30k pts)'],
      ['med', 'Medium (80k pts)'],
      ['high', 'High (200k pts)'],
    ], function (v) { setViz({ quality: v }); });
    qRow.appendChild(qSel);
    dom['quality'] = qSel;
    viewBody.appendChild(qRow);

    viewBody.appendChild(checkbox('show-axes', 'Show axes', function (v) {
      setViz({ showAxes: v });
    }));
    viewBody.appendChild(checkbox('show-nucleus', 'Show nucleus', function (v) {
      setViz({ showNucleus: v });
    }));

    // isosurface sub-group
    const isoGroup = document.createElement('div');
    isoGroup.id = 'iso-group';
    isoGroup.className = 'sub-group';

    const isoModeRow = row();
    isoModeRow.appendChild(labelFor('iso-mode', 'Iso value'));
    const isoModeSel = select('iso-mode', [
      ['prob', 'Encloses probability'],
      ['max', 'Fraction of max'],
    ], function (v) { setViz({ isoMode: v }); });
    isoModeRow.appendChild(isoModeSel);
    dom['iso-mode'] = isoModeSel;
    isoGroup.appendChild(isoModeRow);

    const fracRow = row();
    fracRow.id = 'iso-frac-row';
    fracRow.appendChild(labelFor('iso-frac', 'Probability'));
    fracRow.appendChild(range('iso-frac', 0.5, 0.99, 0.01, function (v, t) {
      setViz({ isoFrac: v }, t);
    }));
    const fracOut = document.createElement('output');
    fracOut.id = 'iso-frac-out';
    fracOut.setAttribute('for', 'iso-frac');
    fracRow.appendChild(fracOut);
    dom['iso-frac-out'] = fracOut;
    isoGroup.appendChild(fracRow);

    const kRow = row();
    kRow.id = 'iso-k-row';
    kRow.appendChild(labelFor('iso-k', 'Fraction of max'));
    kRow.appendChild(range('iso-k', 0.02, 0.5, 0.01, function (v, t) {
      setViz({ isoK: v }, t);
    }));
    const kOut = document.createElement('output');
    kOut.id = 'iso-k-out';
    kOut.setAttribute('for', 'iso-k');
    kRow.appendChild(kOut);
    dom['iso-k-out'] = kOut;
    isoGroup.appendChild(kRow);

    isoGroup.appendChild(checkbox('iso-transparent', 'Transparent lobes (approximate)',
      function (v) { setViz({ transparent: v }); }));

    dom['iso-group'] = isoGroup;
    viewBody.appendChild(isoGroup);
  }

  function buildAnim() {
    const togRow = row();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'anim-toggle';
    // name-swapping button (Pause/Play): no aria-pressed — a toggle would
    // make the swapped name contradict the pressed state for screen readers
    btn.textContent = 'Pause';
    btn.addEventListener('click', function () {
      const st = VV.store.get();
      VV.store.set({ anim: { playing: !st.anim.playing } }, 'controls');
    });
    dom['anim-toggle'] = btn;
    togRow.appendChild(btn);
    animBody.appendChild(togRow);

    const spRow = row();
    spRow.appendChild(labelFor('anim-speed', 'Speed'));
    spRow.appendChild(range('anim-speed', 0.1, 3, 0.1, function (v, t) {
      VV.store.set({ anim: { speed: v } }, 'controls', t ? { transient: true } : undefined);
    }));
    const out = document.createElement('output');
    out.id = 'anim-speed-out';
    out.setAttribute('for', 'anim-speed');
    spRow.appendChild(out);
    dom['anim-speed-out'] = out;
    animBody.appendChild(spRow);
  }

  function wirePlotBar() {
    const mode = document.getElementById('plot2d-mode');
    const plane = document.getElementById('plot2d-plane');
    dom['plot2d-mode'] = mode;
    dom['plot2d-plane'] = plane;
    if (mode) {
      mode.addEventListener('change', function () { setViz({ plot2d: mode.value }); });
    }
    if (plane) {
      plane.addEventListener('change', function () { setViz({ plane: plane.value }); });
    }
  }

  VV.ui.controls = {
    mount: function (viewGroup, animGroup) {
      viewBody = viewGroup.querySelector('.ctl-body') || viewGroup;
      animBody = animGroup.querySelector('.ctl-body') || animGroup;
      buildView();
      buildAnim();
      wirePlotBar();
    },

    update: function (state) {
      const v = state.viz;
      if (dom['view-mode-points']) {
        dom['view-mode-points'].checked = v.mode === 'points';
        dom['view-mode-iso'].checked = v.mode === 'iso';
      }
      if (dom['color-mode']) {
        dom['color-mode'].value = v.colorMode;
        const multiOn = !!(state.multi && state.multi.enabled);
        dom['color-mode'].disabled = multiOn;
        dom['color-mode'].title = multiOn
          ? 'Composite view colors each orbital individually' : '';
      }
      if (dom['quality']) dom['quality'].value = v.quality;
      if (dom['show-axes']) dom['show-axes'].checked = v.showAxes;
      if (dom['show-nucleus']) dom['show-nucleus'].checked = v.showNucleus;

      if (dom['iso-group']) {
        dom['iso-group'].hidden = v.mode !== 'iso';
        document.getElementById('iso-frac-row').hidden = v.isoMode !== 'prob';
        document.getElementById('iso-k-row').hidden = v.isoMode !== 'max';
        dom['iso-mode'].value = v.isoMode;
        if (document.activeElement !== dom['iso-frac']) dom['iso-frac'].value = String(v.isoFrac);
        if (document.activeElement !== dom['iso-k']) dom['iso-k'].value = String(v.isoK);
        dom['iso-frac-out'].textContent = Math.round(v.isoFrac * 100) + '%';
        dom['iso-k-out'].textContent = Math.round(v.isoK * 100) + '%';
        dom['iso-transparent'].checked = v.transparent;
      }

      if (dom['anim-toggle']) {
        dom['anim-toggle'].textContent = state.anim.playing ? 'Pause' : 'Play';
      }
      if (dom['anim-speed']) {
        if (document.activeElement !== dom['anim-speed']) {
          dom['anim-speed'].value = String(state.anim.speed);
        }
        dom['anim-speed-out'].textContent = state.anim.speed.toFixed(1) + '×';
      }

      if (dom['plot2d-mode']) dom['plot2d-mode'].value = v.plot2d;
      if (dom['plot2d-plane']) {
        dom['plot2d-plane'].value = v.plane;
        dom['plot2d-plane'].hidden = v.plot2d !== 'slice';
        const pl = document.querySelector('label[for=plot2d-plane]');
        if (pl) pl.hidden = v.plot2d !== 'slice';
      }
    },
  };
})();
