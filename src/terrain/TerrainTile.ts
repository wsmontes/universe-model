import type {
  GeodeticBoundsExtent,
} from "../evidence/types.js";

/**
 * Terrain samples are row-major. Row 0 is the north edge, the last row is
 * the south edge. Column 0 is the west edge and the last column is the east
 * edge. Provider adapters must normalize source rasters to this convention.
 */
export interface TerrainTile {
  readonly id: string;
  readonly bodyId: number;
  readonly extent:
    GeodeticBoundsExtent;
  readonly referenceFrame: string;
  readonly verticalDatum: string;
  readonly geometricErrorMeters: number;
  readonly width: number;
  readonly height: number;
  readonly elevationsMeters:
    Float32Array | Float64Array;
  readonly noDataValue?: number;
}

export function validateTerrainTile(
  tile: TerrainTile,
): void {
  if (!tile.id.trim()) {
    throw new Error(
      "Terrain tile ID must not be empty.",
    );
  }

  if (
    tile.extent.bodyId !==
      tile.bodyId
  ) {
    throw new Error(
      `Terrain tile body ${tile.bodyId} conflicts with extent body ${tile.extent.bodyId}.`,
    );
  }

  if (
    tile.extent.referenceFrame !==
      tile.referenceFrame
  ) {
    throw new Error(
      `Terrain tile frame ${tile.referenceFrame} conflicts with extent frame ${tile.extent.referenceFrame}.`,
    );
  }

  if (
    tile.extent.verticalDatum !==
      undefined &&
    tile.extent.verticalDatum !==
      tile.verticalDatum
  ) {
    throw new Error(
      `Terrain tile datum ${tile.verticalDatum} conflicts with extent datum ${tile.extent.verticalDatum}.`,
    );
  }

  if (
    !Number.isFinite(
      tile.geometricErrorMeters,
    ) ||
    tile.geometricErrorMeters < 0
  ) {
    throw new RangeError(
      "Terrain tile geometric error must be finite and >= 0.",
    );
  }

  if (
    !Number.isInteger(tile.width) ||
    !Number.isInteger(tile.height) ||
    tile.width < 2 ||
    tile.height < 2
  ) {
    throw new RangeError(
      "Terrain tile width and height must be integers >= 2.",
    );
  }

  const expected =
    tile.width *
    tile.height;
  if (
    tile.elevationsMeters.length !==
      expected
  ) {
    throw new Error(
      `Terrain tile elevation grid has ${tile.elevationsMeters.length} samples; expected ${expected}.`,
    );
  }

  if (
    tile.noDataValue !== undefined &&
    !Number.isFinite(
      tile.noDataValue,
    )
  ) {
    throw new RangeError(
      "Terrain tile noDataValue must be finite when supplied.",
    );
  }
}

export function terrainSampleIsValid(
  tile: TerrainTile,
  value: number,
): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }
  return (
    tile.noDataValue ===
      undefined ||
    value !==
      tile.noDataValue
  );
}

export function isTerrainTile(
  value: unknown,
): value is TerrainTile {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const candidate =
    value as Partial<TerrainTile>;

  return (
    typeof candidate.id ===
      "string" &&
    typeof candidate.bodyId ===
      "number" &&
    typeof candidate.referenceFrame ===
      "string" &&
    typeof candidate.verticalDatum ===
      "string" &&
    typeof candidate.geometricErrorMeters ===
      "number" &&
    typeof candidate.width ===
      "number" &&
    typeof candidate.height ===
      "number" &&
    (
      candidate.elevationsMeters instanceof
        Float32Array ||
      candidate.elevationsMeters instanceof
        Float64Array
    ) &&
    typeof candidate.extent ===
      "object" &&
    candidate.extent !== null
  );
}
