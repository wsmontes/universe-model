const PCK_ROOT = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck";

export const EARTH_ITRF93_20260927 = Object.freeze({
  id: "earth-itrf93-20260927",
  displayName: "Earth ITRF93 high-precision PCK (2026-09-27)",
  url: PCK_ROOT + "/earth_000101_261224_260927.bpc",
  bodyId: 399,
  frameClassId: 3000,
  frameName: "ITRF93",
  baseFrameName: "ECLIPJ2000",
  authority: "NASA/JPL NAIF",
  coverage: [
    "2000-01-01T00:01:04.183 TDB",
    "2026-12-24T00:01:09.183 TDB",
  ],
  lastObservedDatumUtc: "2026-09-27T00:00:00Z",
  quality: "NAIF high-precision EOP-derived Earth orientation; several microradians or better within stated applicability",
});

export const MOON_PA_DE440 = Object.freeze({
  id: "moon-pa-de440-200625",
  displayName: "Moon DE440 Principal Axes PCK",
  url: PCK_ROOT + "/moon_pa_de440_200625.bpc",
  bodyId: 301,
  frameClassId: 31008,
  frameName: "MOON_PA_DE440",
  baseFrameName: "J2000/ICRF",
  authority: "NASA/JPL NAIF",
  coverage: [
    "1549-12-31T00:00:00 TDB",
    "2650-01-25T00:00:00 TDB",
  ],
  quality: "High-accuracy lunar principal-axis orientation from JPL DE440",
});

export const ORIENTATION_KERNELS = Object.freeze([
  EARTH_ITRF93_20260927,
  MOON_PA_DE440,
]);
