# Valence View

Interactive visualization of valence electron orbitals for every element (Z = 1–118),
with the full mathematics behind each orbital and an in-browser verification suite.
100% static, dependency-free, hand-written HTML/CSS/JS — no build step, no frameworks,
no external resources. Runs on GitHub Pages or from a double-clicked file.

**Live demo:** enable GitHub Pages (below), then `https://<user>.github.io/valenceview/`

## Features

- **Guided tour** on first visit: 12 stops through the orbitals that matter for
  chemistry — from hydrogen 1s and carbon's directional 2p through radial nodes,
  d orbitals, Unsöld's full-subshell sphere, sp³ hybrids, bonding/antibonding
  MOs, ring delocalization and Zeeman precession. Restart any time with the
  header's Tour button; every stop is a shareable URL
- **Periodic-table picker** for all 118 elements (23 common elements highlighted, plus a
  quick-access strip and an accessible `<select>` mirror), with authored electron
  configurations including the 20 Aufbau exceptions, and per-element valence-subshell
  orbital chips (`2p_x` … `3d_z2` … `4f_xyz`)
- **3D views** (custom WebGL, no libraries): probability point cloud and marching-cubes
  isosurface, sign- or phase-colored lobes, three quality tiers (30k/80k/200k points)
- **2D views** (canvas): radial R(r) and r²R² plots, cross-section heatmaps in the
  xz/xy/yz planes, angular polar plots — fully functional without WebGL
- **Animation as a first-class feature in both 2D and 3D**: time-phase circulation for
  complex orbitals (phase-hue coloring) and Larmor precession under a magnetic field
- **Exact mathematics on display**: every orbital's fully expanded ψ — normalization,
  Laguerre polynomial, angular part — generated from exact BigInt rationals and rendered
  in native MathML (with ASCII fallback), so the displayed formula and the drawn
  wavefunction can never disagree; hand-derived reference tables on the
  [theory page](docs/theory.html)
- **In-browser verification** ([verify page](docs/verify.html)): normalization,
  orthogonality, ⟨r⟩ vs. closed forms, node counts, Slater regression values,
  configuration bookkeeping for all 118 elements, cross-checks of the theory page's
  printed tables against the generated symbolic layer, and honest informational rows
  documenting the model's known limits
- **Speculative modes (clearly labeled)**: Zeeman splitting, rigid Larmor precession and
  a strong-field squeeze heuristic under magnetic fields up to 10⁵ T; two-center LCAO
  bonding/antibonding MOs with any companion element (Wolfsberg–Helmholz energies,
  signed overlap); standalone sp/sp²/sp³ hybrid display; Hückel chain and ring clusters
  (N ≤ 6)
- **Composite mode**: multi-select orbitals ("Compare multiple" + per-subshell
  "all" buttons) to view them concurrently — each orbital in its own categorical
  color across 3D clouds/isosurfaces, chips, legend and 2D plots, with a total
  radial density curve, total-density heatmap, and overlaid angular profiles.
  Select a full subshell to see Unsöld's theorem (their summed density is
  spherical) — verified by the in-browser `unsold-sum` check
- **Shareable links**, e.g. `#Fe-3d_z2`, `#Fe-3d_z2;b=1.5`, `#C-2p_z;c=H:1.4:b`,
  `#Fe-3d_z2+3d_xz+3d_xy` (composite)

## Run locally

No build step. Either double-click `docs/index.html`, or:

    python3 -m http.server 8080 --directory docs
    # → http://localhost:8080

## Publish on GitHub Pages

Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, Folder: `/docs` → Save.

No Actions workflow is needed. After the first deploy, the site URL above becomes the
live demo link (optionally add `og:url`/`og:image` meta tags then — they need absolute
URLs, so they are omitted from the source).

## Project structure

    docs/index.html    the app          docs/js/core/    physics & math (exact rationals,
    docs/theory.html   derivations                       hydrogenic orbitals, Slater, verify)
    docs/verify.html   test suite       docs/js/spec/    speculative models (Zeeman, LCAO)
    docs/404.html      standalone 404   docs/js/render/  WebGL point cloud & isosurface
    docs/css/          styles           docs/js/plot/    canvas 2D plots
                                        docs/js/ui/      shell, state, components

## Physics disclaimer

Orbitals are hydrogen-like solutions with Slater effective nuclear charge — a standard
teaching model, quantitatively rough for many-electron atoms (no correlation, no
relativity, subshells are not mutually orthogonal; the verify page reports these limits
rather than hiding them). Magnetic-field and companion-element modes are first-order
estimates, clearly marked SPECULATIVE, and are not ab-initio chemistry. Configurations
for Z ≥ 104 are predictions and flagged as such.
