import type {
  Vec3d,
} from "../core/Vec3d.js";
import type {
  OblateEllipsoid,
} from "./ReferenceEllipsoid.js";

export interface EllipsoidalGeodeticPosition {
  readonly bodyId: number;
  readonly latitudeDegrees: number;
  readonly longitudeDegrees: number;
  readonly ellipsoidalHeightMeters: number;
  readonly referenceFrame: string;
}

function validateLatitude(
  latitudeDegrees: number,
): void {
  if (
    !Number.isFinite(
      latitudeDegrees,
    ) ||
    latitudeDegrees < -90 ||
    latitudeDegrees > 90
  ) {
    throw new RangeError(
      "Geodetic latitude must be finite and in [-90, 90] degrees.",
    );
  }
}

function validateLongitude(
  longitudeDegrees: number,
): void {
  if (
    !Number.isFinite(
      longitudeDegrees,
    ) ||
    longitudeDegrees < -180 ||
    longitudeDegrees > 180
  ) {
    throw new RangeError(
      "Geodetic longitude must be finite and in [-180, 180] degrees.",
    );
  }
}

function validateHeight(
  heightMeters: number,
): void {
  if (
    !Number.isFinite(
      heightMeters,
    )
  ) {
    throw new RangeError(
      "Ellipsoidal height must be finite.",
    );
  }
}

function validateEllipsoid(
  ellipsoid: OblateEllipsoid,
): void {
  if (
    !Number.isFinite(
      ellipsoid.semiMajorMeters,
    ) ||
    !Number.isFinite(
      ellipsoid.semiMinorMeters,
    ) ||
    ellipsoid.semiMajorMeters <= 0 ||
    ellipsoid.semiMinorMeters <= 0 ||
    ellipsoid.semiMinorMeters >
      ellipsoid.semiMajorMeters
  ) {
    throw new RangeError(
      "Oblate ellipsoid radii must be finite, positive, and semiMinor <= semiMajor.",
    );
  }
}

export function geodeticToBodyFixed(
  ellipsoid: OblateEllipsoid,
  latitudeDegrees: number,
  longitudeDegrees: number,
  ellipsoidalHeightMeters: number,
): Vec3d {
  validateEllipsoid(ellipsoid);
  validateLatitude(
    latitudeDegrees,
  );
  validateLongitude(
    longitudeDegrees,
  );
  validateHeight(
    ellipsoidalHeightMeters,
  );

  const latitude =
    latitudeDegrees *
    Math.PI /
    180;
  const longitude =
    longitudeDegrees *
    Math.PI /
    180;

  const a =
    ellipsoid.semiMajorMeters;
  const b =
    ellipsoid.semiMinorMeters;
  const eccentricitySquared =
    1 -
    (b * b) /
      (a * a);

  const sinLatitude =
    Math.sin(latitude);
  const cosLatitude =
    Math.cos(latitude);
  const primeVerticalRadius =
    a /
    Math.sqrt(
      1 -
        eccentricitySquared *
          sinLatitude *
          sinLatitude,
    );

  const radial =
    (
      primeVerticalRadius +
      ellipsoidalHeightMeters
    ) *
    cosLatitude;

  return Object.freeze({
    x:
      radial *
      Math.cos(longitude),
    y:
      radial *
      Math.sin(longitude),
    z:
      (
        primeVerticalRadius *
          (
            1 -
            eccentricitySquared
          ) +
        ellipsoidalHeightMeters
      ) *
      sinLatitude,
  });
}

export function bodyFixedToGeodetic(
  ellipsoid: OblateEllipsoid,
  position: Vec3d,
): EllipsoidalGeodeticPosition {
  validateEllipsoid(ellipsoid);

  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new RangeError(
      "Body-fixed position must contain finite coordinates.",
    );
  }

  const a =
    ellipsoid.semiMajorMeters;
  const b =
    ellipsoid.semiMinorMeters;
  const p =
    Math.hypot(
      position.x,
      position.y,
    );

  if (
    p === 0 &&
    position.z === 0
  ) {
    throw new Error(
      "Geodetic coordinates are undefined at the ellipsoid center.",
    );
  }

  const longitude =
    Math.atan2(
      position.y,
      position.x,
    );

  if (p < 1e-12) {
    const latitude =
      position.z >= 0
        ? Math.PI / 2
        : -Math.PI / 2;

    return Object.freeze({
      bodyId:
        ellipsoid.bodyId,
      latitudeDegrees:
        latitude *
        180 /
        Math.PI,
      longitudeDegrees: 0,
      ellipsoidalHeightMeters:
        Math.abs(position.z) -
        b,
      referenceFrame:
        ellipsoid.referenceFrame,
    });
  }

  const eccentricitySquared =
    1 -
    (b * b) /
      (a * a);
  const secondEccentricitySquared =
    (a * a - b * b) /
    (b * b);

  const theta =
    Math.atan2(
      position.z * a,
      p * b,
    );
  const sinTheta =
    Math.sin(theta);
  const cosTheta =
    Math.cos(theta);

  const latitude =
    Math.atan2(
      position.z +
        secondEccentricitySquared *
          b *
          sinTheta *
          sinTheta *
          sinTheta,
      p -
        eccentricitySquared *
          a *
          cosTheta *
          cosTheta *
          cosTheta,
    );

  const sinLatitude =
    Math.sin(latitude);
  const cosLatitude =
    Math.cos(latitude);
  const primeVerticalRadius =
    a /
    Math.sqrt(
      1 -
        eccentricitySquared *
          sinLatitude *
          sinLatitude,
    );

  const height =
    Math.abs(cosLatitude) >
      1e-12
      ? p /
          cosLatitude -
        primeVerticalRadius
      : Math.abs(position.z) -
        b;

  return Object.freeze({
    bodyId:
      ellipsoid.bodyId,
    latitudeDegrees:
      latitude *
      180 /
      Math.PI,
    longitudeDegrees:
      longitude *
      180 /
      Math.PI,
    ellipsoidalHeightMeters:
      height,
    referenceFrame:
      ellipsoid.referenceFrame,
  });
}
