import { pckRadii } from "../astronomy/pck/ShapeConstants.js";

export interface EarthAtmosphereModel {
  readonly bodyId: 399;
  readonly topAltitudeMeters: number;
  readonly outerRadiiMeters: readonly [number, number, number];
  readonly rayleighScaleHeightMeters: number;
  readonly mieScaleHeightMeters: number;
  readonly rayleighScatteringPerMeterRgb: readonly [number, number, number];
  readonly mieScatteringPerMeterRgb: readonly [number, number, number];
  readonly mieExtinctionPerMeterRgb: readonly [number, number, number];
  readonly mieG: number;
  readonly source: string;
}

/**
 * First radiative-transfer milestone.
 *
 * The density profile is a horizontally uniform exponential reference
 * atmosphere. It is intentionally not weather, climate, aerosol, ozone,
 * cloud, or humidity data. Those require independent provenance.
 */
export const EARTH_REFERENCE_ATMOSPHERE: EarthAtmosphereModel = (() => {
  const earth = pckRadii(399);
  const topAltitudeMeters = 100_000;

  return Object.freeze({
    bodyId: 399 as const,
    topAltitudeMeters,
    outerRadiiMeters: Object.freeze([
      earth.xMeters + topAltitudeMeters,
      earth.yMeters + topAltitudeMeters,
      earth.zMeters + topAltitudeMeters,
    ]) as readonly [number, number, number],
    // NASA Earth Fact Sheet gives an atmospheric scale height of ~8.5 km.
    rayleighScaleHeightMeters: 8_500,
    // Reference aerosol scale height used by the initial Mie model.
    mieScaleHeightMeters: 1_200,
    // Sea-level molecular scattering coefficients at representative
    // red/green/blue wavelengths, in inverse meters.
    rayleighScatteringPerMeterRgb: Object.freeze([
      5.802e-6,
      13.558e-6,
      33.100e-6,
    ]) as readonly [number, number, number],
    mieScatteringPerMeterRgb: Object.freeze([
      3.996e-6,
      3.996e-6,
      3.996e-6,
    ]) as readonly [number, number, number],
    mieExtinctionPerMeterRgb: Object.freeze([
      4.440e-6,
      4.440e-6,
      4.440e-6,
    ]) as readonly [number, number, number],
    mieG: 0.8,
    source:
      "NASA Earth atmosphere geometry/scale height + Bruneton-style reference Rayleigh/Mie single-scattering parameters",
  });
})();
