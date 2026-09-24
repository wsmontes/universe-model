# Roadmap

## M0 — Browser physics foundation

- [x] TypeScript application shell
- [x] WebGPU initialization
- [x] SI/double-precision world-state conventions
- [x] camera-relative transform boundary
- [x] astronomy-provider contract
- [x] physical-integrity policy
- [ ] automated precision tests

## M1 — Authoritative Sun / Earth / Moon state

- [ ] choose and pin JPL/SPICE kernel set
- [ ] SPICE execution strategy in browser (WASM + worker)
- [ ] UTC -> SPICE time conversion
- [ ] J2000/ICRF-compatible barycentric state vectors
- [ ] body-fixed orientation transforms
- [ ] provenance surfaced in runtime
- [ ] verification against JPL reference vectors

## M2 — First physically rendered bodies

- [ ] solar radiometric source
- [ ] Earth reference ellipsoid
- [ ] Moon reference shape
- [ ] physically correct angular size
- [ ] eclipse/shadow geometry
- [ ] reversed-Z / large-range depth strategy

## M3 — Surface reality

- [ ] multiresolution terrain architecture
- [ ] Earth DEM pipeline
- [ ] lunar DEM pipeline
- [ ] real imagery/albedo products
- [ ] streaming cache and LOD validation

## M4 — Optical reality

- [ ] atmospheric scattering
- [ ] exposure/instrument model
- [ ] stellar Gaia catalog pipeline
- [ ] point-spread-function rendering
- [ ] observer-corrected light-time mode
