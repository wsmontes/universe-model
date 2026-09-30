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
- [x] real DE442s + live Horizons cross-validation harness
- [ ] immutable real-kernel golden-vector fixture against SPICE/Horizons
- [x] literal UTC leap-second (`:60`) input and leap-aware playback timeline

## M2 — First physically rendered bodies

- [x] physical Sun radius
- [x] physical Earth mean radius
- [x] physical Moon mean radius
- [x] no ambient light
- [x] inverse-square solar illumination
- [x] physically correct angular size from geometry
- [x] physical camera framing / target following
- [x] finite-Sun penumbra/umbra model
- [x] broadband TSI-scaled solar/reflected radiometry
- [ ] spectral solar radiometry / calibrated instrument response

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
- [x] Earth BMNG dated reference surface-color pipeline
- [ ] scientific lunar WAC Hapke surface-color pipeline
- [ ] streaming cache and LOD validation

## M4 — Optical reality

- [x] first-pass external-view atmospheric single scattering
- [ ] ocean BRDF/Fresnel model
- [x] explicit deterministic display reference-radiance transform
- [ ] calibrated spectral exposure/instrument model
- [x] observer-corrected one-way light-time engine (LT/CN)
- [x] Newtonian stellar aberration (+S)
- [x] observed-state provider/worker API with causal target orientation
- [ ] full observed-scene rendering with causally consistent retarded illumination

## M5 — Multiscale Evidence Core

- [x] generic Evidence / EvidenceQuery metadata contract
- [x] EvidenceProvider coverage + resolve contract
- [x] EvidenceRegistry
- [x] deterministic EvidenceResolver
- [x] hard reference-frame and vertical-datum compatibility gates
- [x] explicit spatial / temporal / uncertainty / authority selection criteria
- [x] leap-safe caller-supplied temporal comparison coordinate
- [x] first concrete provider: NASA BMNG 2004
- [x] route current Earth reference surface selection through the resolver
- [x] renderer consumes selected evidence rather than choosing source
- [x] structured body/geodetic spatial extent and location types
- [x] provider failure isolation / diagnostics without masking integrity violations

## M6 — Streaming, cache and generic LOD

- [x] request scheduler with priority, deduplication and consumer-aware cancellation
- [x] screen-space error / target-resolution policy
- [ ] parent-tile fallback and seam-safe LOD transitions
- [x] byte-budgeted pinned LRU primitive for memory/GPU resources
- [ ] persistent-cache quota / eviction policy
- [x] strict HTTP Range substrate
- [x] generic cache identity from evidence integrity/version metadata
- [x] current BMNG surface loading routed through the scheduler
- [x] retain previous valid surface until replacement evidence is ready
- [ ] move surface refresh/invalidation policy out of App
- [x] request / transferred-byte / dedup / cancellation / cache-hit telemetry substrate

## M7 — Earth geodesy and global terrain

- [ ] geodetic coordinate service from ITRF93 ellipsoid
- [ ] explicit vertical-datum model/conversion boundary
- [ ] generic TerrainTile payload
- [ ] Copernicus DEM GLO-30 provider
- [ ] GEBCO bathymetry provider
- [ ] terrain mesh generation / GPU upload
- [ ] camera-relative precision validation near ground

## M8 — Vertical proof: Space → Earth → Himalaya → Everest

- [ ] continuous navigation from astronomical scale to terrain scale
- [ ] global Copernicus terrain
- [ ] regional NASA High Mountain Asia DEM override
- [ ] automatic evidence fallback outside high-resolution footprint
- [ ] provenance visible for active terrain evidence
- [ ] no geometric discontinuity at provider/LOD boundaries

## M9 — Temporal Earth observations

- [ ] STAC discovery abstraction
- [ ] COG range-reading path
- [ ] Sentinel-2 provider
- [ ] Landsat provider
- [ ] NASA GIBS near-real-time layers
- [ ] Black Marble night-radiance layer
- [ ] temporal evidence selection tied to requested epoch

## M10 — Vertical proof: Moon → surface

- [ ] LOLA global terrain provider
- [ ] LROC WAC Hapke-normalized surface provider
- [ ] regional high-resolution lunar evidence
- [ ] continuous orbital-to-surface navigation
- [ ] preserve MOON_PA_DE440 orientation throughout LOD changes

## M11 — Vertical proof: Earth → city → building

- [ ] PMTiles / MVT reader
- [ ] Overture buildings provider
- [ ] OSM complementary provider
- [ ] explicit unknown-height building representation
- [ ] regional imagery override
- [ ] public LiDAR / point-cloud adapter
- [ ] first measured urban geometry vertical

## M12 — Stellar space

- [ ] Gaia catalogue ingestion and HEALPix sharding
- [ ] proper-motion propagation
- [ ] radial-velocity propagation where available
- [ ] point-spread-function rendering
- [ ] catalogue LOD/culling
- [ ] HiPS survey adapter
- [ ] VizieR/TAP catalogue adapter

## M13 — Dynamic atmosphere / living Earth

- [ ] GFS / ECMWF model provider boundary
- [ ] pressure-level 3D atmospheric fields
- [ ] cloud/aerosol evidence layers
- [ ] separate measured/assimilated weather from reference atmosphere model

## M14 — Broader Solar System

- [ ] JPL SBDB small-body integration
- [ ] planetary PDS / USGS provider family
- [ ] MOLA / CTX / HiRISE Mars hierarchy
- [ ] additional moons/planets through the same evidence + LOD architecture
