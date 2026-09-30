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

### External state-vector validation

The development command `npm run validate:real-kernel` independently re-verifies the pinned DE442s file and evaluates the project's actual Type 2 SPK implementation against live JPL Horizons vector output at multiple TDB epochs. It checks Moon relative to Earth, Sun relative to Earth, and Earth relative to the Solar System Barycenter, including analytic velocity.

This is intentionally described as a **cross-ephemeris** gate: Horizons currently uses DE440/441-family major-body trajectories, while Universe Model pins DE442s. The tolerances are therefore designed to reveal unit, axis, center-chain, record-selection, derivative-scaling, and frame-convention errors, not to claim bitwise equivalence between distinct JPL solutions. An immutable same-ephemeris golden fixture remains a separate pending validation step.

## Surface and stellar data

Earth currently has a separately documented dated BMNG reference surface-color product below. DEM, cloud field, night-light layer, lunar scientific surface color, and stellar catalogue data are not yet part of the physical scene. Each new dataset receives its own provenance record before it can appear.

## Body shape constants

The first body shapes are pinned from NASA/JPL NAIF `pck00011.tpc`:

- Sun `BODY10_RADII = (695700, 695700, 695700) km`
- Earth `BODY399_RADII = (6378.1366, 6378.1366, 6356.7519) km`
- Moon `BODY301_RADII = (1737.4, 1737.4, 1737.4) km`

These are stored in SI meters in `ShapeConstants.ts`. Earth is rendered as the oblate reference ellipsoid when the authoritative ITRF93 binary-PCK orientation is available for the requested epoch.

## High-precision Earth orientation

- Product: `earth_000101_261224_260927.bpc`
- Producer: NASA/JPL NAIF
- Created: 2026-09-27
- Last observed EOP datum: 2026-09-27 00:00 UTC
- Coverage: 2000-01-01 through 2026-12-24 (TDB)
- PCK frame class: `3000`
- Body-fixed frame: `ITRF93`
- Inertial base frame: `ECLIPJ2000`
- Source: `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/earth_000101_261224_260927.bpc`

The exact immutable file name is used instead of the moving `earth_latest_high_prec.bpc` alias so browser caches cannot silently retain a previous orientation solution. The loader computes and surfaces the downloaded file's MD5. Unlike the DE44x planetary SPK manifests, this orientation product currently does not carry a separately pinned expected MD5 in the project.

## High-precision lunar orientation

- Product: `moon_pa_de440_200625.bpc`
- Compatible FK: `moon_de440_250416.tf`
- Producer: NASA/JPL NAIF / JPL Solar System Dynamics
- Coverage: 1549-12-31 through 2650-01-25 (TDB)
- PCK frame class: `31008`
- Frame: `MOON_PA_DE440`
- Generic alias in the current FK: `MOON_PA`
- Inertial base frame: ICRF/J2000
- Source: `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc`

The runtime uses the binary PCK's principal-axis frame directly; it does not approximate lunar orientation with the lower-fidelity `IAU_MOON` text-PCK model.

## Binary PCK integrity

Orientation kernels are fetched only from the official NASA/JPL NAIF endpoint, cached by exact immutable URL, hashed in the browser, and structurally validated as DAF/PCK files. The parser additionally requires the expected frame class to exist before the kernel is accepted by the astronomy worker.

## Lunar orientation numerical reference

The NAIF lunar frames kernel publishes an executable example for 2022-09-30 TDB. It reports ET = 717768000 and the geometric Earth-relative-Moon position in MOON_PA as:

```text
373997.028  -23558.987  10284.057 km
```

Universe Model uses this as a runtime convention/integration check after loading the lunar binary PCK. This specifically exercises the SPK center chain, binary PCK Chebyshev evaluation, 3-1-3 Euler convention, matrix direction, and matrix-vector multiplication together.



## Binary PCK Type 2 angle convention

NAIF Type 2 binary PCK records store Chebyshev coefficients for RA, DEC and W. They are not directly the three 3-1-3 rotation angles. Universe Model converts them as:

```text
ANGLE_1 = pi/2 + RA
ANGLE_2 = pi/2 - DEC
ANGLE_3 = W
R = [ANGLE_3]3 [ANGLE_2]1 [ANGLE_1]3
```

The derivatives follow the same mapping, with the DEC derivative changing sign.


## Reference atmosphere model

The current atmosphere is a model, not a measured instantaneous atmospheric state.

Geometry:
- Earth shape: the pinned `pck00011.tpc` ellipsoid.
- Top altitude: 100 km above each reference-ellipsoid radius.
- NASA describes ~100 km as the conventional atmosphere/space boundary and gives an Earth atmospheric scale height of about 8.5 km.

Radiative-transfer milestone:
- exponential Rayleigh scale height: 8.5 km;
- exponential reference Mie/aerosol scale height: 1.2 km;
- RGB Rayleigh scattering coefficients are declared in `AtmosphereModel.ts`;
- Mie scattering/extinction coefficients and anisotropy are declared in the same file;
- integration is single-scattering only.

The model intentionally contains no fabricated weather, cloud, ozone, aerosol map, or humidity field. Those may only be added from separately identified datasets or explicitly declared physical models.


## Earth reference surface color

- Product: Blue Marble: Next Generation — Base Map
- Producer: NASA Earth Observatory
- Dataset year: 2004
- Runtime resolution: 5400 × 2700 JPEG per calendar month
- Topographic shading: not used; the project selects the Base Map product, not the shaded-topography variants
- Runtime role: dated reference surface color, not current Earth state and not a calibrated BRDF
- Root source: `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/`

The requested UTC month selects the corresponding 2004 monthly composite. The data year remains explicitly surfaced in the product ID and status text.

## Lunar surface-color policy

The NASA SVS CGI Moon Kit is intentionally not used as the scientific lunar surface source. NASA documents that visualization map as being adjusted for human vision and optimized for aesthetics, with filled/inpainted polar coverage. Universe Model will ingest the underlying LROC WAC Hapke-normalized product instead.

The WAC Hapke product is photometrically normalized radiance factor (I/F), covers 70°N to 70°S, and is archived in multiple wavelength bands and a 3-band product. Until that scientific product is wired into the browser pipeline, the Moon remains a uniform physical material.


## Solar irradiance reference

- Reference broadband TSI: 1361 W/m² at 1 au
- Authority: NASA GSFC solar-irradiance program / SORCE-era consensus
- Exact au used by project: 149,597,870,700 m (IAU 2012 definition; JPL SSD)
- Runtime distance law: inverse square using the instantaneous geometric JPL Sun-object distance

NASA notes that TSI is not literally constant: solar activity changes it by roughly 0.1% across the solar cycle, and TSIS-1 reported 1361.6 ± 0.3 W/m² for the 2019 solar minimum. Universe Model currently pins 1361 W/m² as a declared broadband reference and does **not** invent a time-varying solar-activity correction.

The physical Sun radius comes from the project's pinned `pck00011.tpc` body radii. That radius plus the exact au and the reference TSI define the initial uniform solar-disk radiance.

This milestone is broadband. Spectral solar irradiance, limb darkening, wavelength-dependent surface BRDF, and a calibrated sensor spectral response remain separate future layers.

## Evidence-provider representation

The multiscale evidence layer now has its first concrete provider: `EarthBmngEvidenceProvider`.

It wraps the existing NASA Earth Observatory Blue Marble: Next Generation monthly Base Map selection as evidence metadata rather than changing the underlying dataset. The provider declares:

- body: Earth (NAIF 399);
- payload: raster surface evidence;
- reference frame: Earth-fixed ITRF93 for rendering placement;
- evidence kind: processed reconstruction/composite;
- source product: Blue Marble: Next Generation — Base Map;
- dataset epoch: the selected month of 2004;
- runtime remote asset integrity: **not checksum-verified** yet;
- fallback behaviour: unavailable evidence returns control to the resolver/renderer rather than inventing a substitute.

The current 5400×2700 JPEG runtime asset is not relabelled as the native scientific resolution of the source product. A scalar `spatialMeters` value is therefore intentionally omitted until the delivered representation has a formally documented resolution model.
