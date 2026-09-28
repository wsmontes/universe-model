# Data Provenance

## Planetary ephemeris

### Preferred: JPL DE442s

- Product: `de442s.bsp`
- Producer: NASA/JPL Solar System Dynamics / NAIF distribution
- Format: DAF/SPK
- Runtime use: geometric barycentric J2000 state vectors
- Expected size: 32,701,440 bytes
- Expected MD5: `cc49327e06088124c0e39d8dde9f0b58`
- Coverage pinned by project: 1849-12-26 00:00 TDB through 2150-01-22 00:00 TDB
- Primary URL: `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de442s.bsp`

DE442 is a post-DE440 planetary ephemeris update. The short kernel is used because its roughly 31 MiB footprint is appropriate for a browser-first application while covering the modern interval targeted by the first milestone.

### Operational fallback: JPL DE440s

- Product: `de440s.bsp`
- Expected size: 32,726,016 bytes
- Expected MD5: `3917ee56769db332790c751e2168843d`
- Primary URL: official NASA/JPL NAIF distribution
- Secondary delivery: a commit-pinned copy in ESA `pykep`

A fallback is accepted only after its bytes match the NAIF-published digest.

## Leap seconds

- Product: `naif0012.tls`
- Producer: NASA/JPL NAIF
- Purpose: UTC/TAI history and DELTET constants used for ET conversion
- Distribution: a compact data-only copy is vendored at `static/kernels/naif0012.tls`
- Upstream: `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls`

The project vendors only the constants/table needed at runtime and retains upstream attribution in the file.

## Runtime integrity

`KernelLoader` does not trust an HTTP 200 response as proof of identity. It verifies:

1. exact byte length;
2. MD5 digest against the value published by NAIF;
3. DAF/SPK structure while parsing.

Verified bytes are then eligible for browser cache storage.

## Surface and stellar data

No external surface map, DEM, cloud field, night-light layer, or stellar catalogue is part of the first milestone. Each will receive its own provenance record before it can appear in the physical scene.
