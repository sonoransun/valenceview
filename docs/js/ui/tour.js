/* Valence View — VV.ui.tour: auto-starting guided tour of chemically
 * meaningful orbitals. A floating NON-modal card (no backdrop, no focus trap)
 * steps through curated stops; every stop applies a TOTAL deterministic patch
 * for element/orbital/viz/anim/field/comp/multi, so stops render identically
 * regardless of what the user did in between. viz.quality is read from the
 * live state when the tour starts and reused — the tour never forces it.
 * The app stays fully interactive during the tour. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  const DONE_KEY = 'vv-tour-done';

  /* Stop copy + per-stop state overrides. `patch` is (re)assembled by every
   * start() call via buildPatch (captures the live quality tier). */
  const STOPS = [
    {
      id: 'h1s', element: 1, orbital: '1s',
      title: 'The simplest atom',
      body: 'Hydrogen\'s lone electron lives in the 1s orbital — a spherical probability cloud with no nodes. Brighter means more likely: the cloud has no edge, only fading probability. For hydrogen the most probable radius is exactly the Bohr radius, a₀.',
    },
    {
      id: 'c2p', element: 6, orbital: '2p_z',
      title: 'Directional bonds',
      body: 'Carbon\'s 2p orbitals point along axes, with a nodal plane through the nucleus where the electron is never found. The two colors are the wavefunction\'s opposite signs — its phase. Three perpendicular p orbitals are the geometric seed of organic chemistry.',
    },
    {
      id: 'na3s', element: 11, orbital: '3s',
      viz: { tab: '2d', plot2d: 'radial' },
      title: 'Shells within shells',
      body: 'Sodium\'s valence 3s electron has two radial nodes — spheres where the probability drops to zero. The r²R² curve shows most of its probability far outside the neon-like core: weakly bound and far out, which is why sodium so readily gives this electron away to become Na⁺.',
    },
    {
      id: 'o2p', element: 8, orbital: '2p_x',
      multi: { enabled: true, keys: ['2p_x', '2p_y', '2p_z'] },
      title: 'Oxygen\'s p trio',
      body: 'All three of oxygen\'s 2p orbitals at once, each in its own color — mutually perpendicular. These are the raw ingredients for water\'s two O–H bonds and two lone pairs; their mutual geometry is the starting point for water\'s bent shape.',
    },
    {
      id: 'fe3d', element: 26, orbital: '3d_z2',
      viz: { mode: 'iso' },
      title: 'The d orbitals',
      body: 'Transition metals owe their chemistry to d orbitals like iron\'s 3d<sub>z²</sub> — two lobes threaded through a ring. How these shapes point at surrounding ligands sets the splitting patterns behind catalysis and the colors of coordination compounds.',
    },
    {
      id: 'unsold', element: 26, orbital: '3d_z2',
      multi: { enabled: true, keys: ['3d_z2', '3d_xz', '3d_yz', '3d_x2y2', '3d_xy'] },
      viz: { mode: 'iso' },
      title: 'A full subshell is a sphere',
      body: 'Add up the densities of all five d orbitals and every bump cancels: the sum is perfectly spherical (Unsöld\'s theorem — this site verifies it numerically in the <a href="verify.html">check suite</a>). Filled shells have no directional preference; chemistry lives in the partly filled ones.',
    },
    {
      id: 'sp3', element: 6, orbital: '2p_z',
      comp: { enabled: true, mode: 'hybrid', hybrid: 'sp3', hybridIndex: 0 },
      title: 'Carbon\'s tetrahedral trick',
      body: 'Mix one 2s with three 2p orbitals and you get four equivalent sp³ hybrids pointing at the corners of a tetrahedron — the 109.5° geometry of methane and of every sp³ carbon in organic chemistry. (A modeled construction — see the Speculative badge.)',
    },
    {
      id: 'bond', element: 1, orbital: '1s',
      comp: { enabled: true, mode: 'mo', z: 1, dist: 1.4, combo: 'bonding' },
      title: 'The covalent bond',
      body: 'Bring two hydrogens to 1.4 a₀ — H₂\'s bond length — and their 1s orbitals can add in phase. Density piles up between the nuclei and the energy drops below that of two separate atoms: the bonding σ orbital, chemistry\'s simplest bond.',
    },
    {
      id: 'antibond', element: 1, orbital: '1s',
      comp: { enabled: true, mode: 'mo', z: 1, dist: 1.4, combo: 'antibonding' },
      title: 'Antibonding',
      body: 'Add the same orbitals out of phase and a node appears between the nuclei — the antibonding σ* orbital, higher in energy. Fill both σ and σ*, as a helium pair would, and the bond is undone: that is why helium stays atomic.',
    },
    {
      id: 'ring', element: 6, orbital: '2p_z',
      comp: { enabled: true, mode: 'cluster', z: 6, topology: 'ring', nAtoms: 6, k: 0, dist: 2.6 },
      title: 'Sharing electrons in a ring',
      body: 'Six identical orbitals on a ring combine into states spread across all six atoms at once. This lowest, node-free combination is the Hückel picture behind benzene\'s π system and aromatic stability. (A deliberately simplified model — see Speculative.)',
    },
    {
      id: 'field', element: 26, orbital: '3d_xz',
      field: { enabled: true, logB: 1 },
      title: 'Orbitals in a magnetic field',
      body: 'In a strong field the m-levels split (Zeeman effect) and orbitals precess about the field axis at the Larmor frequency — shown here far slower than reality. A speculative, first-order picture; the readouts on the right give the real numbers.',
    },
    {
      id: 'explore', element: 6, orbital: '2p_z',
      title: 'Explore',
      body: 'Everything here is computed live from the exact hydrogenic mathematics — no images, no lookup tables. Read the derivations on the <a href="theory.html">Theory</a> page, run the 153-check suite on <a href="verify.html">Verify</a>, or pick any element and see its valence electrons. Links are shareable — the URL always encodes what you see.',
    },
  ];

  function prefersReducedMotion() {
    return typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // TOTAL patch for the mode keys: unmentioned modes are explicitly disabled
  function buildPatch(stop, quality) {
    return {
      element: stop.element,
      orbital: stop.orbital,
      viz: Object.assign({
        tab: '3d', mode: 'points', colorMode: 'sign', quality: quality,
        showAxes: true, showNucleus: true, plot2d: 'radial', plane: 'xz',
        isoMode: 'prob', isoFrac: 0.9, isoK: 0.1, transparent: true,
      }, stop.viz),
      // reduced-motion users keep animations paused throughout the tour
      anim: Object.assign({ playing: !prefersReducedMotion(), speed: 1 }, stop.anim,
        prefersReducedMotion() ? { playing: false } : null),
      field: Object.assign({ enabled: false, logB: 1 }, stop.field),
      comp: Object.assign({
        enabled: false, mode: 'mo', z: 1, dist: 2.0, combo: 'bonding',
        hybrid: 'sp3', hybridIndex: 0, topology: 'ring', nAtoms: 6, k: 0,
      }, stop.comp),
      multi: stop.multi
        ? { enabled: !!stop.multi.enabled, keys: (stop.multi.keys || []).slice() }
        : { enabled: false, keys: [] },
    };
  }

  let active = false;
  let idx = 0;
  let built = false;
  let prevFocus = null;
  let els = null; // { card, title, body, dots, back, next }

  function $(id) { return document.getElementById(id); }

  function announce(msg) {
    const s = $('sr-status');
    if (s) s.textContent = msg;
  }

  function isDone() {
    // storage can throw on file:// / private mode: treat as done, never nag
    try { return localStorage.getItem(DONE_KEY) === '1'; }
    catch (e) { return true; }
  }

  function markDone() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* still closes */ }
  }

  function onDocKeydown(e) {
    if (e.key === 'Escape') close('skip');
  }

  function onCardKeydown(e) {
    if (!active) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  }

  function ensureCard() {
    const card = $('tour-card');
    if (!card) return null;
    if (built) return card;
    built = true;

    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Guided tour');
    card.setAttribute('tabindex', '-1');

    const title = document.createElement('h2');
    title.id = 'tour-title';
    card.appendChild(title);

    const body = document.createElement('div');
    body.id = 'tour-body';
    body.className = 'tour-body';
    card.appendChild(body);

    const dots = document.createElement('div');
    dots.id = 'tour-dots';
    dots.className = 'tour-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < STOPS.length; i++) {
      const d = document.createElement('span');
      d.className = 'tour-dot';
      dots.appendChild(d);
    }
    card.appendChild(dots);

    const actions = document.createElement('div');
    actions.className = 'tour-actions';
    const skip = document.createElement('button');
    skip.id = 'tour-skip';
    skip.type = 'button';
    skip.className = 'tour-ghost';
    skip.textContent = 'Skip tour';
    skip.addEventListener('click', function () { close('skip'); });
    const back = document.createElement('button');
    back.id = 'tour-back';
    back.type = 'button';
    back.textContent = 'Back';
    back.addEventListener('click', function () { prev(); });
    const nxt = document.createElement('button');
    nxt.id = 'tour-next';
    nxt.type = 'button';
    nxt.textContent = 'Next';
    nxt.addEventListener('click', function () { next(); });
    actions.appendChild(skip);
    actions.appendChild(back);
    actions.appendChild(nxt);
    card.appendChild(actions);

    card.addEventListener('keydown', onCardKeydown);

    els = { card: card, title: title, body: body, dots: dots, back: back, next: nxt };
    return card;
  }

  // Overlay the card on the visible viz panel's lower-left so the orbital the
  // stop talks about stays on screen; the <800px bottom sheet keeps its CSS.
  function positionCard() {
    if (!els || !active) return;
    const card = els.card;
    try {
      if (typeof matchMedia === 'function' && matchMedia('(max-width: 799px)').matches) {
        card.style.top = '';
        return;
      }
      const panel = ['viz-3d', 'viz-2d'].map($).filter(function (p) {
        return p && !p.hidden;
      })[0];
      if (!panel || !card.offsetHeight) return;
      const top = panel.offsetTop + panel.offsetHeight - card.offsetHeight - 8;
      card.style.top = Math.max(panel.offsetTop + 8, top) + 'px';
    } catch (e) { /* fake DOM in tests */ }
  }

  function show(i) {
    idx = i;
    const stop = STOPS[i];
    const M = STOPS.length;
    VV.store.set(stop.patch, 'tour');
    els.title.innerHTML = '<span class="visually-hidden">Step ' + (i + 1) +
      ' of ' + M + ': </span>' + stop.title;
    els.body.innerHTML = stop.body;
    const dots = els.dots.children;
    for (let d = 0; d < dots.length; d++) {
      dots[d].classList.toggle('active', d === i);
    }
    els.back.disabled = (i === 0);
    els.next.textContent = (i === M - 1) ? 'Finish' : 'Next';
    announce('Tour step ' + (i + 1) + ' of ' + M + ': ' + stop.title);
    positionCard();
  }

  function start(index) {
    const card = ensureCard();
    if (!card) return; // page has no tour host
    let q = 'med';
    try { q = VV.store.get().viz.quality; } catch (e) { /* keep fallback */ }
    for (let i = 0; i < STOPS.length; i++) {
      STOPS[i].patch = buildPatch(STOPS[i], q);
    }
    let i0 = (typeof index === 'number' && isFinite(index)) ? Math.floor(index) : 0;
    if (i0 < 0) i0 = 0;
    if (i0 > STOPS.length - 1) i0 = STOPS.length - 1;
    const opening = !active;
    if (opening) {
      active = true;
      prevFocus = document.activeElement || null;
      document.addEventListener('keydown', onDocKeydown);
      if (typeof addEventListener === 'function') addEventListener('resize', positionCard);
      card.hidden = false;
    }
    show(i0);
    // focus moves into the card on open only (non-modal: no trap, no backdrop)
    // preventScroll + scroll-to-top keep the viz panel — the subject of every
    // stop — in view instead of letting focus yank the page down to the card
    if (opening) {
      try { card.focus({ preventScroll: true }); } catch (e) {
        try { card.focus(); } catch (e2) { /* fake/odd DOM */ }
      }
      try { scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { /* no window */ }
    }
  }

  function close(reason) {
    if (!active) return;
    active = false;
    document.removeEventListener('keydown', onDocKeydown);
    if (typeof removeEventListener === 'function') removeEventListener('resize', positionCard);
    if (els) els.card.hidden = true;
    markDone(); // completing OR skipping both count as done
    announce(reason === 'done' ? 'Tour finished.' : 'Tour closed.');
    let t = prevFocus;
    prevFocus = null;
    if (!t || t === document.body || typeof t.focus !== 'function') t = $('start-tour');
    if (t && typeof t.focus === 'function') {
      try { t.focus(); } catch (e) { /* detached node */ }
    }
  }

  function next() {
    if (!active) return;
    if (idx >= STOPS.length - 1) {
      close('done');
      return;
    }
    show(idx + 1);
  }

  function prev() {
    if (!active || idx === 0) return;
    show(idx - 1);
  }

  VV.ui.tour = {
    start: start,
    close: close,
    next: next,
    prev: prev,
    isActive: function () { return active; },
    isDone: isDone, // app.js autostart guard (a storage throw counts as done)
    STOPS: STOPS,
  };
})();
