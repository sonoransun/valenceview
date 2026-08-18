/* Valence View — VV.ui.fieldPanel: SPECULATIVE magnetic-field group.
 * log-B slider (-1..5 => 0.1 T..100 kT), Zeeman ΔE and Larmor readouts
 * from model.specInfo. Mutually exclusive with the companion panel. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  let details = null;
  const dom = {};

  function fmtB(logB) {
    const B = Math.pow(10, logB);
    return B >= 1000
      ? VV.fmt.num(B / 1000, 3) + ' kT'
      : VV.fmt.num(B, 3) + ' T';
  }

  function fmtTime(s) {
    if (!isFinite(s) || s <= 0) return '—';
    const units = [['s', 1], ['ms', 1e-3], ['µs', 1e-6], ['ns', 1e-9], ['ps', 1e-12], ['fs', 1e-15]];
    for (const u of units) {
      if (s >= u[1]) return VV.fmt.num(s / u[1], 3) + ' ' + u[0];
    }
    return VV.fmt.sci(s, 3) + ' s';
  }

  VV.ui.fieldPanel = {
    mount: function (group) {
      details = group;
      const body = group.querySelector('.ctl-body') || group;

      const enRow = document.createElement('div');
      enRow.className = 'ctl-row ctl-check';
      const en = document.createElement('input');
      en.type = 'checkbox';
      en.id = 'field-enable';
      en.addEventListener('change', function () {
        VV.store.set({ field: { enabled: en.checked } }, 'field-panel');
      });
      const enLab = document.createElement('label');
      enLab.setAttribute('for', 'field-enable');
      enLab.textContent = 'Enable magnetic field';
      enRow.appendChild(en);
      enRow.appendChild(enLab);
      dom.enable = en;
      body.appendChild(enRow);

      const bRow = document.createElement('div');
      bRow.className = 'ctl-row';
      const bLab = document.createElement('label');
      bLab.setAttribute('for', 'field-b');
      bLab.textContent = 'Strength';
      const b = document.createElement('input');
      b.type = 'range';
      b.id = 'field-b';
      b.min = '-1';
      b.max = '5';
      b.step = '0.05';
      b.addEventListener('input', function () {
        VV.store.set({ field: { logB: parseFloat(b.value) } }, 'field-panel', { transient: true });
      });
      b.addEventListener('change', function () {
        VV.store.set({ field: { logB: parseFloat(b.value) } }, 'field-panel');
      });
      const bOut = document.createElement('output');
      bOut.id = 'field-b-out';
      bOut.setAttribute('for', 'field-b');
      bRow.appendChild(bLab);
      bRow.appendChild(b);
      bRow.appendChild(bOut);
      dom.b = b;
      dom.bOut = bOut;
      body.appendChild(bRow);

      const note = document.createElement('p');
      note.className = 'ctl-note';
      note.textContent = 'Field is along +z. Orbital Zeeman only — no spin, no spin–orbit.';
      body.appendChild(note);

      const split = document.createElement('div');
      split.id = 'field-split';
      split.className = 'readout-block';
      const larmor = document.createElement('div');
      larmor.id = 'field-larmor';
      larmor.className = 'readout-block';
      dom.split = split;
      dom.larmor = larmor;
      body.appendChild(split);
      body.appendChild(larmor);
    },

    update: function (state) {
      const f = state.field;
      dom.enable.checked = f.enabled;
      if (document.activeElement !== dom.b) dom.b.value = String(f.logB);
      dom.b.disabled = !f.enabled;
      dom.bOut.textContent = 'B = ' + fmtB(f.logB) + ' along +z';
      const locked = state.comp.enabled;
      if (locked) {
        details.setAttribute('data-locked', '');
        details.title = 'Disabled while companion mode is on — enabling the field turns the companion off.';
      } else {
        details.removeAttribute('data-locked');
        details.removeAttribute('title');
      }
      if (!f.enabled) {
        dom.split.textContent = '';
        dom.larmor.textContent = '';
      }
    },

    render: function (model) {
      const si = model && model.specInfo;
      if (!si || si.type !== 'field') {
        dom.split.textContent = '';
        dom.larmor.textContent = '';
        return;
      }
      let html = '<span class="readout-label">Zeeman shifts ΔE(m)</span>';
      const shifts = si.shifts || [];
      const parts = [];
      for (const s of shifts) {
        parts.push('m=' + (s.m > 0 ? '+' : '') + s.m + ': ' +
          (s.dEeV === 0 ? '0' : VV.fmt.sci(s.dEeV, 3)) + ' eV');
      }
      html += '<span class="readout-val">' + parts.join(' · ') + '</span>';
      if (typeof si.squeeze === 'number' && si.squeeze < 0.9995) {
        html += '<span class="readout-val">squeeze s⊥ = ' + VV.fmt.num(si.squeeze, 3) + '</span>';
      }
      dom.split.innerHTML = html;
      dom.larmor.innerHTML =
        '<span class="readout-label">Larmor precession</span>' +
        '<span class="readout-val">ω<sub>L</sub> = ' + VV.fmt.sci(si.omegaLarmor, 3) +
        ' rad/s · period ' + fmtTime(si.larmorPeriodS) +
        ' <em>(animation speed not to scale)</em></span>';
    },
  };
})();
