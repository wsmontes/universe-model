const NAIF_ROOT = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets";
export const DE442S = Object.freeze({
    id: "de442s",
    displayName: "JPL DE442s",
    expectedBytes: 32_701_440,
    expectedMd5: "cc49327e06088124c0e39d8dde9f0b58",
    coverage: ["1849-12-26T00:00:00 TDB", "2150-01-22T00:00:00 TDB"],
    sources: Object.freeze([
        Object.freeze({
            url: `${NAIF_ROOT}/de442s.bsp`,
            label: "NASA/JPL NAIF official",
            authority: "NASA/JPL NAIF",
        }),
    ]),
});
export const DE440S = Object.freeze({
    id: "de440s",
    displayName: "JPL DE440s",
    expectedBytes: 32_726_016,
    expectedMd5: "3917ee56769db332790c751e2168843d",
    coverage: ["1849-12-26T00:00:00 TDB", "2150-01-22T00:00:00 TDB"],
    sources: Object.freeze([
        Object.freeze({
            url: `${NAIF_ROOT}/de440s.bsp`,
            label: "NASA/JPL NAIF official",
            authority: "NASA/JPL NAIF",
        }),
        Object.freeze({
            url: "https://raw.githubusercontent.com/esa/pykep/8c058d75f65ec37a22e4f47bf8991d2687ce8f01/pykep/data/de440s.bsp",
            label: "ESA pykep pinned GitHub copy (checksum verified)",
            authority: "GitHub mirror",
        }),
    ]),
});
export const PLANETARY_KERNELS = Object.freeze([DE442S, DE440S]);
