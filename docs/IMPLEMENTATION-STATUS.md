# Implementation Status

## Implemented

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
- DAF/binary-PCK Type 2 parser for RA/DEC/W orientation;
- SPICE 3-1-3 frame-rotation reconstruction;
- J2000 and ECLIPJ2000 inertial base-frame support;
- current high-precision Earth ITRF93 PCK ingestion;
- DE440 lunar principal-axis PCK ingestion;
- authoritative pck00011 Sun/Earth/Moon radii;
- oblate Earth ellipsoid rendering with ellipsoid normals;
- linear HDR intermediate render target with a single final display transform;
- broadband radiometric scene scale in W·m⁻²·sr⁻¹;
- fixed 1000 W·m⁻²·sr⁻¹ per-unit HDR storage scale to keep solar radiance inside rgba16float without changing scene physics;
- pinned NASA-reference total solar irradiance of 1361 W/m² at exactly 1 au;
- uniform solar-disk radiance derived from TSI, physical Sun radius, and exact au;
- Lambertian reflected radiance with the required 1/π factor;
- explicit observer/display reference-radiance control that does not modify physical scene state;
- Earth reference-atmosphere single scattering using a physical 100 km shell for an external-space observer;
- exponential Rayleigh/Mie density profiles and planet/Sun optical-depth integration;
- body-fixed equirectangular reference-surface texture coordinates;
- Earth Blue Marble Next Generation monthly 2004 base-map selection by calendar month;
- sRGB GPU texture decoding before physical illumination;
- NAIF LSK parsing;
- UTC -> TAI -> TT -> ET/TDB conversion, including literal positive leap-second labels;
- continuous TAI-based playback timeline that preserves inserted UTC leap seconds;
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
- observer-corrected reception-state reconstruction with LT/CN one-way light time;
- Newtonian stellar aberration (+S) using observer SSB velocity;
- causal target orientation evaluated at the emission epoch for observed states;
- generic multiscale Evidence / EvidenceQuery metadata model;
- EvidenceProvider registry and deterministic EvidenceResolver;
- hard reference-frame and vertical-datum evidence compatibility gates;
- leap-safe temporal evidence ordering through caller-supplied continuous timeline coordinates;
- NASA BMNG 2004 represented as the first concrete evidence provider;
- current Earth reference-surface selection routed through the evidence resolver before rendering.
- typed global-body and geodetic-bounds spatial evidence coverage with antimeridian support;
- provider operational-failure isolation while incompatible returned evidence remains a hard integrity error.
- bounded-concurrency streaming request scheduler with priority, deduplication and consumer-aware cancellation;
- strict HTTP Range fetching that refuses silent full-resource fallback;
- evidence-derived cache identities with persistent-safety classification;
- screen-space-error LOD math derived from physical distance, FOV and viewport height;
- byte-budgeted pinned LRU primitive for memory/GPU resource control;
- BMNG raster loading routed through the scheduler with superseded-request cancellation;
- previous valid surface retained until replacement evidence has loaded successfully;
- streaming telemetry counters for requests, bytes, deduplication, cancellation and cache hits.
- generic evidence-stream identity controller replacing BMNG-specific month invalidation in App;
- explicit surface-evidence clearing when no compatible evidence exists;
- hierarchical parent fallback that keeps complete coverage while children stream;
- integrity-gated persistent binary Cache Storage with serialized quota eviction.

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

## Validation status

Core numerical primitives are covered by synthetic/local tests. The orientation path also contains a runtime integration gate using the official NAIF lunar-frame reference example at ET 717768000: the Earth-relative-Moon position transformed into MOON_PA is compared with the published vector [373997.028, -23558.987, 10284.057] km. A gross frame-order/sign error aborts orientation initialization rather than rendering a false body-fixed frame.

A local real-kernel validation harness is now available as `npm run validate:real-kernel`. It downloads or reuses the exact pinned DE442s bytes, verifies both byte length and MD5, parses the real DAF/SPK, and compares geometric Moon/Earth, Sun/Earth, and Earth/SSB state vectors at multiple TDB epochs against JPL Horizons. Because Horizons currently uses the DE440/441 family while this project pins DE442s, the harness uses declared cross-ephemeris tolerances as a convention/integration gate rather than claiming bit-for-bit equality. A captured, immutable golden-vector fixture remains pending.

## Local automated tests

The current test suite covers:

1. MD5 standard vectors;
2. Chebyshev value and analytic derivative;
3. leap-second step, literal `:60` parsing, UTC <-> continuous TAI timeline, and UTC -> ET sanity checks;
4. finite-disk overlap cases for umbra, penumbra and no eclipse;
5. a complete synthetic DAF/SPK Type 2 binary, including velocity reconstruction;
6. a synthetic binary-PCK Type 2 RA/DEC/W record, including conversion to SPICE 3-1-3 angles, angular rates, and orthonormal matrix reconstruction;
7. synthetic one-way light-time convergence and Newtonian stellar-aberration direction;
8. multiscale evidence selection, regional fallback, hard frame rejection, leap-safe temporal ordering, and the BMNG evidence adapter.

The separate `npm run validate:real-kernel` gate uses the actual DE442s kernel and live JPL Horizons vectors. It is intentionally not part of `npm test`: the ordinary test suite stays deterministic and offline, while the scientific cross-check is an explicit networked validation step.

## Not yet claimed

The following are deliberately not presented as solved:

- full CSPICE equivalence over all time parsing cases;
- tighter matrix-by-matrix golden validation of Earth orientation against CSPICE;
- long-range high-precision Earth orientation outside the pinned daily PCK coverage;
- DEM/terrain;
- radiometrically calibrated Earth BRDF/albedo products;
- scientific lunar WAC Hapke imagery ingestion;
- live or epoch-matched Earth imagery beyond the dated 2004 BMNG reference composites;
- inside-atmosphere/ground-observer compositing;
- multiple atmospheric scattering, ozone absorption, weather-dependent aerosols, clouds, or humidity;
- ocean BRDF;
- time-varying TSI/SSI tied to solar activity;
- spectral solar radiance and spectral sensor response;
- calibrated camera/sensor response beyond the explicit reference-radiance display transform;
- full observed-scene rendering with causally consistent retarded illumination;
- Gaia star catalogue;
- empirical comparison against a real DE442s kernel in this repository's automated test environment.

The browser runtime is designed to load real kernels and expose their provenance. Planetary SPK identity is pinned by expected NAIF MD5; orientation PCKs are pinned by immutable official URLs, runtime hashes, DAF/PCK structure, expected frame class, and the lunar NAIF integration check. A broader reference-vector suite against CSPICE/Horizons remains a scientific gate.
