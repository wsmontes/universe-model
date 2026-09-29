# Universe Model

A browser-native astronomical digital twin whose rendered scene is derived from authoritative scientific state rather than cosmetic orbital animation.

## Current milestone

The first vertical slice reconstructs and renders the **Sun, Earth, and Moon** from JPL planetary ephemerides entirely in the browser:

```text
UTC input
  -> NAIF leap-second kernel
  -> ET/TDB epoch
  -> JPL DE442s (preferred) / DE440s (fallback) SPK
  -> barycentric J2000 state vectors
  -> SI / float64 world state
  -> camera-relative WebGPU rendering
```

The application does not enlarge bodies, compress distances, add ambient light, or invent a star field. Earth is rendered in authoritative ITRF93 orientation and the Moon in the DE440 principal-axes frame when their pinned binary PCK data are available; accuracy-sensitive body-fixed rendering is withheld rather than replaced with an invented orientation.

## Run locally

Requirements: Node.js 22+ and a browser with WebGPU.

```bash
npm install
npm test
npm run build
npm run preview

# Networked scientific cross-check using the real DE442s kernel + JPL Horizons:
npm run validate:real-kernel
```

The preview server only serves static files from `dist/`. The production application has no backend.

The epoch field accepts strict UTC labels, including real positive leap-second labels such as `2016-12-31T23:59:60.5Z` when they are declared by the pinned NAIF leap-seconds kernel. Playback advances on a continuous physical-time axis, so an inserted leap second is not silently skipped by JavaScript/POSIX time.

`npm run validate:real-kernel` is intentionally separate from the offline unit suite. It downloads or reuses the exact pinned DE442s kernel, verifies its identity, and compares real geometric state vectors against JPL Horizons at multiple TDB epochs. Horizons currently uses the DE440/441 family, so this is a cross-ephemeris convention/integration gate rather than a bitwise same-solution comparison.

## GitHub Pages

The repository is designed for **branch-based GitHub Pages**, without GitHub Actions.

```bash
npm run deploy:pages
```

That command builds locally and force-publishes the static `dist/` tree to the `gh-pages` branch. In repository settings, Pages should use **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.

## Ephemeris data

The preferred kernel is **JPL DE442s**. The browser attempts the official NASA/JPL NAIF source and validates the exact byte length and NAIF-published MD5 before parsing it. If DE442s cannot be downloaded, it falls back to DE440s, including a pinned ESA pykep GitHub copy whose bytes are checked against the official NAIF MD5. A user can also select a local DE442s/DE440s `.bsp` file.

Large kernels are cached in the browser after verification. They are not committed to this repository.

## Physical integrity

See:

- [Architecture](docs/ARCHITECTURE.md)
- [Physical Integrity Policy](docs/PHYSICAL-INTEGRITY.md)
- [Data Provenance](docs/DATA-PROVENANCE.md)
- [Implementation Status](docs/IMPLEMENTATION-STATUS.md)
- [Roadmap](docs/ROADMAP.md)

## Scientific sources

- NASA/JPL NAIF SPICE: <https://naif.jpl.nasa.gov/naif/>
- JPL generic planetary SPK kernels: <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/>
- NAIF leap-seconds kernel: <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/>

Unknown state is preferable to fabricated state.
