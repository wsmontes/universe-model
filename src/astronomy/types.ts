import type { Vec3d } from "../core/Vec3d.js";
import type { Matrix3 } from "./frames/Matrix3.js";
import type { AberrationCorrection } from "./observation/Aberration.js";

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

export interface ObservedProvenance {
  readonly provider: "JPL-SPK";
  readonly dataset: string;
  readonly kernelMd5: string;
  readonly kernelSource: string;
  readonly referenceFrame: "J2000";
  readonly observerBodyId: number;
  readonly timeScale: "TDB/ET";
  readonly computationMode: "observed";
  readonly correction: AberrationCorrection;
  readonly velocityMethod: "central-difference-corrected-position";
}

export interface OrientationProvenance {
  readonly provider: "NAIF-BINARY-PCK";
  readonly dataset: string;
  readonly kernelMd5: string;
  readonly kernelSource: string;
  readonly frameName: string;
  readonly baseFrameName: string;
  readonly quality: string;
}

export interface BodyOrientation {
  readonly bodyFixedToJ2000: Matrix3;
  readonly j2000ToBodyFixed: Matrix3;
  readonly frameClassId: number;
  readonly baseFrameId: number;
  readonly provenance: OrientationProvenance;
}

export interface CelestialState {
  readonly bodyId: number;
  readonly epochUtc: string;
  readonly etSecondsPastJ2000: number;
  readonly positionMeters: Vec3d;
  readonly velocityMetersPerSecond: Vec3d;
  readonly provenance: AstronomicalProvenance;
  readonly orientation?: BodyOrientation;
  readonly orientationUnavailableReason?: string;
}

export interface ObservedCelestialState {
  readonly targetBodyId: number;
  readonly observerBodyId: number;
  readonly epochUtc: string;
  readonly observationEtSecondsPastJ2000: number;
  readonly emissionEtSecondsPastJ2000: number;
  readonly lightTimeSeconds: number;
  readonly relativePositionMeters: Vec3d;
  readonly relativeVelocityMetersPerSecond: Vec3d;
  readonly provenance: ObservedProvenance;
  readonly orientation?: BodyOrientation;
  readonly orientationUnavailableReason?: string;
}

export type CelestialBodyId = number;
