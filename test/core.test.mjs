import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { md5Hex } from "../.test-dist/src/data/md5.js";
import { evaluateChebyshevWithDerivative } from "../.test-dist/src/astronomy/spk/Chebyshev.js";
import { SpkKernel } from "../.test-dist/src/astronomy/spk/SpkKernel.js";
import { parseLeapSecondKernel, taiMinusUtcAt } from "../.test-dist/src/astronomy/time/LeapSecondKernel.js";
import { TimeConverter } from "../.test-dist/src/astronomy/time/TimeConverter.js";
import { circleVisibleFraction } from "../.test-dist/src/render/eclipse.js";

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
