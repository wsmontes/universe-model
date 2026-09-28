import { AU_METERS } from "../core/units.js";
import { pckRadii } from "../astronomy/pck/ShapeConstants.js";

export const REFERENCE_TOTAL_SOLAR_IRRADIANCE_W_M2 = 1361;
export const DEFAULT_DISPLAY_REFERENCE_RADIANCE_W_M2_SR = 100;

export function solarIrradianceAtDistanceWm2(distanceMeters) {
  if (!(distanceMeters > 0) || !Number.isFinite(distanceMeters)) {
    throw new Error("Solar distance must be a positive finite value.");
  }
  const scale = AU_METERS / distanceMeters;
  return REFERENCE_TOTAL_SOLAR_IRRADIANCE_W_M2 * scale * scale;
}

export function uniformSolarDiskRadianceWm2Sr() {
  const sunRadiusMeters = pckRadii(10).xMeters;
  const sineAngularRadius = sunRadiusMeters / AU_METERS;
  return REFERENCE_TOTAL_SOLAR_IRRADIANCE_W_M2 /
    (Math.PI * sineAngularRadius * sineAngularRadius);
}

export function lambertianRadianceWm2Sr(
  irradianceWm2,
  hemisphericalReflectance,
  cosineIncidence,
) {
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
