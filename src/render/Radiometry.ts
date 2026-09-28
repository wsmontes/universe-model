import { AU_METERS } from "../core/units.js";
import { pckRadii } from "../astronomy/pck/ShapeConstants.js";

/**
 * Broadband total solar irradiance reference at exactly 1 au.
 *
 * NASA SORCE/TSIS observations place modern TSI near 1361 W/m².
 * This is a pinned reference value, not a time-varying solar-activity series.
 */
export const REFERENCE_TOTAL_SOLAR_IRRADIANCE_W_M2 = 1361;

/**
 * Deterministic observer/display response parameter.
 *
 * Scene radiance remains unchanged by this value. The display pass maps
 * linear broadband radiance relative to this reference.
 */
export const DEFAULT_DISPLAY_REFERENCE_RADIANCE_W_M2_SR = 100;

export function solarIrradianceAtDistanceWm2(distanceMeters: number): number {
  if (!(distanceMeters > 0) || !Number.isFinite(distanceMeters)) {
    throw new Error("Solar distance must be a positive finite value.");
  }
  const scale = AU_METERS / distanceMeters;
  return REFERENCE_TOTAL_SOLAR_IRRADIANCE_W_M2 * scale * scale;
}

export function uniformSolarDiskRadianceWm2Sr(): number {
  const sunRadiusMeters = pckRadii(10).xMeters;
  const sineAngularRadius = sunRadiusMeters / AU_METERS;
  return REFERENCE_TOTAL_SOLAR_IRRADIANCE_W_M2 /
    (Math.PI * sineAngularRadius * sineAngularRadius);
}

export function lambertianRadianceWm2Sr(
  irradianceWm2: number,
  hemisphericalReflectance: number,
  cosineIncidence: number,
): number {
  if (
    !Number.isFinite(irradianceWm2) ||
    !Number.isFinite(hemisphericalReflectance) ||
    !Number.isFinite(cosineIncidence)
  ) {
    throw new Error("Lambertian radiometry inputs must be finite.");
  }
  return irradianceWm2 *
    Math.max(0, hemisphericalReflectance) *
    Math.max(0, cosineIncidence) /
    Math.PI;
}


/**
 * Half-float HDR storage scale.
 *
 * One stored unit represents this many W·m⁻²·sr⁻¹. This keeps the
 * ~20 MW·m⁻²·sr⁻¹ solar disk inside rgba16float while retaining useful
 * precision for Earth/Moon/atmosphere radiance.
 */
export const HDR_RADIANCE_W_M2_SR_PER_STORAGE_UNIT = 1000;
export const HDR_STORAGE_UNITS_PER_W_M2_SR =
  1 / HDR_RADIANCE_W_M2_SR_PER_STORAGE_UNIT;

export function radianceWm2SrToHdrStorage(valueWm2Sr: number): number {
  if (!Number.isFinite(valueWm2Sr)) {
    throw new Error("Radiance must be finite.");
  }
  return valueWm2Sr * HDR_STORAGE_UNITS_PER_W_M2_SR;
}
