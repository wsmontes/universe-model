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
]);

export function earthBmngAssetForUtc(isoUtc) {
  const instant = new Date(isoUtc);
  if (!Number.isFinite(instant.getTime())) {
    throw new Error("Invalid UTC epoch for Earth surface selection: " + isoUtc);
  }
  const monthIndex = instant.getUTCMonth();
  const monthNumber = String(monthIndex + 1).padStart(2, "0");
  const monthName = MONTH_NAMES[monthIndex];
  if (!monthName) throw new Error("Unsupported calendar month index " + monthIndex + ".");

  return Object.freeze({
    id: "earth-bmng-base-2004-" + monthNumber,
    bodyId: 399,
    displayName: "Earth Blue Marble Next Generation base map · " + monthName + " 2004",
    url:
      BMNG_ROOT + "/" + monthName + "/world.2004" + monthNumber + ".3x5400x2700.jpg",
    authority: "NASA Earth Observatory",
    product: "Blue Marble: Next Generation — Base Map",
    dataEpoch: "2004-" + monthNumber,
    role: "reference-surface-color",
    validLatitudeDegrees: [-90, 90],
    note:
      "Cloud-minimized monthly 2004 surface composite without topographic-shading product. It is a dated reference surface, not live Earth imagery or a radiometrically calibrated BRDF.",
  });
}

export function surfaceAssetForBody(bodyId, isoUtc) {
  if (bodyId === 399) return earthBmngAssetForUtc(isoUtc);
  return null;
}
