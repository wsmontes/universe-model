# Architecture

## Core rule

Universe Model is a renderer of physical astronomical state, not an orbital animation engine.

```text
authoritative data
  |-- NAIF LSK (civil -> dynamical time)
  `-- JPL SPK (ephemerides)
          |
          v
astronomy worker
          |
          v
barycentric J2000 state, float64, SI
          |
          v
camera-relative large-world transform
          |
          v
WebGPU renderer
          |
          v
explicit optical/display response
```

## Static/browser-only runtime

The production artifact is ordinary static content. There is no application server, database, API, serverless function, or runtime Node dependency. The browser downloads and verifies scientific kernels and performs the ephemeris calculation locally.

Source stays on `main`; `gh-pages` is a generated publication branch. Deployment is performed explicitly with `npm run deploy:pages`; no GitHub Actions workflow is required.

## Time

The UI accepts UTC. `TimeConverter` parses a pinned NAIF leap-seconds kernel and converts UTC -> TAI -> TT -> ET/TDB using the DELTET constants carried by the kernel. Astronomical state is a function of the absolute epoch; positions are never advanced by integrating frame deltas.

The current parser intentionally refuses the literal leap-second label `23:59:60`. Normal instants on either side of a leap second use the correct TAI-UTC step. Full SPICE-compatible leap-second-label parsing is a later time-system refinement.

## Ephemerides

`SpkKernel` implements the DAF/SPK subset required by DE44xs planetary kernels:

- DAF file record and summary records;
- LTL-IEEE and BIG-IEEE decoding;
- SPK Type 2 position segments;
- analytic Chebyshev derivative for velocity;
- segment precedence;
- center-chain composition to the Solar System Barycenter;
- J2000 frame only at this milestone.

DE442s is preferred. DE440s is retained as an operational fallback. Unsupported segment types or frames fail explicitly.

## Worker boundary

The parsed SPK lives in a module Web Worker. Kernel parsing and state reconstruction therefore remain outside the render loop. The main thread receives only state vectors and provenance.

## Coordinate model

Absolute state uses JavaScript IEEE-754 doubles and SI units:

```text
position: m
velocity: m/s
```

The GPU never receives raw astronomical positions. Before upload:

```text
local = absolute_object_position - absolute_camera_position
```

That subtraction is performed in double precision, after which the local value is narrowed to GPU float32.

## Large-world rendering

The current renderer uses:

- camera-relative coordinates;
- a reversed-Z infinite projection;
- a floating camera origin;
- physical body radii;
- no distance compression.

A future high/low coordinate split is reserved for cases where camera-relative float32 is insufficient near detailed surfaces.

## Lighting

There is no ambient light. The Sun is the sole source in the first scene. Non-emissive bodies use inverse-square solar illumination and a Lambertian surface model with explicitly declared reflectance. The display transform is explicit and does not alter geometry.

## Body shape/orientation boundary

The first Earth and Moon visual models are deliberately orientation-independent spheres using declared physical mean radii. No geographic texture is shown because body-fixed orientation has not yet been implemented. Texture, DEM, clouds, and longitude-dependent data are gated on authoritative frame transforms.

## Next architectural boundary

Body-fixed orientation will be a separate frame service driven by authoritative PCK/FK/Earth-orientation data. Rendering code will not infer or approximate body orientation.

## Temporal playback

Playback is derived from an absolute simulation clock. Browser monotonic time is mapped to a UTC epoch at the selected rate; the astronomy worker then reconstructs state from the SPK for that epoch. No orbital state is integrated from the previous rendered frame.

Ephemeris refreshes are rate-limited so asynchronous worker requests cannot accumulate. Camera tracking updates the camera target to follow a selected body or the Earth-Moon midpoint without changing astronomical coordinates.

## Finite-Sun eclipses

The Sun is not treated as a point shadow source. Earth and Moon shadows use the finite solar angular radius at each rendered surface point. The shader computes apparent Sun/occluder disk overlap, so total umbra, partial penumbra, and annular visibility arise continuously from geometry.

This is separate from the surface material model and requires no eclipse-specific event scripting.

## Binary PCK orientation service

High-precision body orientation is reconstructed in the astronomy worker from NAIF binary PCK Type 2 segments. The DAF descriptor identifies the PCK frame class and inertial base frame. At the requested ET, three Chebyshev Euler-angle expansions are evaluated in radians.

The base-frame to body-fixed transform uses the SPICE 3-1-3 convention:

```text
R = [ANGLE_3]3 [ANGLE_2]1 [ANGLE_1]3
```

Earth's current high-precision PCK is relative to ECLIPJ2000; the engine composes the fixed J2000 -> ECLIPJ2000 rotation before applying the PCK rotation. The lunar DE440 PA PCK is referenced directly to J2000/ICRF.

The renderer receives the transpose as body-fixed -> J2000 and uses it to transform both ellipsoid vertices and analytically correct ellipsoid normals. An asymmetric/oblate body is not rendered if its required orientation is unavailable for the requested epoch.

## Runtime orientation integrity gate

The lunar orientation path is checked against a numerical example published in the NAIF DE440 lunar frames kernel. At ET 717768000 seconds past J2000 TDB, the engine computes the geometric Earth-relative-Moon vector from the loaded planetary SPK, transforms it with the loaded MOON_PA_DE440 binary PCK, and compares the result with the published MOON_PA position:

```text
[ 373997.028, -23558.987, 10284.057 ] km
```

The runtime allows a deliberately loose cross-ephemeris tolerance of 100 km because DE442s is the preferred planetary SPK while the published example was generated with DE440. The tolerance is meant to detect incorrect axes, signs, multiplication order, or frame direction; it is not presented as a precision benchmark.

