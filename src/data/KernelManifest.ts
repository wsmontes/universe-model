export interface KernelSource {
  readonly url: string;
  readonly label: string;
  readonly authority: "NASA/JPL NAIF" | "mirror" | "GitHub mirror";
}

export interface PlanetaryKernelManifest {
  readonly id: "de442s" | "de440s";
  readonly displayName: string;
  readonly expectedBytes: number;
  readonly expectedMd5: string;
  readonly coverage: readonly [string, string];
  readonly sources: readonly KernelSource[];
}

const NAIF_ROOT = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets";

export const DE442S: PlanetaryKernelManifest = Object.freeze({
  id: "de442s",
  displayName: "JPL DE442s",
  expectedBytes: 32_701_440,
  expectedMd5: "cc49327e06088124c0e39d8dde9f0b58",
  coverage: ["1849-12-26T00:00:00 TDB", "2150-01-22T00:00:00 TDB"] as const,
  sources: Object.freeze([
    Object.freeze({
      url: `${NAIF_ROOT}/de442s.bsp`,
      label: "NASA/JPL NAIF official",
      authority: "NASA/JPL NAIF" as const,
    }),
  ]),
});

export const DE440S: PlanetaryKernelManifest = Object.freeze({
  id: "de440s",
  displayName: "JPL DE440s",
  expectedBytes: 32_726_016,
  expectedMd5: "3917ee56769db332790c751e2168843d",
  coverage: ["1849-12-26T00:00:00 TDB", "2150-01-22T00:00:00 TDB"] as const,
  sources: Object.freeze([
    Object.freeze({
      url: `${NAIF_ROOT}/de440s.bsp`,
      label: "NASA/JPL NAIF official",
      authority: "NASA/JPL NAIF" as const,
    }),
    Object.freeze({
      url: "https://raw.githubusercontent.com/esa/pykep/8c058d75f65ec37a22e4f47bf8991d2687ce8f01/pykep/data/de440s.bsp",
      label: "ESA pykep pinned GitHub copy (checksum verified)",
      authority: "GitHub mirror" as const,
    }),
  ]),
});

export const PLANETARY_KERNELS = Object.freeze([DE442S, DE440S] as const);
