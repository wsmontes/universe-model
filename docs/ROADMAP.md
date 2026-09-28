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
- [ ] real-kernel golden-vector verification against SPICE/Horizons
- [ ] literal UTC leap-second (`:60`) input

## M2 — First physically rendered bodies

- [x] physical Sun radius
- [x] physical Earth mean radius
- [x] physical Moon mean radius
- [x] no ambient light
- [x] inverse-square solar illumination
- [x] physically correct angular size from geometry
- [x] physical camera framing / navigation
- [ ] finite-Sun penumbra/umbra model
- [ ] validated solar radiometry / exposure calibration

## M3 — Authoritative orientation and surface reality

- [ ] reference-frame service
- [ ] PCK/FK kernel ingestion
- [ ] Earth orientation source and transform
- [ ] lunar body-fixed orientation
- [ ] subsolar-point validation against SPICE
- [ ] Earth ellipsoid
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
