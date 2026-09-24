# Physical Integrity Policy

This project explicitly rejects visual conveniences that silently change astronomical reality.

## Forbidden

The production renderer must not:

- enlarge planets or moons to improve visibility;
- compress distances;
- move bodies away from authoritative ephemeris positions;
- add decorative stars;
- use ambient illumination merely to expose dark surfaces;
- invent terrain or cloud state and present it as observed truth;
- replace unknown historical state with procedural state without a visible distinction;
- draw orbital paths as though they were physical objects;
- silently exaggerate atmosphere thickness;
- increase apparent stellar diameter to represent brightness.

## Allowed transformations

A transformation is acceptable when it models an observer or instrument rather than changing the scene itself.

Examples:

- exposure time;
- aperture;
- sensor response;
- eye adaptation;
- wavelength selection;
- telescope field of view;
- scientifically justified tone mapping from radiance to display;
- geometric versus observed/light-time-corrected mode.

These transformations must remain explicit.

## Provenance

Every time-dependent state should eventually carry enough metadata to answer:

- Which dataset produced this value?
- Which kernel/catalog/product version?
- Which reference frame?
- Which time scale?
- Was the state observed, reconstructed, modeled, or unavailable?

Unknown values are preferable to fabricated values.
