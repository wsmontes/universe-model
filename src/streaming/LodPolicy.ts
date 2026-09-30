export interface LodView {
  readonly distanceMeters: number;
  readonly viewportHeightPixels: number;
  readonly verticalFovRadians: number;
}

function validateView(
  view: LodView,
): void {
  if (
    !Number.isFinite(
      view.distanceMeters,
    ) ||
    view.distanceMeters <= 0
  ) {
    throw new RangeError(
      "LOD distanceMeters must be finite and > 0.",
    );
  }
  if (
    !Number.isFinite(
      view.viewportHeightPixels,
    ) ||
    view.viewportHeightPixels <= 0
  ) {
    throw new RangeError(
      "LOD viewportHeightPixels must be finite and > 0.",
    );
  }
  if (
    !Number.isFinite(
      view.verticalFovRadians,
    ) ||
    view.verticalFovRadians <= 0 ||
    view.verticalFovRadians >= Math.PI
  ) {
    throw new RangeError(
      "LOD verticalFovRadians must be finite and in (0, pi).",
    );
  }
}

function validateError(
  meters: number,
): void {
  if (
    !Number.isFinite(meters) ||
    meters < 0
  ) {
    throw new RangeError(
      "LOD geometric error must be finite and >= 0.",
    );
  }
}

export function metersPerPixelAtDistance(
  view: LodView,
): number {
  validateView(view);

  const visibleHeightMeters =
    2 *
    view.distanceMeters *
    Math.tan(
      view.verticalFovRadians / 2,
    );

  return (
    visibleHeightMeters /
    view.viewportHeightPixels
  );
}

export function screenSpaceErrorPixels(
  geometricErrorMeters: number,
  view: LodView,
): number {
  validateError(
    geometricErrorMeters,
  );
  return (
    geometricErrorMeters /
    metersPerPixelAtDistance(view)
  );
}

export function targetGeometricErrorMeters(
  view: LodView,
  maximumScreenSpaceErrorPixels:
    number,
): number {
  if (
    !Number.isFinite(
      maximumScreenSpaceErrorPixels,
    ) ||
    maximumScreenSpaceErrorPixels <= 0
  ) {
    throw new RangeError(
      "maximumScreenSpaceErrorPixels must be finite and > 0.",
    );
  }

  return (
    metersPerPixelAtDistance(view) *
    maximumScreenSpaceErrorPixels
  );
}

export function shouldRefineLod(
  geometricErrorMeters: number,
  view: LodView,
  maximumScreenSpaceErrorPixels:
    number,
): boolean {
  return (
    screenSpaceErrorPixels(
      geometricErrorMeters,
      view,
    ) >
    maximumScreenSpaceErrorPixels
  );
}
