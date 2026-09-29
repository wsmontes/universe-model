import { utcCalendarMonthIndex } from "../astronomy/time/UtcTimeline.js";

export interface SurfaceTextureAsset {
  readonly id: string;
  readonly bodyId: number;
  readonly displayName: string;
  readonly url: string;
  readonly authority: string;
  readonly product: string;
  readonly dataEpoch: string;
  readonly role: "reference-surface-color";
  readonly validLatitudeDegrees: readonly [number, number];
  readonly note: string;
}

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

export function earthBmngAssetForUtc(isoUtc: string): SurfaceTextureAsset {
  let monthIndex: number;
  try {
    monthIndex = utcCalendarMonthIndex(isoUtc);
  } catch {
    throw new Error(`Invalid UTC epoch for Earth surface selection: ${isoUtc}`);
  }
  const monthNumber = String(monthIndex + 1).padStart(2, "0");
  const monthName = MONTH_NAMES[monthIndex];
  if (!monthName) throw new Error(`Unsupported calendar month index ${monthIndex}.`);

  return Object.freeze({
    id: `earth-bmng-base-2004-${monthNumber}`,
    bodyId: 399,
    displayName: `Earth Blue Marble Next Generation base map · ${monthName} 2004`,
    url:
      `${BMNG_ROOT}/${monthName}/world.2004${monthNumber}.3x5400x2700.jpg`,
    authority: "NASA Earth Observatory",
    product: "Blue Marble: Next Generation — Base Map",
    dataEpoch: `2004-${monthNumber}`,
    role: "reference-surface-color",
    validLatitudeDegrees: [-90, 90] as const,
    note:
      "Cloud-minimized monthly 2004 surface composite without topographic-shading product. It is a dated reference surface, not live Earth imagery or a radiometrically calibrated BRDF.",
  });
}

export function surfaceAssetForBody(
  bodyId: number,
  isoUtc: string,
): SurfaceTextureAsset | null {
  if (bodyId === 399) return earthBmngAssetForUtc(isoUtc);
  return null;
}
