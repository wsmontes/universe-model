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

The application does not enlarge bodies, compress distances, add ambient light, or invent a star field. Earth and Moon use authoritative body-fixed orientation when the required binary PCK coverage is available; otherwise the renderer withholds orientation-dependent claims rather than fabricating them.

A separate observation engine now exposes reception-mode light-time and stellar-aberration corrections (`LT`, `CN`, `LT+S`, `CN+S`). The visible scene remains geometric until retarded illumination can be made causally consistent.

## Run locally

Requirements: Node.js 22+ and a browser with WebGPU.

```bash
npm install
npm test
npm run build
npm run preview
```

The preview server only serves static files from `dist/`. The production application has no backend.

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
