import {
  utcCalendarMonthIndex,
} from "../../astronomy/time/UtcTimeline.js";
import type {
  EvidenceProvider,
} from "../EvidenceProvider.js";
import type {
  Coverage,
  Evidence,
  EvidenceQuery,
} from "../types.js";
import type {
  SurfaceRasterAsset,
} from "../SurfaceRasterAsset.js";

export const EARTH_BMNG_PROVIDER_ID =
  "nasa-earth-bmng-2004";

const BMNG_ROOT =
  "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base";

const MONTH_NAMES = Object.freeze([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const);

function earthBmngAssetForUtc(
  isoUtc: string,
): SurfaceRasterAsset {
  const monthIndex =
    utcCalendarMonthIndex(isoUtc);
  const monthNumber =
    String(monthIndex + 1).padStart(
      2,
      "0",
    );
  const monthName =
    MONTH_NAMES[monthIndex];

  if (!monthName) {
    throw new Error(
      `Unsupported calendar month index ${monthIndex}.`,
    );
  }

  return Object.freeze({
    id:
      `earth-bmng-base-2004-${monthNumber}`,
    bodyId: 399,
    displayName:
      `Earth Blue Marble Next Generation base map · ${monthName} 2004`,
    url:
      `${BMNG_ROOT}/${monthName}/world.2004${monthNumber}.3x5400x2700.jpg`,
    dataEpoch: `2004-${monthNumber}`,
    validLatitudeDegrees:
      [-90, 90] as const,
    note:
      "Cloud-minimized monthly 2004 surface composite without topographic-shading product. It is a dated reference surface, not live Earth imagery or a radiometrically calibrated BRDF.",
  });
}

export class EarthBmngEvidenceProvider
  implements EvidenceProvider
{
  readonly id =
    EARTH_BMNG_PROVIDER_ID;

  readonly payloadKinds =
    ["raster-tile"] as const;

  coverage(
    query: EvidenceQuery,
  ): Coverage {
    if (query.bodyId !== 399) {
      return {
        status: "unavailable",
        reason:
          "BMNG reference surface color covers Earth only",
      };
    }

    if (!query.epoch) {
      return {
        status: "unavailable",
        reason:
          "BMNG monthly composite selection requires a requested UTC epoch",
      };
    }

    if (
      query.requiredReferenceFrame !==
        undefined &&
      query.requiredReferenceFrame !==
        "ITRF93"
    ) {
      return {
        status: "unavailable",
        reason:
          `BMNG surface evidence is Earth-fixed; requested frame is ${query.requiredReferenceFrame}`,
      };
    }

    if (
      query.requiredVerticalDatum !==
      undefined
    ) {
      return {
        status: "unavailable",
        reason:
          "surface color evidence has no vertical datum",
      };
    }

    if (
      query.acceptableEvidenceKinds !==
        undefined &&
      !query.acceptableEvidenceKinds.includes(
        "reconstruction",
      )
    ) {
      return {
        status: "unavailable",
        reason:
          "BMNG monthly base map is a processed reconstruction/composite",
      };
    }

    return { status: "available" };
  }

  resolve(
    query: EvidenceQuery,
  ): Evidence | null {
    if (
      this.coverage(query).status ===
      "unavailable"
    ) {
      return null;
    }

    const epoch = query.epoch;
    if (!epoch) return null;

    const asset =
      earthBmngAssetForUtc(
        epoch.utcIso,
      );

    const monthIndex =
      Number(asset.dataEpoch.slice(5, 7)) - 1;
    const nextMonthIndex =
      (monthIndex + 1) % 12;
    const nextMonthYear =
      nextMonthIndex === 0 ? 2005 : 2004;
    const month =
      String(monthIndex + 1).padStart(2, "0");
    const nextMonth =
      String(nextMonthIndex + 1).padStart(2, "0");

    return Object.freeze({
      source: Object.freeze({
        id: this.id,
        name:
          "NASA Earth Observatory",
        authority: "official",
        product:
          "Blue Marble: Next Generation — Base Map",
        version:
          "2004 monthly composite",
      }),
      spatialExtent:
        Object.freeze({
          bodyId: 399,
          latitudeDegrees:
            asset.validLatitudeDegrees,
          longitudeDegrees:
            [-180, 180] as const,
        }),
      temporalExtent:
        Object.freeze({
          start:
            Object.freeze({
              utcIso:
                `2004-${month}-01T00:00:00Z`,
            }),
          end:
            Object.freeze({
              utcIso:
                `${nextMonthYear}-${nextMonth}-01T00:00:00Z`,
            }),
        }),
      resolution:
        Object.freeze({}),
      referenceFrame: "ITRF93",
      kind: "reconstruction",
      license:
        Object.freeze({
          name:
            "not yet encoded in project metadata",
        }),
      attribution:
        Object.freeze({
          text:
            "NASA Earth Observatory — Blue Marble: Next Generation",
        }),
      integrity:
        Object.freeze({
          verified: false,
          immutableId: asset.id,
        }),
      payload:
        Object.freeze({
          kind: "raster-tile",
          uri: asset.url,
          data: asset,
        }),
    });
  }
}
