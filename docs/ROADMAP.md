# Roadmap

## M0 — Browser physics foundation

- [x] TypeScript application shell
- [x] WebGPU initialization
- [x] SI / double-precision world-state conventions
- [x] camera-relative transform boundary
- [x] reversed-Z large-world depth
- [x] physical-integrity policy
- [x] local automated core tests
- [x] static build and branch-based Pages deployment script

## M1 — Authoritative Sun / Earth / Moon state

- [x] select DE442s as preferred planetary kernel
- [x] retain DE440s as verified fallback
- [x] parse pinned NAIF leap-seconds data
- [x] UTC -> ET/TDB conversion for ordinary UTC labels
- [x] DAF/SPK Type 2 reader in TypeScript
- [x] J2000 / SSB barycentric state vectors
- [x] position + analytic velocity
- [x] Web Worker execution
- [x] kernel byte-length + official MD5 validation
- [x] provenance surfaced at runtime
- [x] absolute-epoch forward/reverse temporal playback
- [ ] real-kernel golden-vector verification against SPICE/Horizons
- [ ] literal UTC leap-second (`:60`) input

## M2 — First physically rendered bodies

- [x] physical Sun radius
- [x] physical Earth mean radius
- [x] physical Moon mean radius
- [x] no ambient light
- [x] inverse-square solar illumination
- [x] physically correct angular size from geometry
- [x] physical camera framing / target following
- [x] finite-Sun penumbra/umbra model
- [ ] validated solar radiometry / exposure calibration

## M3 — Authoritative orientation and surface reality

- [x] reference-frame service for J2000/ECLIPJ2000 + binary PCK Type 2
- [x] high-precision Earth and lunar binary PCK ingestion
- [x] Earth ITRF93 source and transform
- [x] lunar MOON_PA_DE440 body-fixed orientation
- [x] lunar PA runtime integration check against published NAIF vector
- [ ] Earth frame-matrix/subsolar-point golden validation against CSPICE
- [x] Earth pck00011 oblate ellipsoid
- [ ] multiresolution terrain architecture
- [ ] Earth DEM pipeline
- [ ] lunar DEM pipeline
- [ ] provenance-aware imagery/albedo products
- [ ] streaming cache and LOD validation

## M4 — Optical reality

- [ ] atmospheric scattering
- [ ] ocean BRDF/Fresnel model
- [ ] calibrated exposure/instrument model
- [ ] observer-corrected light-time mode
- [ ] aberration model

## M5 — Stellar space

- [ ] Gaia catalogue pipeline
- [ ] proper-motion propagation
- [ ] radial-velocity propagation where available
- [ ] point-spread-function rendering
- [ ] catalogue LOD/culling
