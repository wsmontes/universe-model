import type { Vec3d } from "../core/Vec3d.js";

export interface Epoch {
  readonly isoUtc: string;
}

export interface AstronomicalProvenance {
  readonly provider: "JPL-SPK";
  readonly dataset: string;
  readonly kernelMd5: string;
  readonly kernelSource: string;
  readonly referenceFrame: "J2000";
  readonly center: "SSB";
  readonly timeScale: "TDB/ET";
  readonly computationMode: "geometric";
}

export interface CelestialState {
  readonly bodyId: number;
  readonly epochUtc: string;
  readonly etSecondsPastJ2000: number;
  readonly positionMeters: Vec3d;
  readonly velocityMetersPerSecond: Vec3d;
  readonly provenance: AstronomicalProvenance;
}

export type CelestialBodyId = number;
