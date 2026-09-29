import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { md5Hex } from "../.test-dist/src/data/md5.js";
import { evaluateChebyshevWithDerivative } from "../.test-dist/src/astronomy/spk/Chebyshev.js";
import { SpkKernel } from "../.test-dist/src/astronomy/spk/SpkKernel.js";
import { parseLeapSecondKernel, taiMinusUtcAt } from "../.test-dist/src/astronomy/time/LeapSecondKernel.js";
import { TimeConverter } from "../.test-dist/src/astronomy/time/TimeConverter.js";
import {
  taiUnixSecondsToUtcIso,
  utcIsoToTaiUnixSeconds,
} from "../.test-dist/src/astronomy/time/UtcTimeline.js";
import { circleVisibleFraction } from "../.test-dist/src/render/eclipse.js";
import { EARTH_REFERENCE_ATMOSPHERE } from "../.test-dist/src/render/AtmosphereModel.js";
import { earthBmngAssetForUtc } from "../.test-dist/src/render/SurfaceTextureManifest.js";
import {
  DEFAULT_DISPLAY_REFERENCE_RADIANCE_W_M2_SR,
  HDR_RADIANCE_W_M2_SR_PER_STORAGE_UNIT,
  HDR_STORAGE_UNITS_PER_W_M2_SR,
  REFERENCE_TOTAL_SOLAR_IRRADIANCE_W_M2,
  lambertianRadianceWm2Sr,
  radianceWm2SrToHdrStorage,
  solarIrradianceAtDistanceWm2,
  uniformSolarDiskRadianceWm2Sr,
} from "../.test-dist/src/render/Radiometry.js";
import { AU_METERS } from "../.test-dist/src/core/units.js";
import { BinaryPck } from "../.test-dist/src/astronomy/pck/BinaryPck.js";
import {
  J2000_OBLIQUITY_RADIANS,
  J2000_TO_ECLIPJ2000,
  multiplyMatrix3,
  transposeMatrix3,
  transformMatrix3Vector,
} from "../.test-dist/src/astronomy/frames/Matrix3.js";

function encode(text) {
  return new TextEncoder().encode(text);
}

test("MD5 matches standard vectors", () => {
  assert.equal(md5Hex(encode("")), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5Hex(encode("abc")), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(md5Hex(encode("message digest")), "f96b697d7cb7938d525a2f31aaf161d0");
});

test("Chebyshev value and derivative are evaluated analytically", () => {
  const x = 0.25;
  const result = evaluateChebyshevWithDerivative([1, 2, 3], x);
  const expected = 1 + 2 * x + 3 * (2 * x * x - 1);
  const derivative = 2 + 12 * x;
  assert.ok(Math.abs(result.value - expected) < 1e-12);
  assert.ok(Math.abs(result.derivativeByX - derivative) < 1e-12);
});

test("NAIF leap-second data drives UTC to ET conversion", async () => {
  const text = await readFile(new URL("../static/kernels/naif0012.tls", import.meta.url), "utf8");
  const lsk = parseLeapSecondKernel(text, "test-naif0012");
  assert.equal(taiMinusUtcAt(lsk, Date.parse("2016-12-31T23:59:59Z")), 36);
  assert.equal(taiMinusUtcAt(lsk, Date.parse("2017-01-01T00:00:00Z")), 37);

  const converter = new TimeConverter(lsk);
  const j2000Tt = converter.fromUtc("2000-01-01T11:58:55.816Z");
  assert.ok(Math.abs(j2000Tt.ttJulianDate - 2451545.0) < 2e-10);
  assert.ok(Math.abs(j2000Tt.etSecondsPastJ2000) < 0.002);

  const modern = converter.fromUtc("2026-09-27T00:00:00Z");
  assert.equal(modern.taiMinusUtcSeconds, 37);
  assert.ok(Math.abs(modern.tdbMinusTtSeconds) < 0.002);
});

test("literal UTC leap-second labels map to a continuous physical timeline", async () => {
  const text = await readFile(new URL("../static/kernels/naif0012.tls", import.meta.url), "utf8");
  const lsk = parseLeapSecondKernel(text, "test-naif0012");
  const converter = new TimeConverter(lsk);

  const before = converter.fromUtc("2016-12-31T23:59:59Z");
  const leap = converter.fromUtc("2016-12-31T23:59:60Z");
  const leapHalf = converter.fromUtc("2016-12-31T23:59:60.5Z");
  const after = converter.fromUtc("2017-01-01T00:00:00Z");

  assert.equal(leap.utcIso, "2016-12-31T23:59:60Z");
  assert.equal(leap.utcJulianDate, null);
  assert.equal(leap.taiMinusUtcSeconds, 36);
  assert.equal(after.taiMinusUtcSeconds, 37);

  assert.ok(Math.abs((leap.etSecondsPastJ2000 - before.etSecondsPastJ2000) - 1) < 2e-5);
  assert.ok(Math.abs((after.etSecondsPastJ2000 - leap.etSecondsPastJ2000) - 1) < 2e-5);
  assert.ok(Math.abs((after.etSecondsPastJ2000 - leapHalf.etSecondsPastJ2000) - 0.5) < 2e-5);

  const beforeTai = utcIsoToTaiUnixSeconds(lsk, "2016-12-31T23:59:59Z");
  const leapTai = utcIsoToTaiUnixSeconds(lsk, "2016-12-31T23:59:60Z");
  const halfTai = utcIsoToTaiUnixSeconds(lsk, "2016-12-31T23:59:60.5Z");
  const afterTai = utcIsoToTaiUnixSeconds(lsk, "2017-01-01T00:00:00Z");

  assert.equal(leapTai - beforeTai, 1);
  assert.equal(afterTai - leapTai, 1);
  assert.equal(afterTai - beforeTai, 2);
  assert.equal(taiUnixSecondsToUtcIso(lsk, leapTai), "2016-12-31T23:59:60Z");
  assert.equal(taiUnixSecondsToUtcIso(lsk, halfTai), "2016-12-31T23:59:60.5Z");
  assert.equal(taiUnixSecondsToUtcIso(lsk, afterTai), "2017-01-01T00:00:00Z");

  assert.throws(
    () => converter.fromUtc("2016-12-30T23:59:60Z"),
    /not a positive UTC leap second/,
  );
  assert.throws(
    () => converter.fromUtc("2016-12-31T22:59:60Z"),
    /only valid at 23:59:60/,
  );
});

test("Earth surface selection keeps the civil month during a leap second", () => {
  const december = earthBmngAssetForUtc("2016-12-31T23:59:60.5Z");
  assert.equal(december.id, "earth-bmng-base-2004-12");
  assert.equal(december.dataEpoch, "2004-12");
});


test("finite-disk eclipse visibility handles umbra, penumbra and no overlap", () => {
  assert.equal(circleVisibleFraction(0.01, 0.02, 0), 0);
  assert.equal(circleVisibleFraction(0.01, 0.005, 0), 0.75);
  assert.equal(circleVisibleFraction(0.01, 0.005, 0.02), 1);
  const partial = circleVisibleFraction(0.01, 0.01, 0.01);
  assert.ok(partial > 0 && partial < 1);
});

function writeAscii(view, offset, text, length) {
  for (let i = 0; i < length; i += 1) view.setUint8(offset + i, i < text.length ? text.charCodeAt(i) : 32);
}

function syntheticSpk() {
  const buffer = new ArrayBuffer(4096);
  const view = new DataView(buffer);
  const le = true;
  writeAscii(view, 0, "DAF/SPK ", 8);
  view.setInt32(8, 2, le);
  view.setInt32(12, 6, le);
  writeAscii(view, 16, "UNIVERSE MODEL SYNTHETIC SPK", 60);
  view.setInt32(76, 2, le);
  view.setInt32(80, 2, le);
  view.setInt32(84, 397, le);
  writeAscii(view, 88, "LTL-IEEE", 8);

  const summaryRecord = 1024;
  view.setFloat64(summaryRecord, 0, le);
  view.setFloat64(summaryRecord + 8, 0, le);
  view.setFloat64(summaryRecord + 16, 1, le);
  const summary = summaryRecord + 24;
  view.setFloat64(summary, -10, le);
  view.setFloat64(summary + 8, 10, le);
  const ints = summary + 16;
  view.setInt32(ints, 399, le);
  view.setInt32(ints + 4, 0, le);
  view.setInt32(ints + 8, 1, le);
  view.setInt32(ints + 12, 2, le);
  view.setInt32(ints + 16, 385, le);
  view.setInt32(ints + 20, 396, le);

  const data = 3072;
  const doubles = [0, 10, 100, 2, 200, 4, 300, 6, -10, 20, 8, 1];
  doubles.forEach((value, index) => view.setFloat64(data + index * 8, value, le));
  return buffer;
}

test("SPK Type 2 reader reconstructs position and velocity", () => {
  const kernel = new SpkKernel(syntheticSpk());
  const state = kernel.state(399, 0, 0);
  assert.deepEqual(state.positionKm, { x: 100, y: 200, z: 300 });
  assert.ok(Math.abs(state.velocityKmPerSecond.x - 0.2) < 1e-12);
  assert.ok(Math.abs(state.velocityKmPerSecond.y - 0.4) < 1e-12);
  assert.ok(Math.abs(state.velocityKmPerSecond.z - 0.6) < 1e-12);
});


function syntheticPck() {
  const buffer = new ArrayBuffer(4096);
  const view = new DataView(buffer);
  const le = true;
  writeAscii(view, 0, "DAF/PCK ", 8);
  view.setInt32(8, 2, le);
  view.setInt32(12, 5, le);
  writeAscii(view, 16, "UNIVERSE MODEL SYNTHETIC PCK", 60);
  view.setInt32(76, 2, le);
  view.setInt32(80, 2, le);
  view.setInt32(84, 397, le);
  writeAscii(view, 88, "LTL-IEEE", 8);

  const summaryRecord = 1024;
  view.setFloat64(summaryRecord, 0, le);
  view.setFloat64(summaryRecord + 8, 0, le);
  view.setFloat64(summaryRecord + 16, 1, le);
  const summary = summaryRecord + 24;
  view.setFloat64(summary, -10, le);
  view.setFloat64(summary + 8, 10, le);
  const ints = summary + 16;
  view.setInt32(ints, 3000, le);
  view.setInt32(ints + 4, 17, le);
  view.setInt32(ints + 8, 2, le);
  view.setInt32(ints + 12, 385, le);
  view.setInt32(ints + 16, 396, le);

  const data = 3072;
  const doubles = [
    0, 10,
    0.1, 0.02,
    0.2, 0.04,
    0.3, 0.06,
    -10, 20, 8, 1,
  ];
  doubles.forEach((value, index) => view.setFloat64(data + index * 8, value, le));
  return buffer;
}

test("binary PCK Type 2 converts stored RA/DEC/W into the SPICE 3-1-3 frame rotation", () => {
  const pck = new BinaryPck(syntheticPck());
  const orientation = pck.orientation(3000, 0);

  assert.equal(orientation.baseFrameId, 17);
  assert.ok(Math.abs(orientation.rightAscensionRadians - 0.1) < 1e-12);
  assert.ok(Math.abs(orientation.declinationRadians - 0.2) < 1e-12);
  assert.ok(Math.abs(orientation.primeMeridianRadians - 0.3) < 1e-12);
  assert.ok(Math.abs(orientation.angle1Radians - (Math.PI / 2 + 0.1)) < 1e-12);
  assert.ok(Math.abs(orientation.angle2Radians - (Math.PI / 2 - 0.2)) < 1e-12);
  assert.ok(Math.abs(orientation.angle3Radians - 0.3) < 1e-12);
  assert.ok(Math.abs(orientation.angleRatesRadiansPerSecond[0] - 0.002) < 1e-12);
  assert.ok(Math.abs(orientation.angleRatesRadiansPerSecond[1] + 0.004) < 1e-12);
  assert.ok(Math.abs(orientation.angleRatesRadiansPerSecond[2] - 0.006) < 1e-12);

  const identity = multiplyMatrix3(
    orientation.j2000ToBodyFixed,
    transposeMatrix3(orientation.j2000ToBodyFixed),
  );
  const expected = [1,0,0, 0,1,0, 0,0,1];
  for (let i = 0; i < 9; i += 1) {
    assert.ok(Math.abs(identity[i] - expected[i]) < 1e-12, `matrix component ${i}`);
  }
});


test("matrix-vector transform follows row-major convention", () => {
  const matrix = [
    0, 1, 0,
    -1, 0, 0,
    0, 0, 1,
  ];
  const result = transformMatrix3Vector(matrix, { x: 2, y: 3, z: 4 });
  assert.deepEqual(result, { x: 3, y: -2, z: 4 });
});


test("J2000 to ECLIPJ2000 uses the NAIF mean obliquity convention", () => {
  const expectedDegrees = 23.43929111111111;
  const actualDegrees = J2000_OBLIQUITY_RADIANS * 180 / Math.PI;
  assert.ok(Math.abs(actualDegrees - expectedDegrees) < 1e-12);

  const yAxis = transformMatrix3Vector(
    J2000_TO_ECLIPJ2000,
    { x: 0, y: 1, z: 0 },
  );
  assert.ok(Math.abs(yAxis.x) < 1e-15);
  assert.ok(Math.abs(yAxis.y - Math.cos(J2000_OBLIQUITY_RADIANS)) < 1e-15);
  assert.ok(Math.abs(yAxis.z + Math.sin(J2000_OBLIQUITY_RADIANS)) < 1e-15);
});


test("Earth reference atmosphere preserves physical 100 km shell geometry", () => {
  const model = EARTH_REFERENCE_ATMOSPHERE;
  assert.equal(model.topAltitudeMeters, 100_000);
  assert.equal(model.rayleighScaleHeightMeters, 8_500);
  assert.equal(model.outerRadiiMeters[0] - 6_378_136.6, 100_000);
  assert.equal(model.outerRadiiMeters[1] - 6_378_136.6, 100_000);
  assert.equal(model.outerRadiiMeters[2] - 6_356_751.9, 100_000);
  for (const coefficient of model.rayleighScatteringPerMeterRgb) {
    assert.ok(Number.isFinite(coefficient) && coefficient > 0);
  }
});


test("Earth surface manifest preserves dated BMNG provenance", () => {
  const september = earthBmngAssetForUtc("2026-09-28T00:00:00Z");
  assert.equal(september.id, "earth-bmng-base-2004-09");
  assert.equal(september.dataEpoch, "2004-09");
  assert.match(september.url, /\/september\/world\.200409\.3x5400x2700\.jpg$/);
  assert.deepEqual(september.validLatitudeDegrees, [-90, 90]);
});


test("broadband solar radiometry is physically scaled at 1 au", () => {
  assert.equal(REFERENCE_TOTAL_SOLAR_IRRADIANCE_W_M2, 1361);
  assert.equal(DEFAULT_DISPLAY_REFERENCE_RADIANCE_W_M2_SR, 100);
  assert.ok(
    Math.abs(solarIrradianceAtDistanceWm2(AU_METERS) - 1361) < 1e-12,
  );
  assert.ok(
    Math.abs(solarIrradianceAtDistanceWm2(2 * AU_METERS) - 340.25) < 1e-12,
  );

  const normalEarthLikeRadiance = lambertianRadianceWm2Sr(1361, 0.30, 1);
  assert.ok(
    Math.abs(normalEarthLikeRadiance - (1361 * 0.30 / Math.PI)) < 1e-12,
  );

  const solarDiskRadiance = uniformSolarDiskRadianceWm2Sr();
  assert.ok(Number.isFinite(solarDiskRadiance));
  assert.ok(solarDiskRadiance > 1e7);
});


test("half-float HDR storage scale preserves solar radiance range", () => {
  assert.equal(HDR_RADIANCE_W_M2_SR_PER_STORAGE_UNIT, 1000);
  assert.equal(HDR_STORAGE_UNITS_PER_W_M2_SR, 0.001);

  const storedSolar = radianceWm2SrToHdrStorage(
    uniformSolarDiskRadianceWm2Sr(),
  );
  assert.ok(storedSolar > 10_000);
  assert.ok(storedSolar < 65_504);

  const storedReference = radianceWm2SrToHdrStorage(
    DEFAULT_DISPLAY_REFERENCE_RADIANCE_W_M2_SR,
  );
  assert.equal(storedReference, 0.1);
});
