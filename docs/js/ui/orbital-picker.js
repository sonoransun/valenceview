/* Valence View — VV.ui.orbitalPicker: valence-orbital chips, one fieldset per
 * subshell. Real radio inputs give native keyboard/AT semantics. Occupied is
 * per SUBSHELL (contracts.md §2): count>0 subshells are occupied; count-0
 * subshells get .chip-empty (dashed). */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  const SUBSHELL = ['s', 'p', 'd', 'f'];

  // chip display order per subshell (p reads x,y,z; others by |m| with m=0 first)
  function mOrder(l) {
    if (l === 1) return [1, -1, 0];
    const ms = [0];
    for (let k = 1; k <= l; k++) { ms.push(k); ms.push(-k); }
    return ms;
  }

  const MAX_KEYS = 8; // composite selection cap (contract: 1..8 keys)

  let container = null;
  let builtZ = 0;
  let builtMulti = false;
  let chipRefs = [];      // [{key, input, label}] — avoids querySelector churn
  let toggleInput = null;

  function announce(msg) {
    const s = document.getElementById('sr-status');
    if (s) s.textContent = msg;
  }

  // inline component tint for a checked chip; components.css consumes the
  // custom property with tokens (color-mix against --bg-inset)
  function setTint(label, css) {
    if (label.style && typeof label.style.setProperty === 'function') {
      if (css) label.style.setProperty('--chip-tint', css);
      else label.style.removeProperty('--chip-tint');
    } else if (label.style) {
      label.style['--chip-tint'] = css || '';
    }
  }

  const CAT_FALLBACK = { css: '#9aa3b2' };
  function catCss(i) {
    const cat = VV.Cmap && VV.Cmap.CATEGORICAL;
    return ((cat && cat.length) ? cat[i % cat.length] : CAT_FALLBACK).css;
  }

  function orbitalsFor(z) {
    const out = [];
    const subshells = VV.data.valenceSubshells(z);
    for (const ss of subshells) {
      for (const m of mOrder(ss.l)) {
        const key = VV.hydro.orbitalKey(ss.n, ss.l, m);
        out.push({
          key: key, n: ss.n, l: ss.l, m: m,
          sub: SUBSHELL[ss.l],
          labelHTML: VV.hydro.orbitalLabelHTML(key),
          occupied: ss.count > 0,
          count: ss.count,
        });
      }
    }
    return out;
  }

  // highest-energy occupied subshell (Madelung: larger n+l fills later; tie
  // broken by larger n), m = 0 chip
  function defaultKey(z) {
    const subshells = VV.data.valenceSubshells(z);
    let best = null;
    for (const ss of subshells) {
      if (ss.count <= 0) continue;
      if (!best ||
          (ss.n + ss.l) > (best.n + best.l) ||
          ((ss.n + ss.l) === (best.n + best.l) && ss.n > best.n)) {
        best = ss;
      }
    }
    if (!best && subshells.length) best = subshells[0];
    return best ? VV.hydro.orbitalKey(best.n, best.l, 0) : null;
  }

  function onToggleMulti() {
    const cur = VV.store.get();
    if (toggleInput.checked) {
      VV.store.set({ multi: { enabled: true, keys: [cur.orbital] } }, 'picker');
      announce('Composite mode on — check up to ' + MAX_KEYS + ' orbitals to compare.');
    } else {
      // collapse to single mode on keys[0]
      const k0 = (cur.multi.keys && cur.multi.keys[0]) || cur.orbital;
      VV.store.set({ multi: { enabled: false }, orbital: k0 }, 'picker');
      announce('Composite mode off.');
    }
  }

  function onChipMulti(input, key) {
    const cur = VV.store.get();
    const keys = cur.multi.keys.slice();
    const at = keys.indexOf(key);
    if (input.checked) {
      if (at !== -1) return;
      if (keys.length >= MAX_KEYS) {
        input.checked = false;
        announce('Composite view is limited to ' + MAX_KEYS + ' orbitals.');
        return;
      }
      keys.push(key);
    } else {
      if (at === -1) return;
      if (keys.length <= 1) {
        input.checked = true;
        announce('At least one orbital must stay selected.');
        return;
      }
      keys.splice(at, 1);
    }
    VV.store.set({ multi: { keys: keys }, orbital: keys[0] }, 'picker');
  }

  function onSubshellAll(ssKeys) {
    const cur = VV.store.get();
    if (!cur.multi.enabled) return;
    const keys = cur.multi.keys.slice();
    let added = 0;
    let capped = false;
    for (const k of ssKeys) {
      if (keys.indexOf(k) !== -1) continue;
      if (keys.length >= MAX_KEYS) { capped = true; break; }
      keys.push(k);
      added++;
    }
    if (capped) {
      announce('Composite view is limited to ' + MAX_KEYS + ' orbitals — not all were added.');
    }
    if (added) VV.store.set({ multi: { keys: keys }, orbital: keys[0] }, 'picker');
  }

  function rebuild(z, multiOn) {
    builtZ = z;
    builtMulti = multiOn;
    chipRefs = [];
    container.textContent = '';
    const subshells = VV.data.valenceSubshells(z);
    const frag = document.createDocumentFragment();

    const head = document.createElement('div');
    head.className = 'picker-head';
    const heading = document.createElement('h2');
    heading.className = 'picker-heading';
    heading.textContent = 'Valence orbitals';
    head.appendChild(heading);
    const twrap = document.createElement('label');
    twrap.className = 'multi-toggle';
    toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.id = 'multi-toggle';
    toggleInput.checked = multiOn;
    toggleInput.addEventListener('change', onToggleMulti);
    const tspan = document.createElement('span');
    tspan.textContent = 'Compare multiple';
    twrap.appendChild(toggleInput);
    twrap.appendChild(tspan);
    head.appendChild(twrap);
    frag.appendChild(head);

    for (const ss of subshells) {
      const fs = document.createElement('fieldset');
      fs.className = 'subshell' + (ss.count > 0 ? '' : ' subshell-empty');
      const legend = document.createElement('legend');
      const occ = ss.count > 0 ? ss.count + ' e⁻' : 'empty';
      const ssName = ss.n + SUBSHELL[ss.l];
      legend.innerHTML = ssName +
        ' <span class="legend-occ">· ' + occ + '</span>';
      const ssKeys = mOrder(ss.l).map(function (m) {
        return VV.hydro.orbitalKey(ss.n, ss.l, m);
      });
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'subshell-all';
      allBtn.id = 'subshell-all-' + ssName;
      allBtn.textContent = 'all';
      allBtn.setAttribute('aria-label', 'Select all ' + ssName + ' orbitals');
      allBtn.hidden = !multiOn;
      allBtn.addEventListener('click', function () { onSubshellAll(ssKeys); });
      legend.appendChild(allBtn);
      fs.appendChild(legend);

      const wrap = document.createElement('div');
      wrap.className = 'chip-row';
      for (const key of ssKeys) {
        const label = document.createElement('label');
        label.className = 'chip' + (ss.count > 0 ? '' : ' chip-empty') +
          (multiOn ? ' chip-multi' : '');
        const input = document.createElement('input');
        input.type = multiOn ? 'checkbox' : 'radio';
        input.name = multiOn ? 'orbital-multi' : 'orbital';
        input.value = key;
        input.addEventListener('change', (function (inp, k) {
          return function () {
            if (multiOn) onChipMulti(inp, k);
            else if (inp.checked) VV.store.set({ orbital: k }, 'picker');
          };
        })(input, key));
        const span = document.createElement('span');
        span.innerHTML = VV.hydro.orbitalLabelHTML(key); // trusted, own layer
        label.appendChild(input);
        label.appendChild(span);
        wrap.appendChild(label);
        chipRefs.push({ key: key, input: input, label: label });
      }
      fs.appendChild(wrap);
      frag.appendChild(fs);
    }
    container.appendChild(frag);
  }

  function syncChecked(key) {
    for (const ref of chipRefs) {
      const on = ref.key === key;
      if (ref.input.checked !== on) ref.input.checked = on;
      ref.label.classList.toggle('checked', on);
      setTint(ref.label, null);
    }
  }

  function syncMulti(keys) {
    for (const ref of chipRefs) {
      const at = keys.indexOf(ref.key);
      const on = at !== -1;
      if (ref.input.checked !== on) ref.input.checked = on;
      ref.label.classList.toggle('checked', on);
      // component color = CATEGORICAL[position in keys] — matches the clouds
      setTint(ref.label, on ? catCss(at) : null);
    }
  }

  // drop keys `z` does not offer (dedupe, cap 8); empty -> [defaultKey]
  function coerceKeys(z, keys) {
    const offered = {};
    for (const o of orbitalsFor(z)) offered[o.key] = true;
    const out = [];
    for (const k of (keys || [])) {
      if (offered[k] && out.indexOf(k) === -1) out.push(k);
      if (out.length >= MAX_KEYS) break;
    }
    if (!out.length) {
      const dk = defaultKey(z);
      if (dk) out.push(dk);
    }
    return out;
  }

  VV.ui.orbitalPicker = {
    orbitalsFor: orbitalsFor,
    defaultKey: defaultKey,
    coerceKeys: coerceKeys,
    MAX_KEYS: MAX_KEYS,

    mount: function (el) {
      container = el;
    },

    // multi (state.multi) is optional: omitted -> single-select behavior
    update: function (z, selectedKey, multi) {
      if (!container) return;
      const multiOn = !!(multi && multi.enabled);
      if (z !== builtZ || multiOn !== builtMulti) rebuild(z, multiOn);
      if (toggleInput && toggleInput.checked !== multiOn) toggleInput.checked = multiOn;
      if (multiOn) syncMulti(multi.keys);
      else syncChecked(selectedKey);
    },
  };
})();
