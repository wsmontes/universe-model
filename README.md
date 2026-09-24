# Universe Model

A browser-native astronomical digital twin built around physical scale, authoritative ephemerides, and physically grounded rendering.

## Non-negotiable principles

- **No cosmetic scale changes.** Distances and body dimensions remain physical.
- **No invented astronomical state.** Positions, orientations, and time-dependent state must come from authoritative data.
- **Rendering is not the source of truth.** The renderer materializes a physical world model; it does not simulate astronomy.
- **No decorative celestial substitutions.** No fake star fields, enlarged planets, artistic orbital spacing, or ambient light used to make the scene easier to see.
- **Known uncertainty is represented as uncertainty.** Missing observations are not replaced by procedural content presented as reality.
- **Observation and geometry are distinct.** "Where an object is" and "what an observer sees" are separate modes because of light-time, aberration, and optical effects.

## Intended stack

- TypeScript
- WebGPU / WGSL
- double-precision world state on CPU
- camera-relative GPU coordinates
- NASA/JPL SPICE ephemerides and orientation kernels
- NASA PDS / USGS planetary datasets
- Gaia astrometry for stellar space
- multiresolution streaming for surface datasets

## First milestone

Establish the browser renderer, strict SI-unit world model, precision strategy, time model, and astronomy-provider boundary before rendering any celestial body.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PHYSICAL-INTEGRITY.md](docs/PHYSICAL-INTEGRITY.md).
