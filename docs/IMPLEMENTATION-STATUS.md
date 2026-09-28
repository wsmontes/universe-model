# Implementation Status

## Implemented and locally validated

- static TypeScript -> ES module build suitable for branch-based GitHub Pages;
- no application backend and no GitHub Actions workflow;
- WebGPU initialization;
- camera-relative large-world coordinates;
- reversed-Z infinite projection;
- physical Sun/Earth/Moon radii;
- no ambient light;
- finite-Sun eclipse shadow model with umbra/penumbra from angular disk overlap;
- absolute-epoch temporal playback, including reverse time and accelerated rates;
- camera target following that does not move astronomical bodies;
- DAF/binary-PCK Type 2 parser for Euler orientation;
- SPICE 3-1-3 frame-rotation reconstruction;
- J2000 and ECLIPJ2000 inertial base-frame support;
- current high-precision Earth ITRF93 PCK ingestion;
- DE440 lunar principal-axis PCK ingestion;
- authoritative pck00011 Sun/Earth/Moon radii;
- oblate Earth ellipsoid rendering with ellipsoid normals;
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

## Temporal model

Playback never integrates orbital state from the previous frame. A simulation clock maps monotonic browser time to a new absolute UTC epoch. Each astronomy refresh reconstructs Sun/Earth/Moon state from the JPL SPK at that epoch.

The UI currently supports paused, real-time, accelerated forward time, and reverse time. Ephemeris requests are bounded to approximately 30 Hz so requests do not accumulate on the worker.

## Eclipse model

Earth and Moon can occult the finite solar disk. Per-fragment illumination computes:

1. apparent angular radius of the Sun;
2. apparent angular radius of the relevant occluder;
3. angular center separation;
4. exact overlap area of the two apparent disks.

This produces full illumination, partial penumbra, annular visibility, or total umbra from geometry. The model intentionally does not use a point-light shadow map.

## Local automated tests

The current test suite covers:

1. MD5 standard vectors;
2. Chebyshev value and analytic derivative;
3. leap-second step and UTC -> ET sanity checks;
4. finite-disk overlap cases for umbra, penumbra and no eclipse;
5. a complete synthetic DAF/SPK Type 2 binary, including velocity reconstruction;
6. a synthetic binary-PCK Type 2 orientation, including angular rates and orthonormal matrix reconstruction.

## Not yet claimed

The following are deliberately not presented as solved:

- literal `:60` UTC leap-second input;
- full CSPICE equivalence over all time parsing cases;
- independent golden-vector validation of Earth/Moon orientation against CSPICE;
- long-range high-precision Earth orientation outside the pinned daily PCK coverage;
- DEM/terrain;
- geographic/albedo textures;
- atmosphere or ocean BRDF;
- physically calibrated solar radiometry and camera response;
- light-time/aberration observed mode;
- Gaia star catalogue;
- empirical comparison against a real DE442s kernel in this repository's automated test environment.

The browser runtime is designed to load a real kernel and expose its verified MD5. A reference-vector validation suite against SPICE/Horizons remains the next scientific gate.
