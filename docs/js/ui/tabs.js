/* Valence View — VV.ui.tabs: generic ARIA tablist widget.
 * Automatic activation: arrow keys move focus AND activate. External
 * select() updates the DOM without re-firing onChange (loop guard). */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  VV.ui.tabs = {
    // items: [{ id, label, panel }] — panel elements keep role="tabpanel"
    create: function (tablist, items, onChange) {
      const tabs = [];
      let currentId = null;

      for (const item of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'tab-' + item.id;
        btn.className = 'tab';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');
        btn.tabIndex = -1;
        btn.textContent = item.label;
        if (!item.panel.id) item.panel.id = 'panel-' + item.id;
        btn.setAttribute('aria-controls', item.panel.id);
        item.panel.setAttribute('aria-labelledby', btn.id);
        item.panel.tabIndex = 0;
        tablist.appendChild(btn);
        tabs.push({ id: item.id, btn: btn, panel: item.panel, hidden: false });
        btn.addEventListener('click', function () { activate(item.id, false); });
      }

      function find(id) {
        for (const t of tabs) if (t.id === id) return t;
        return null;
      }

      function applyDom(id) {
        currentId = id;
        for (const t of tabs) {
          const sel = t.id === id;
          t.btn.setAttribute('aria-selected', sel ? 'true' : 'false');
          t.btn.tabIndex = sel ? 0 : -1;
          t.panel.hidden = !sel;
        }
      }

      function activate(id, focus) {
        const t = find(id);
        if (!t || t.hidden) return;
        const was = currentId;
        applyDom(id);
        if (focus) t.btn.focus();
        if (was !== id && typeof onChange === 'function') onChange(id);
      }

      function visibleTabs() {
        return tabs.filter(function (t) { return !t.hidden; });
      }

      tablist.addEventListener('keydown', function (e) {
        const vis = visibleTabs();
        if (!vis.length) return;
        let idx = vis.findIndex(function (t) { return t.id === currentId; });
        if (idx < 0) idx = 0;
        let next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % vis.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + vis.length) % vis.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = vis.length - 1;
        if (next >= 0) {
          e.preventDefault();
          activate(vis[next].id, true);
        }
      });

      // initial: first visible tab active
      if (tabs.length) applyDom(tabs[0].id);

      return {
        // programmatic select — does NOT call onChange
        select: function (id) {
          const t = find(id);
          if (!t || t.hidden || currentId === id) return;
          applyDom(id);
        },
        setHidden: function (id, hidden) {
          const t = find(id);
          if (!t) return;
          t.hidden = !!hidden;
          t.btn.hidden = !!hidden;
          if (hidden && currentId === id) {
            const vis = visibleTabs();
            if (vis.length) applyDom(vis[0].id);
          }
        },
        current: function () { return currentId; },
      };
    },
  };
})();
