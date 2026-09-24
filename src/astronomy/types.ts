import type { Vec3d } from "../core/Vec3d";

export interface Epoch {
  /** Human-readable input/output timestamp. Physics providers may convert this internally to TDB/ET. */
  readonly isoUtc: string;
}

export interface AstronomicalProvenance {
  readonly provider: string;
  readonly dataset: string;
  readonly referenceFrame: string;
}

export interface CelestialState {
  /** Absolute position in meters in the declared reference frame. */
  readonly positionMeters: Vec3d;
  /** Absolute velocity in meters per second in the declared reference frame. */
  readonly velocityMetersPerSecond: Vec3d;
  readonly provenance: AstronomicalProvenance;
}

export type CelestialBodyId = number;
