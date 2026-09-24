# Architecture

## Core rule

The application is a renderer of a physical astronomical state, not an orbital animation engine.

```text
authoritative astronomical data
        |
        v
astronomy provider
(time, ephemerides, orientation, frames)
        |
        v
double-precision world state in SI units
        |
        v
camera-relative transform
        |
        v
WebGPU renderer
        |
        v
display / optical response
```

## Coordinate model

The world model stores absolute positions as IEEE-754 double-precision numbers in SI meters.

The first solar-system implementation will use a barycentric inertial frame compatible with the selected JPL/SPICE kernels. Reference-frame identity is carried with every astronomical state and is never inferred from renderer state.

The GPU does not receive raw astronomical coordinates. For each rendered object:

```text
local = absolute_object_position - absolute_camera_position
```

The subtraction occurs in double precision. Only the local result is narrowed for GPU consumption.

This preserves local precision without altering physical scale.

## Time model

Animation time is not integrated frame by frame.

Astronomical state is a function of an absolute epoch:

```text
state = provider(body, epoch)
```

UI time begins as UTC. The astronomy provider owns conversion to the dynamical time scale required by its authoritative dataset (for SPICE this will normally involve ET/TDB semantics).

Seeking backward or forward therefore reconstructs state from the requested epoch rather than accumulating integration error.

## Astronomy-provider boundary

`AstronomyProvider` is deliberately independent from rendering.

The first real provider should be SPICE-backed and expose:

- barycentric body state vectors;
- frame metadata;
- orientation transforms;
- geometric and observer-corrected queries as separate operations;
- provenance for every returned state.

Until that provider exists, the application renders no celestial bodies.

## Renderer responsibilities

The WebGPU renderer is responsible for:

- camera-relative coordinates;
- depth strategy suitable for enormous scale ranges;
- surface LOD;
- physically based light transport approximations;
- atmosphere;
- optical/display transform.

It is not responsible for orbital mechanics or inventing missing astronomical data.

## Planned precision work

The initial scaffold validates the browser and WebGPU path. Subsequent renderer work will introduce:

1. reversed-Z depth;
2. camera-relative world transforms;
3. high/low coordinate encoding where float32 locality is insufficient;
4. hierarchical reference frames for near-surface work;
5. deterministic precision tests across astronomical and local scales.
