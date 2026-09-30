import type { Vec3d } from "../../core/Vec3d.js";
import {
  add,
  cross,
  dot,
  magnitude,
  normalize,
  scale,
  subtract,
} from "../../core/Vec3d.js";
import { SPEED_OF_LIGHT_KM_PER_SECOND } from "../../core/units.js";

export type AberrationCorrection =
  | "NONE"
  | "LT"
  | "CN"
  | "LT+S"
  | "CN+S";

export interface EphemerisStateKm {
  readonly positionKm: Vec3d;
  readonly velocityKmPerSecond: Vec3d;
}

export interface EphemerisStateSourceKm {
  state(
    target: number,
    center: number,
    etSeconds: number,
  ): EphemerisStateKm;
}

export interface ObservedStateKm extends EphemerisStateKm {
  readonly observerBodyId: number;
  readonly targetBodyId: number;
  readonly observationEtSeconds: number;
  readonly emissionEtSeconds: number;
  readonly lightTimeSeconds: number;
  readonly correction: AberrationCorrection;
}

interface ApparentPositionResult {
  readonly relativePositionKm: Vec3d;
  readonly lightTimeSeconds: number;
  readonly emissionEtSeconds: number;
}

function includesLightTime(
  correction: AberrationCorrection,
): boolean {
  return correction !== "NONE";
}

function includesStellarAberration(
  correction: AberrationCorrection,
): boolean {
  return correction.endsWith("+S");
}

function lightTimeIterations(
  correction: AberrationCorrection,
): number {
  return correction === "CN" || correction === "CN+S" ? 3 : 1;
}

export function applyStellarAberration(
  relativePositionKm: Vec3d,
  observerVelocityKmPerSecond: Vec3d,
): Vec3d {
  const range = magnitude(relativePositionKm);
  const speed = magnitude(observerVelocityKmPerSecond);
  if (!(range > 0) || !(speed > 0)) {
    return relativePositionKm;
  }

  const axisVector = cross(
    relativePositionKm,
    observerVelocityKmPerSecond,
  );
  const axisMagnitude = magnitude(axisVector);
  if (!(axisMagnitude > 0)) {
    return relativePositionKm;
  }

  const sinW = Math.min(
    1,
    axisMagnitude / (range * speed),
  );
  const sinPhi = Math.min(
    1,
    (speed * sinW) / SPEED_OF_LIGHT_KM_PER_SECOND,
  );
  const phi = Math.asin(sinPhi);
  if (phi === 0) {
    return relativePositionKm;
  }

  const axis = normalize(axisVector);
  const cosPhi = Math.cos(phi);
  const sinPhiActual = Math.sin(phi);

  return add(
    add(
      scale(relativePositionKm, cosPhi),
      scale(cross(axis, relativePositionKm), sinPhiActual),
    ),
    scale(
      axis,
      dot(axis, relativePositionKm) * (1 - cosPhi),
    ),
  );
}

function apparentPosition(
  source: EphemerisStateSourceKm,
  targetBodyId: number,
  observerBodyId: number,
  observationEtSeconds: number,
  correction: AberrationCorrection,
): ApparentPositionResult {
  if (!includesLightTime(correction)) {
    return {
      relativePositionKm: source.state(
        targetBodyId,
        observerBodyId,
        observationEtSeconds,
      ).positionKm,
      lightTimeSeconds: 0,
      emissionEtSeconds: observationEtSeconds,
    };
  }

  const observer = source.state(
    observerBodyId,
    0,
    observationEtSeconds,
  );
  let emissionEtSeconds = observationEtSeconds;
  let relativePositionKm = subtract(
    source.state(targetBodyId, 0, emissionEtSeconds).positionKm,
    observer.positionKm,
  );
  let lightTimeSeconds =
    magnitude(relativePositionKm) /
    SPEED_OF_LIGHT_KM_PER_SECOND;

  for (
    let i = 0;
    i < lightTimeIterations(correction);
    i += 1
  ) {
    emissionEtSeconds =
      observationEtSeconds - lightTimeSeconds;
    relativePositionKm = subtract(
      source.state(targetBodyId, 0, emissionEtSeconds).positionKm,
      observer.positionKm,
    );
    lightTimeSeconds =
      magnitude(relativePositionKm) /
      SPEED_OF_LIGHT_KM_PER_SECOND;
  }

  if (includesStellarAberration(correction)) {
    relativePositionKm = applyStellarAberration(
      relativePositionKm,
      observer.velocityKmPerSecond,
    );
  }

  return {
    relativePositionKm,
    lightTimeSeconds,
    emissionEtSeconds,
  };
}

export function observedState(
  source: EphemerisStateSourceKm,
  targetBodyId: number,
  observerBodyId: number,
  observationEtSeconds: number,
  correction: AberrationCorrection = "CN+S",
): ObservedStateKm {
  if (correction === "NONE") {
    const geometric = source.state(
      targetBodyId,
      observerBodyId,
      observationEtSeconds,
    );
    return Object.freeze({
      ...geometric,
      observerBodyId,
      targetBodyId,
      observationEtSeconds,
      emissionEtSeconds: observationEtSeconds,
      lightTimeSeconds: 0,
      correction,
    });
  }

  const center = apparentPosition(
    source,
    targetBodyId,
    observerBodyId,
    observationEtSeconds,
    correction,
  );

  const derivativeStepSeconds = 0.5;
  const before = apparentPosition(
    source,
    targetBodyId,
    observerBodyId,
    observationEtSeconds - derivativeStepSeconds,
    correction,
  );
  const after = apparentPosition(
    source,
    targetBodyId,
    observerBodyId,
    observationEtSeconds + derivativeStepSeconds,
    correction,
  );

  return Object.freeze({
    positionKm: center.relativePositionKm,
    velocityKmPerSecond: scale(
      subtract(
        after.relativePositionKm,
        before.relativePositionKm,
      ),
      1 / (2 * derivativeStepSeconds),
    ),
    observerBodyId,
    targetBodyId,
    observationEtSeconds,
    emissionEtSeconds: center.emissionEtSeconds,
    lightTimeSeconds: center.lightTimeSeconds,
    correction,
  });
}
