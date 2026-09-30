import {
  pckRadii,
} from "../astronomy/pck/ShapeConstants.js";

export interface OblateEllipsoid {
  readonly bodyId: number;
  readonly referenceFrame: string;
  readonly semiMajorMeters: number;
  readonly semiMinorMeters: number;
  readonly source: string;
}

export function oblateEllipsoidFromPck(
  bodyId: number,
  referenceFrame: string,
): OblateEllipsoid {
  const radii =
    pckRadii(bodyId);

  if (
    Math.abs(
      radii.xMeters -
      radii.yMeters,
    ) > 1e-6
  ) {
    throw new Error(
      `Body ${bodyId} pck00011 radii are triaxial; the oblate geodetic service requires x=y.`,
    );
  }

  if (
    !referenceFrame.trim()
  ) {
    throw new Error(
      "Ellipsoid reference frame must not be empty.",
    );
  }

  return Object.freeze({
    bodyId,
    referenceFrame,
    semiMajorMeters:
      radii.xMeters,
    semiMinorMeters:
      radii.zMeters,
    source: radii.source,
  });
}

export const EARTH_PCK00011_ELLIPSOID =
  oblateEllipsoidFromPck(
    399,
    "ITRF93",
  );
