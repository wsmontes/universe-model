import { pckRadii } from "../astronomy/pck/ShapeConstants.js";

export const EARTH_REFERENCE_ATMOSPHERE = (() => {
  const earth = pckRadii(399);
  const topAltitudeMeters = 100_000;

  return Object.freeze({
    bodyId: 399,
    topAltitudeMeters,
    outerRadiiMeters: Object.freeze([
      earth.xMeters + topAltitudeMeters,
      earth.yMeters + topAltitudeMeters,
      earth.zMeters + topAltitudeMeters,
    ]),
    rayleighScaleHeightMeters: 8_500,
    mieScaleHeightMeters: 1_200,
    rayleighScatteringPerMeterRgb: Object.freeze([
      5.802e-6,
      13.558e-6,
      33.100e-6,
    ]),
    mieScatteringPerMeterRgb: Object.freeze([
      3.996e-6,
      3.996e-6,
      3.996e-6,
    ]),
    mieExtinctionPerMeterRgb: Object.freeze([
      4.440e-6,
      4.440e-6,
      4.440e-6,
    ]),
    mieG: 0.8,
    source:
      "NASA Earth atmosphere geometry/scale height + Bruneton-style reference Rayleigh/Mie single-scattering parameters",
  });
})();
