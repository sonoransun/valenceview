/* Valence View — VV.ui.periodicTable: CSS-grid periodic table (role=grid,
 * roving tabindex, arrow/Home/End keys), plus the always-synced
 * #element-select mirror and the #common-strip quick row. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  const CATEGORY_LABEL = {
    'alkali': 'alkali metal',
    'alkaline': 'alkaline earth metal',
    'transition': 'transition metal',
    'post-transition': 'post-transition metal',
    'metalloid': 'metalloid',
    'nonmetal': 'nonmetal',
    'halogen': 'halogen',
    'noble': 'noble gas',
    'lanthanide': 'lanthanide',
    'actinide': 'actinide',
  };

  // grid rows: 1-7 periods, 8 spacer, 9 La-Lu, 10 Ac-Lr (cols 3-17)
  function gridPos(el) {
    if (el.group === 0) {
      const f6 = el.period === 6;
      return { row: f6 ? 9 : 10, col: 3 + (el.z - (f6 ? 57 : 89)) };
    }
    return { row: el.period, col: el.group };
  }

  let container = null;
  let selectEl = null;
  let stripEl = null;
  const cellByZ = {};       // z -> button
  const posMap = {};        // 'row:col' -> z
  const ROWS = [1, 2, 3, 4, 5, 6, 7, 9, 10];
  let selectedZ = 0;

  function setStore(z, source) {
    VV.store.set({ element: z }, source);
  }

  function buildCell(el) {
    const pos = gridPos(el);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pt-cell cat-' + el.category + (el.common ? ' common' : '');
    btn.setAttribute('role', 'gridcell');
    btn.setAttribute('data-z', String(el.z));
    btn.setAttribute('aria-label',
      el.name + ', ' + el.z + ', ' + (CATEGORY_LABEL[el.category] || el.category));
    btn.setAttribute('aria-rowindex', String(pos.row));
    btn.setAttribute('aria-colindex', String(pos.col));
    btn.style.gridRow = String(pos.row);
    btn.style.gridColumn = String(pos.col);
    btn.tabIndex = -1;
    btn.textContent = el.sym;
    btn.addEventListener('click', function () { setStore(el.z, 'ptable'); });
    posMap[pos.row + ':' + pos.col] = el.z;
    cellByZ[el.z] = btn;
    return btn;
  }

  function buildMarker(row, text) {
    const d = document.createElement('div');
    d.className = 'pt-marker';
    d.setAttribute('aria-hidden', 'true');
    d.style.gridRow = String(row);
    d.style.gridColumn = '3';
    d.textContent = text;
    posMap[row + ':3'] = 0; // non-navigable
    return d;
  }

  function rove(target) {
    for (const z in cellByZ) cellByZ[z].tabIndex = -1;
    if (target) target.tabIndex = 0;
  }

  function cellAt(row, col) {
    const z = posMap[row + ':' + col];
    return z ? cellByZ[z] : null;
  }

  function moveHoriz(row, col, dir) {
    for (let c = col + dir; c >= 1 && c <= 18; c += dir) {
      const cell = cellAt(row, c);
      if (cell) return cell;
    }
    return null;
  }

  function moveVert(row, col, dir) {
    let ri = ROWS.indexOf(row);
    while (true) {
      ri += dir;
      if (ri < 0 || ri >= ROWS.length) return null;
      const cell = cellAt(ROWS[ri], col);
      if (cell) return cell;
    }
  }

  function rowEnd(row, first) {
    if (first) {
      for (let c = 1; c <= 18; c++) { const cell = cellAt(row, c); if (cell) return cell; }
    } else {
      for (let c = 18; c >= 1; c--) { const cell = cellAt(row, c); if (cell) return cell; }
    }
    return null;
  }

  function onKeydown(e) {
    const t = e.target;
    if (!t.classList || !t.classList.contains('pt-cell')) return;
    const row = parseInt(t.getAttribute('aria-rowindex'), 10);
    const col = parseInt(t.getAttribute('aria-colindex'), 10);
    let next = null;
    switch (e.key) {
      case 'ArrowRight': next = moveHoriz(row, col, 1); break;
      case 'ArrowLeft': next = moveHoriz(row, col, -1); break;
      case 'ArrowDown': next = moveVert(row, col, 1); break;
      case 'ArrowUp': next = moveVert(row, col, -1); break;
      case 'Home': next = rowEnd(row, true); break;
      case 'End': next = rowEnd(row, false); break;
      default: return;
    }
    e.preventDefault();
    if (next) {
      rove(next);
      next.focus();
    }
  }

  function buildSelect() {
    selectEl = document.getElementById('element-select');
    if (!selectEl) return;
    for (const el of VV.data.ELEMENTS) {
      const opt = document.createElement('option');
      opt.value = String(el.z);
      opt.textContent = el.z + ' — ' + el.sym + ' ' + el.name;
      selectEl.appendChild(opt);
    }
    selectEl.addEventListener('change', function () {
      const z = parseInt(selectEl.value, 10);
      if (z >= 1 && z <= 118) setStore(z, 'select');
    });
  }

  function buildStrip() {
    stripEl = document.getElementById('common-strip');
    if (!stripEl) return;
    for (const z of VV.data.COMMON) {
      const el = VV.data.byZ(z);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs-btn cat-' + el.category;
      btn.setAttribute('data-z', String(z));
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', el.name);
      btn.innerHTML = '<b>' + el.sym + '</b><span>' + el.name + '</span>';
      btn.addEventListener('click', function () { setStore(z, 'strip'); });
      stripEl.appendChild(btn);
    }
  }

  VV.ui.periodicTable = {
    categoryLabel: function (cat) { return CATEGORY_LABEL[cat] || cat; },

    mount: function (el) {
      container = el;
      container.setAttribute('aria-rowcount', '10');
      container.setAttribute('aria-colcount', '18');
      const frag = document.createDocumentFragment();
      // role=grid requires role=row children; the rows are display:contents
      // (.pt-row) so cells still place themselves on the container's CSS grid
      const rowDivs = {};
      for (const r of [1, 2, 3, 4, 5, 6, 7, 9, 10]) {
        const d = document.createElement('div');
        d.setAttribute('role', 'row');
        d.setAttribute('aria-rowindex', String(r));
        d.className = 'pt-row';
        rowDivs[r] = d;
        frag.appendChild(d);
      }
      for (const e of VV.data.ELEMENTS) {
        const c = buildCell(e);
        const r = parseInt(c.getAttribute('aria-rowindex'), 10);
        (rowDivs[r] || frag).appendChild(c);
      }
      rowDivs[6].appendChild(buildMarker(6, '57–71'));
      rowDivs[7].appendChild(buildMarker(7, '89–103'));
      container.appendChild(frag);
      container.addEventListener('keydown', onKeydown);
      buildSelect();
      buildStrip();
    },

    update: function (state) {
      const z = state.element;
      if (z === selectedZ && cellByZ[z] && cellByZ[z].classList.contains('selected')) {
        return;
      }
      const prev = cellByZ[selectedZ];
      if (prev) {
        prev.classList.remove('selected');
        prev.setAttribute('aria-selected', 'false');
      }
      selectedZ = z;
      const cell = cellByZ[z];
      if (cell) {
        cell.classList.add('selected');
        cell.setAttribute('aria-selected', 'true');
        // roving tabindex: keep focus position if user is mid-navigation
        const act = document.activeElement;
        const inGrid = act && act.classList && act.classList.contains('pt-cell');
        rove(inGrid ? act : cell);
      }
      if (selectEl && selectEl.value !== String(z)) selectEl.value = String(z);
      if (stripEl) {
        const btns = stripEl.querySelectorAll('.cs-btn');
        for (const b of btns) {
          const on = b.getAttribute('data-z') === String(z);
          b.classList.toggle('selected', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      }
    },
  };
})();
