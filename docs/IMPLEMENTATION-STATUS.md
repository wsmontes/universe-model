# Implementation Status

## Implemented and locally validated

- static TypeScript -> ES module build suitable for branch-based GitHub Pages;
- no application backend and no GitHub Actions workflow;
- WebGPU initialization;
- camera-relative large-world coordinates;
- reversed-Z infinite projection;
- physical Sun/Earth/Moon radii;
- no ambient light;
- NAIF LSK parsing;
- UTC -> TAI -> TT -> ET/TDB conversion for ordinary UTC labels;
- DAF file/summary parsing;
- SPK Type 2 Chebyshev position and analytic velocity;
- barycentric segment-chain composition;
- DE442s primary / DE440s fallback manifest;
- byte-length + NAIF MD5 kernel verification;
- browser Cache Storage reuse;
- local-file kernel fallback;
- ephemeris Web Worker;
- runtime provenance display;
- physical camera framing without changing world geometry.

## Local automated tests

The current test suite covers:

1. MD5 standard vectors;
2. Chebyshev value and analytic derivative;
3. leap-second step and UTC -> ET sanity checks;
4. a complete synthetic DAF/SPK Type 2 binary, including velocity reconstruction.

## Not yet claimed

The following are deliberately not presented as solved:

- literal `:60` UTC leap-second input;
- full CSPICE equivalence over all time parsing cases;
- body-fixed Earth/Moon orientation;
- oblate Earth rendering;
- DEM/terrain;
- geographic/albedo textures;
- atmosphere or ocean BRDF;
- light-time/aberration observed mode;
- Gaia star catalogue;
- empirical comparison against a real DE442s kernel in this repository's automated test environment.

The browser runtime is designed to load a real kernel and expose its verified MD5. A reference-vector validation suite against SPICE/Horizons is the next scientific gate.
