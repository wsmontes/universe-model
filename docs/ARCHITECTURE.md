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

Literal positive leap-second labels such as `23:59:60.5` are validated against the loaded LSK rather than normalized through JavaScript `Date`. UTC labels are mapped onto a continuous TAI-based Unix-second axis, so temporal playback preserves the extra physical second when it crosses an inserted leap second. The inverse mapping emits the literal `:60` label while the simulation is inside that interval.

`JDUTC` is deliberately reported as unavailable for a leap-second label because NAIF notes that Julian Date UTC has no mechanism for uniquely naming instants inside an inserted leap second. TT/TDB/ET remain continuous and unambiguous.

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

Earth uses the pck00011 oblate reference ellipsoid and is rendered only when an authoritative ITRF93 body-fixed orientation is available for the requested epoch. Moon orientation is reconstructed in the DE440 principal-axes frame. Geographic texture, DEM, clouds, and longitude-dependent data remain gated on provenance-aware surface datasets.

## Temporal playback

Playback is derived from an absolute simulation clock. Browser monotonic time advances a continuous TAI-based second axis at the selected rate; the LSK maps that axis back to an exact UTC label, including `:60` during a positive leap second. The astronomy worker then reconstructs state from the SPK for that epoch. No orbital state is integrated from the previous rendered frame.

Ephemeris refreshes are rate-limited so asynchronous worker requests cannot accumulate. Camera tracking updates the camera target to follow a selected body or the Earth-Moon midpoint without changing astronomical coordinates.

## Finite-Sun eclipses

The Sun is not treated as a point shadow source. Earth and Moon shadows use the finite solar angular radius at each rendered surface point. The shader computes apparent Sun/occluder disk overlap, so total umbra, partial penumbra, and annular visibility arise continuously from geometry.

This is separate from the surface material model and requires no eclipse-specific event scripting.

## Binary PCK orientation service

High-precision body orientation is reconstructed in the astronomy worker from NAIF binary PCK Type 2 segments. The DAF descriptor identifies the PCK frame class and inertial base frame. At the requested ET, the three Chebyshev expansions stored by a Type 2 binary PCK are evaluated as right ascension (RA), declination (DEC), and prime-meridian angle (W). They are converted to the SPICE Euler angles

```text
ANGLE_1 = pi/2 + RA
ANGLE_2 = pi/2 - DEC
ANGLE_3 = W
```

The base-frame to body-fixed transform then uses the SPICE 3-1-3 convention:

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



## Linear HDR and reference atmosphere

Bodies and atmosphere are composed in a linear `rgba16float` render target. The radiance-like scene values are transformed to the display only once, in the final full-screen pass. This avoids combining already-tonemapped body colors with atmospheric scattering.

The first Earth atmosphere is a declared reference model rather than a live weather product:

- the atmosphere follows the authoritative Earth ellipsoid with a 100 km physical top altitude;
- molecular density uses an exponential 8.5 km scale height, consistent with the NASA Earth Fact Sheet reference scale height;
- aerosol/Mie density uses a separately declared 1.2 km reference scale height;
- Rayleigh and Mie single scattering are integrated along the camera ray;
- sunlight optical depth is integrated from every camera-ray sample toward the physical Sun direction;
- the solid Earth blocks sunlight and the existing depth buffer prevents atmosphere behind closer geometry from being composited;
- no atmosphere thickness exaggeration, ambient fill, or artistic rim term is used.

This milestone is **single scattering**. Multiple scattering, ozone absorption, altitude-dependent composition, spatially varying aerosol/humidity fields, clouds, and a spectral solar radiance calibration remain separate scientific layers. The current display exposure is still a declared observer/display response rather than a calibrated camera.


The current atmosphere pass is intentionally limited to cameras outside the 100 km reference shell. A camera inside the atmosphere is not given an invented approximation: the atmosphere pass is withheld until a depth-aware inside-atmosphere/full-screen integration path is implemented.


## Provenance-aware surface color

Surface color is mapped in the authoritative body-fixed frame. The renderer derives longitude and latitude from the body-fixed unit direction:

```text
longitude = atan2(+Y, +X)
latitude  = asin(+Z)
u = 0.5 + longitude / 2pi
v = 0.5 - latitude / pi
```

Texture data is uploaded as `rgba8unorm-srgb`, so WebGPU decodes sRGB values to linear RGB before the Lambertian illumination term is applied.

Earth currently uses NASA Blue Marble: Next Generation **Base Map** monthly composites. The source year is 2004; selection follows the requested epoch's calendar month only. The runtime and provenance display therefore treat this as a dated reference surface, not as live Earth imagery or as a radiometrically calibrated BRDF.

The Moon deliberately remains on the uniform physical material. NASA's convenient CGI Moon Kit color map is not used because its documentation states that the visualization product is optimized for aesthetics rather than science. Lunar surface color will instead be taken from the photometrically normalized WAC Hapke product.

If a remote Earth surface asset cannot be fetched with CORS, physical geometry and illumination continue with the uniform material. An unavailable image never blocks astronomical state reconstruction.


## Broadband radiometry

The linear HDR scene is physically defined in broadband radiance `W·m⁻²·sr⁻¹` rather than arbitrary brightness units. Because the render target is `rgba16float`, GPU storage uses a fixed transparent scale: **1 stored unit = 1000 W·m⁻²·sr⁻¹**. All physical calculations occur in SI-valued radiance before this final storage conversion, and the display-reference radiance is converted by the same factor.

The pinned solar reference is:

```text
TSI(1 au) = 1361 W/m²
1 au      = 149,597,870,700 m exactly
```

For a Sun-object distance `r`:

```text
E_sun(r) = 1361 × (1 au / r)²
```

The initial surface BRDF remains Lambertian. Its outgoing radiance is therefore:

```text
L_o = rho × E_sun × max(n·s, 0) / pi
```

before eclipse visibility is applied.

The rendered solar disk is assigned the uniform-disk radiance that reproduces the same 1-au TSI when integrated over the physical angular disk:

```text
L_sun = TSI / (pi × sin²(alpha_sun_at_1au))
```

with `alpha` derived from the pinned pck00011 solar radius and exact au.

Atmospheric single scattering uses the same solar irradiance in W/m², so surface and atmosphere are no longer on unrelated brightness scales.

### Observer/display transform

The final display transform is deliberately separate from the physical scene. Its parameter is a **reference radiance** in `W·m⁻²·sr⁻¹`; changing it is analogous to changing an observer/camera response and never changes ephemerides, geometry, radiometry, eclipse state, or atmosphere.

The current mapping is deterministic:

```text
display_linear = 1 - exp(-scene_radiance / reference_radiance)
```

followed by the existing approximate sRGB display encoding.

This is not yet a calibrated camera model. It is an explicit observer transform replacing the previous arbitrary dimensionless exposure multiplier.


### HDR numeric range

The uniform solar disk implied by 1361 W/m², the exact au, and the pck00011 solar radius is roughly 20 MW·m⁻²·sr⁻¹. That exceeds the finite range of binary16. The renderer therefore stores:

```text
stored_radiance = radiance_W_m2_sr / 1000
```

so the solar disk is ~20,032 stored units, below the `rgba16float` maximum 65,504. A 100 W·m⁻²·sr⁻¹ display reference becomes 0.1 stored units. This scale is a numeric representation detail only; it is not an exposure adjustment and does not alter the physical scene.


## External real-kernel validation

`npm run validate:real-kernel` is a development/scientific integrity gate, not a production service and not a GitHub Actions workflow. It compiles the same TypeScript SPK implementation used by the browser, obtains the exact pinned DE442s kernel, verifies its byte length and MD5 using both the project MD5 implementation and Node's independent implementation, then evaluates real Type 2 segments at multiple TDB epochs.

The resulting geometric J2000/ICRF vectors are compared with JPL Horizons for:

- Moon relative to Earth, exercising the Earth-Moon chain;
- Sun relative to Earth, exercising independent center subtraction at solar-system scale;
- Earth relative to the Solar System Barycenter, exercising the barycentric chain directly.

Horizons and the project are not assumed to use the same planetary solution: Horizons currently exposes the DE440/441 family while Universe Model pins DE442s. The declared tolerances are therefore deliberately cross-ephemeris convention gates. They are meant to catch incorrect target/center resolution, axes, units, Chebyshev record selection, derivative scaling, or frame convention. An immutable same-ephemeris CSPICE/Horizons golden fixture remains a stricter future gate.

## Multiscale evidence boundary

The next architecture layer separates scientific sources from rendering. The renderer must not grow source-specific calls such as `getEarthTexture()`, `getCopernicusDem()` or `getGaiaStars()`. Sources adapt into a common evidence contract:

```text
request
(time, position, scale, payload kind)
        |
        v
EvidenceRegistry
        |
        v
EvidenceProvider.coverage()
        |
        v
EvidenceProvider.resolve()
        |
        v
EvidenceResolver
        |
        v
best valid evidence
        |
        v
stream/cache/LOD
        |
        v
WebGPU
```

The first generic payload kinds are terrain, raster, vector, point-cloud, mesh and catalogue tiles. Evidence carries source identity, evidence kind, spatial/temporal resolution, observation epoch when known, reference frame, vertical datum when relevant, uncertainty, licence/attribution, integrity metadata and the payload.

The resolver applies hard compatibility constraints before quality selection. Reference-frame and vertical-datum mismatches are errors, not cosmetic conversion opportunities. Selection order is explicit per query; the default currently considers spatial resolution, temporal distance, uncertainty and source authority.

Temporal distance is deliberately timeline-agnostic. `EvidenceInstant` may carry both the literal UTC label and a caller-supplied monotonic `timelineSeconds` coordinate (for example the project's TAI-based Unix-second axis). The evidence core never normalizes leap-second labels through JavaScript `Date`.

NASA Blue Marble: Next Generation is the first concrete adapter. It is represented as a dated 2004 processed reconstruction with an unverified remote runtime asset, rather than being hard-coded as "the Earth texture".
