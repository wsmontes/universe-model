import type {
  GeodeticBoundsExtent,
} from "../evidence/types.js";

export interface CogTerrainSourceAsset {
  readonly id: string;
  readonly bodyId: number;
  readonly url: string;
  readonly format:
    "cloud-optimized-geotiff";
  readonly extent:
    GeodeticBoundsExtent;
  readonly horizontalCrs: string;
  readonly verticalDatum: string;
  readonly surfaceModel:
    "digital-surface-model"
    | "digital-terrain-model"
    | "bathymetric-terrain-model";
  readonly sampleRegistration:
    "point" | "area";
  readonly sampleType:
    "float32"
    | "int16"
    | "int32";
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly internalTileWidth:
    number;
  readonly internalTileHeight:
    number;
  readonly compression:
    "deflate" | "none";
  readonly predictor?: number;
  readonly approximateGroundSampleDistanceMeters?:
    number;
  readonly overviewWidths:
    readonly number[];
  readonly sourceRelease: string;
}

export function isCogTerrainSourceAsset(
  value: unknown,
): value is CogTerrainSourceAsset {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const asset =
    value as Partial<CogTerrainSourceAsset>;

  return (
    typeof asset.id === "string" &&
    typeof asset.bodyId === "number" &&
    typeof asset.url === "string" &&
    asset.format ===
      "cloud-optimized-geotiff" &&
    typeof asset.horizontalCrs ===
      "string" &&
    typeof asset.verticalDatum ===
      "string" &&
    typeof asset.rasterWidth ===
      "number" &&
    typeof asset.rasterHeight ===
      "number" &&
    typeof asset.internalTileWidth ===
      "number" &&
    typeof asset.internalTileHeight ===
      "number" &&
    Array.isArray(
      asset.overviewWidths,
    ) &&
    typeof asset.extent ===
      "object" &&
    asset.extent !== null
  );
}
