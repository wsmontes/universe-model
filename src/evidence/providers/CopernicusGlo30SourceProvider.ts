import type {
  Coverage,
  Evidence,
  EvidenceQuery,
  GeodeticLocation,
} from "../types.js";
import type {
  EvidenceProvider,
} from "../EvidenceProvider.js";
import type {
  CogTerrainSourceAsset,
} from "../../terrain/CogTerrainSourceAsset.js";

export const COPERNICUS_GLO30_AWS_PROVIDER_ID =
  "copernicus-dem-glo30-aws-2021";

export const COPERNICUS_GLO30_HORIZONTAL_FRAME =
  "WGS84-G1150";

export const COPERNICUS_GLO30_VERTICAL_DATUM =
  "EGM2008";

const ROOT =
  "https://copernicus-dem-30m.s3.amazonaws.com";

function clampTileLatitude(
  latitudeDegrees: number,
): number {
  if (latitudeDegrees === 90) {
    return 89;
  }
  return Math.floor(
    latitudeDegrees,
  );
}

function clampTileLongitude(
  longitudeDegrees: number,
): number {
  if (longitudeDegrees === 180) {
    return 179;
  }
  return Math.floor(
    longitudeDegrees,
  );
}

function latitudeToken(
  southDegrees: number,
): string {
  const prefix =
    southDegrees < 0
      ? "S"
      : "N";
  return (
    prefix +
    String(
      Math.abs(southDegrees),
    ).padStart(2, "0") +
    "_00"
  );
}

function longitudeToken(
  westDegrees: number,
): string {
  const prefix =
    westDegrees < 0
      ? "W"
      : "E";
  return (
    prefix +
    String(
      Math.abs(westDegrees),
    ).padStart(3, "0") +
    "_00"
  );
}

function widthForTile(
  southDegrees: number,
): number {
  const centreAbsoluteLatitude =
    Math.abs(
      southDegrees + 0.5,
    );

  if (
    centreAbsoluteLatitude < 50
  ) {
    return 3600;
  }
  if (
    centreAbsoluteLatitude < 60
  ) {
    return 2400;
  }
  if (
    centreAbsoluteLatitude < 70
  ) {
    return 1800;
  }
  if (
    centreAbsoluteLatitude < 80
  ) {
    return 1200;
  }
  if (
    centreAbsoluteLatitude < 85
  ) {
    return 720;
  }
  return 360;
}

function overviewWidths(
  width: number,
): readonly number[] {
  const values: number[] = [];
  let current = width;

  while (
    current > 300 &&
    current % 2 === 0
  ) {
    current /= 2;
    values.push(current);
  }

  return Object.freeze(
    values,
  );
}

export function copernicusGlo30AssetAt(
  location: GeodeticLocation,
): CogTerrainSourceAsset {
  if (
    location.bodyId !== 399
  ) {
    throw new Error(
      "Copernicus GLO-30 is an Earth dataset.",
    );
  }

  if (
    location.referenceFrame !==
    COPERNICUS_GLO30_HORIZONTAL_FRAME
  ) {
    throw new Error(
      `Copernicus GLO-30 tile selection requires ${COPERNICUS_GLO30_HORIZONTAL_FRAME} geodetic coordinates; received ${location.referenceFrame}.`,
    );
  }

  if (
    location.latitudeDegrees < -90 ||
    location.latitudeDegrees > 90 ||
    location.longitudeDegrees < -180 ||
    location.longitudeDegrees > 180
  ) {
    throw new RangeError(
      "Copernicus GLO-30 location must be within geographic latitude/longitude bounds.",
    );
  }

  const south =
    clampTileLatitude(
      location.latitudeDegrees,
    );
  const west =
    clampTileLongitude(
      location.longitudeDegrees,
    );

  const id =
    `Copernicus_DSM_COG_10_${latitudeToken(south)}_${longitudeToken(west)}_DEM`;
  const width =
    widthForTile(south);

  return Object.freeze({
    id,
    bodyId: 399,
    url:
      `${ROOT}/${id}/${id}.tif`,
    format:
      "cloud-optimized-geotiff",
    extent: Object.freeze({
      kind:
        "geodetic-bounds" as const,
      bodyId: 399,
      southLatitudeDegrees:
        south,
      northLatitudeDegrees:
        south + 1,
      westLongitudeDegrees:
        west,
      eastLongitudeDegrees:
        west + 1,
      referenceFrame:
        COPERNICUS_GLO30_HORIZONTAL_FRAME,
      verticalDatum:
        COPERNICUS_GLO30_VERTICAL_DATUM,
    }),
    horizontalCrs:
      "WGS84-G1150 / EPSG:4326 as specified by Copernicus DEM",
    verticalDatum:
      COPERNICUS_GLO30_VERTICAL_DATUM,
    surfaceModel:
      "digital-surface-model",
    sampleRegistration:
      "point",
    sampleType: "float32",
    rasterWidth: width,
    rasterHeight: 3600,
    internalTileWidth: 1024,
    internalTileHeight: 1024,
    compression: "deflate",
    predictor: 3,
    approximateGroundSampleDistanceMeters:
      30,
    overviewWidths:
      overviewWidths(width),
    sourceRelease:
      "Copernicus DEM 2021 GLO-30 Public COG distribution on AWS",
  });
}

export class CopernicusGlo30SourceProvider
  implements EvidenceProvider
{
  readonly id =
    COPERNICUS_GLO30_AWS_PROVIDER_ID;

  readonly payloadKinds =
    ["terrain-source"] as const;

  coverage(
    query: EvidenceQuery,
  ): Coverage {
    if (query.bodyId !== 399) {
      return {
        status: "unavailable",
        reason:
          "Copernicus GLO-30 covers Earth only",
      };
    }

    if (
      query.location?.kind !==
      "geodetic"
    ) {
      return {
        status: "unavailable",
        reason:
          "Copernicus GLO-30 requires a geodetic query location",
      };
    }

    if (
      query.location
        .referenceFrame !==
      COPERNICUS_GLO30_HORIZONTAL_FRAME
    ) {
      return {
        status: "unavailable",
        reason:
          `horizontal transform to ${COPERNICUS_GLO30_HORIZONTAL_FRAME} is required before tile selection`,
      };
    }

    if (
      query.requiredVerticalDatum !==
        undefined &&
      query.requiredVerticalDatum !==
        COPERNICUS_GLO30_VERTICAL_DATUM
    ) {
      return {
        status: "unavailable",
        reason:
          `vertical transform from ${COPERNICUS_GLO30_VERTICAL_DATUM} is required before decoded terrain can satisfy ${query.requiredVerticalDatum}`,
      };
    }

    return {
      status: "available",
    };
  }

  resolve(
    query: EvidenceQuery,
  ): Evidence | null {
    if (
      this.coverage(query).status ===
      "unavailable" ||
      query.location?.kind !==
        "geodetic"
    ) {
      return null;
    }

    const asset =
      copernicusGlo30AssetAt(
        query.location,
      );

    return Object.freeze({
      source: Object.freeze({
        id: this.id,
        name:
          "Copernicus Digital Elevation Model",
        authority: "official",
        product:
          "COP-DEM GLO-30 Public",
        version:
          "2021 AWS COG distribution",
      }),
      spatialExtent:
        asset.extent,
      resolution:
        Object.freeze({
          spatialMeters: 30,
          angularArcSeconds: 1,
        }),
      referenceFrame:
        COPERNICUS_GLO30_HORIZONTAL_FRAME,
      verticalDatum:
        COPERNICUS_GLO30_VERTICAL_DATUM,
      kind: "reconstruction",
      uncertainty:
        Object.freeze({
          verticalMeters: 4,
          description:
            "Product-level absolute vertical accuracy is specified as <4 m at 90% linear error; this is not a per-pixel uncertainty.",
        }),
      license:
        Object.freeze({
          name:
            "Copernicus DEM GLO-30 free licence",
          url:
            "https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM",
        }),
      attribution:
        Object.freeze({
          text:
            "Copernicus WorldDEM-30; DLR/Airbus, provided under Copernicus by the European Union and ESA.",
        }),
      integrity:
        Object.freeze({
          verified: false,
        }),
      payload:
        Object.freeze({
          kind:
            "terrain-source",
          uri: asset.url,
          data: asset,
        }),
    });
  }
}
