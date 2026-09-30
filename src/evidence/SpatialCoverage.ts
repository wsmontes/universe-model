import type {
  GeodeticBoundsExtent,
  GeodeticLocation,
  SpatialExtent,
  SpatialLocation,
} from "./types.js";

export type SpatialContainment =
  | "contains"
  | "outside"
  | "indeterminate";

function assertLatitude(
  value: number,
  label: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < -90 ||
    value > 90
  ) {
    throw new RangeError(
      `${label} must be a finite latitude in [-90, 90] degrees.`,
    );
  }
}

function assertLongitude(
  value: number,
  label: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < -180 ||
    value > 180
  ) {
    throw new RangeError(
      `${label} must be a finite longitude in [-180, 180] degrees.`,
    );
  }
}

function validateGeodeticLocation(
  location: GeodeticLocation,
): void {
  assertLatitude(
    location.latitudeDegrees,
    "location latitude",
  );
  assertLongitude(
    location.longitudeDegrees,
    "location longitude",
  );
  if (
    location.heightMeters !== undefined &&
    !Number.isFinite(location.heightMeters)
  ) {
    throw new RangeError(
      "location height must be finite when supplied.",
    );
  }
}

function validateGeodeticBounds(
  extent: GeodeticBoundsExtent,
): void {
  assertLatitude(
    extent.southLatitudeDegrees,
    "south latitude",
  );
  assertLatitude(
    extent.northLatitudeDegrees,
    "north latitude",
  );
  assertLongitude(
    extent.westLongitudeDegrees,
    "west longitude",
  );
  assertLongitude(
    extent.eastLongitudeDegrees,
    "east longitude",
  );
  if (
    extent.southLatitudeDegrees >
    extent.northLatitudeDegrees
  ) {
    throw new RangeError(
      "south latitude must not exceed north latitude.",
    );
  }
}

function longitudeInside(
  longitudeDegrees: number,
  westDegrees: number,
  eastDegrees: number,
): boolean {
  if (westDegrees <= eastDegrees) {
    return (
      longitudeDegrees >= westDegrees &&
      longitudeDegrees <= eastDegrees
    );
  }

  // west > east explicitly represents a footprint that crosses
  // the antimeridian, for example 170°E .. 170°W.
  return (
    longitudeDegrees >= westDegrees ||
    longitudeDegrees <= eastDegrees
  );
}

export function spatialContainment(
  extent: SpatialExtent,
  location: SpatialLocation,
): SpatialContainment {
  if (extent.bodyId !== location.bodyId) {
    return "outside";
  }

  if (extent.kind === "global-body") {
    return "contains";
  }

  if (location.kind !== "geodetic") {
    return "indeterminate";
  }

  validateGeodeticBounds(extent);
  validateGeodeticLocation(location);

  if (
    extent.referenceFrame !==
    location.referenceFrame
  ) {
    return "outside";
  }

  if (
    extent.verticalDatum !== undefined &&
    location.verticalDatum !== undefined &&
    extent.verticalDatum !==
      location.verticalDatum
  ) {
    return "outside";
  }

  const latitudeInside =
    location.latitudeDegrees >=
      extent.southLatitudeDegrees &&
    location.latitudeDegrees <=
      extent.northLatitudeDegrees;

  if (!latitudeInside) {
    return "outside";
  }

  return longitudeInside(
    location.longitudeDegrees,
    extent.westLongitudeDegrees,
    extent.eastLongitudeDegrees,
  )
    ? "contains"
    : "outside";
}
