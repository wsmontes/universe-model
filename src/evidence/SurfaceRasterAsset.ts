export interface SurfaceRasterAsset {
  readonly id: string;
  readonly bodyId: number;
  readonly displayName: string;
  readonly url: string;
  readonly dataEpoch: string;
  readonly validLatitudeDegrees:
    readonly [number, number];
  readonly note: string;
}

export function isSurfaceRasterAsset(
  value: unknown,
): value is SurfaceRasterAsset {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const asset =
    value as Partial<SurfaceRasterAsset>;

  return (
    typeof asset.id === "string" &&
    typeof asset.bodyId === "number" &&
    typeof asset.displayName ===
      "string" &&
    typeof asset.url === "string" &&
    typeof asset.dataEpoch ===
      "string" &&
    Array.isArray(
      asset.validLatitudeDegrees,
    ) &&
    asset.validLatitudeDegrees.length ===
      2 &&
    asset.validLatitudeDegrees.every(
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value),
    ) &&
    typeof asset.note === "string"
  );
}
