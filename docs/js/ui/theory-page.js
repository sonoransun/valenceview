/* Valence View — theory.html driver: MathML support detection + scroll-spy
 * TOC. Nothing here is load-bearing: with JS disabled the page renders its
 * native MathML and a static TOC. The detector is deliberately duplicated
 * from ui/mathml.js so this page has no dependency on the app's UI layer. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  // Render an mfrac off-screen and compare its height against a plain span
  // in the same font: engines without MathML lay the "1 2" out inline at
  // single-line height, real MathML stacks them roughly twice as tall.
  function mathmlSupported() {
    if (!document.body) return true;
    let ok = true;
    try {
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:absolute;left:-9999px;top:0;visibility:hidden;font-size:16px;line-height:normal;';
      probe.innerHTML =
        '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math><span>1</span>';
      document.body.appendChild(probe);
      const mathH = probe.firstElementChild.getBoundingClientRect().height;
      const spanH = probe.lastElementChild.getBoundingClientRect().height;
      probe.remove();
      ok = mathH > spanH * 1.4;
    } catch (e) {
      ok = true; // fail open: keep native markup rather than hiding it
    }
    return ok;
  }

  function initScrollSpy() {
    const toc = document.getElementById('toc');
    if (!toc) return;
    const links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    const byId = {};
    const sections = [];
    for (const a of links) {
      const id = a.getAttribute('href').slice(1);
      const sec = document.getElementById(id);
      if (sec) { byId[id] = a; sections.push(sec); }
    }
    if (!sections.length) return;

    let activeId = null;
    function setActive(id) {
      if (id === activeId) return;
      if (activeId && byId[activeId]) {
        byId[activeId].classList.remove('active');
        byId[activeId].removeAttribute('aria-current');
      }
      activeId = id;
      if (id && byId[id]) {
        byId[id].classList.add('active');
        byId[id].setAttribute('aria-current', 'true');
      }
    }

    if (typeof IntersectionObserver === 'function') {
      // Track which sections currently intersect a band near the top of the
      // viewport; the earliest intersecting one wins.
      const visible = new Set();
      const io = new IntersectionObserver(function (entries) {
        for (const en of entries) {
          if (en.isIntersecting) visible.add(en.target.id);
          else visible.delete(en.target.id);
        }
        for (const sec of sections) {
          if (visible.has(sec.id)) { setActive(sec.id); return; }
        }
      }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });
      for (const sec of sections) io.observe(sec);
    } else {
      const onScroll = function () {
        const line = 120; // px below viewport top
        let current = sections[0].id;
        for (const sec of sections) {
          if (sec.getBoundingClientRect().top <= line) current = sec.id;
        }
        setActive(current);
      };
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  VV.ui.theoryPage = {
    init: function () {
      if (!mathmlSupported()) {
        document.documentElement.classList.add('no-mathml');
      }
      initScrollSpy();
    },
  };

  if (typeof document !== 'undefined' && document.getElementById('toc')) {
    VV.ui.theoryPage.init();
  }
})();
