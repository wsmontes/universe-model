# Physical Integrity Policy

This project rejects visual conveniences that silently change astronomical reality.

## Forbidden

The production renderer must not:

- enlarge planets or moons to improve visibility;
- compress astronomical distances;
- move bodies away from authoritative ephemeris positions;
- add decorative stars;
- use ambient illumination merely to expose dark surfaces;
- invent terrain, clouds, or historical state and present them as observed truth;
- silently extrapolate an ephemeris outside its coverage;
- draw orbit guides as if they were physical objects;
- silently exaggerate atmosphere thickness;
- increase stellar angular diameter to encode brightness;
- map a geographic texture using an approximate or invented body orientation.

## Allowed observer transformations

A transformation is acceptable when it models an observer or instrument instead of changing the scene:

- exposure time;
- aperture;
- sensor response;
- eye adaptation;
- wavelength selection;
- telescope field of view;
- a declared radiance-to-display transform;
- geometric versus light-time/aberration-corrected observation mode.

Navigation may teleport or move the camera. It may not move the astronomical bodies.

## Provenance

Every time-dependent state should answer:

- Which dataset produced it?
- Which kernel and checksum?
- Which source delivered the kernel?
- Which reference frame and center?
- Which time scale?
- Is the state geometric, observed, reconstructed, modeled, or unavailable?

The first live milestone surfaces this information in the UI for the active ephemeris.

Unknown values are preferable to fabricated values.

## Multiscale evidence rules

The evidence system adds two rules to the existing "unknown is preferable to fabricated" principle:

- **Lower-resolution truth is preferable to higher-resolution invention.**
- **An older identified observation is preferable to an undated synthetic representation.**

A provider must not silently promote source resolution, invent missing geometry, hide a temporal mismatch, or convert an inferred/modelled value into a measurement. If two datasets overlap, selection must be driven by declared evidence metadata such as coverage, spatial resolution, temporal correspondence, uncertainty, reference frame, datum and source authority.

Temporal comparison is never derived with JavaScript `Date` inside the resolver. When temporal ordering matters, the caller/provider supplies a continuous comparison coordinate on a declared timeline so leap-second semantics remain outside the generic evidence layer and can continue to use the project's NAIF-derived time model.
