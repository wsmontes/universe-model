import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  applyStellarAberration,
  observedState,
} from "../.test-dist/src/astronomy/observation/Aberration.js";
import {
  parseLeapSecondKernel,
} from "../.test-dist/src/astronomy/time/LeapSecondKernel.js";
import {
  TimeConverter,
} from "../.test-dist/src/astronomy/time/TimeConverter.js";
import {
  SPEED_OF_LIGHT_KM_PER_SECOND,
} from "../.test-dist/src/core/units.js";

test("positive UTC leap-second labels map to continuous ET", async () => {
  const text = await readFile(
    new URL("../static/kernels/naif0012.tls", import.meta.url),
    "utf8",
  );
  const converter = new TimeConverter(
    parseLeapSecondKernel(text, "test-naif0012"),
  );

  const before = converter.fromUtc(
    "2016-12-31T23:59:59Z",
  );
  const leap = converter.fromUtc(
    "2016-12-31T23:59:60Z",
  );
  const half = converter.fromUtc(
    "2016-12-31T23:59:60.5Z",
  );
  const after = converter.fromUtc(
    "2017-01-01T00:00:00Z",
  );

  assert.equal(leap.utcIso, "2016-12-31T23:59:60Z");
  assert.equal(leap.utcLabelKind, "positive-leap-second");
  assert.equal(leap.taiMinusUtcSeconds, 36);
  assert.ok(
    Math.abs(
      leap.etSecondsPastJ2000 -
      before.etSecondsPastJ2000 -
      1,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      half.etSecondsPastJ2000 -
      leap.etSecondsPastJ2000 -
      0.5,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      after.etSecondsPastJ2000 -
      half.etSecondsPastJ2000 -
      0.5,
    ) < 1e-9,
  );

  assert.throws(
    () => converter.fromUtc("2016-12-30T23:59:60Z"),
    /not a positive leap second/,
  );
});

function linearSource(observerVelocity = { x: 0, y: 0, z: 0 }) {
  const c = SPEED_OF_LIGHT_KM_PER_SECOND;
  return {
    state(target, center, etSeconds) {
      const absolute = (body) => {
        if (body === 0) {
          return {
            positionKm: { x: 0, y: 0, z: 0 },
            velocityKmPerSecond: { x: 0, y: 0, z: 0 },
          };
        }
        if (body === 1) {
          return {
            positionKm: {
              x: 10 * c,
              y: etSeconds,
              z: 0,
            },
            velocityKmPerSecond: { x: 0, y: 1, z: 0 },
          };
        }
        if (body === 2) {
          return {
            positionKm: {
              x: 0,
              y: observerVelocity.y * etSeconds,
              z: 0,
            },
            velocityKmPerSecond: observerVelocity,
          };
        }
        throw new Error(`Unknown synthetic body ${body}.`);
      };

      const targetState = absolute(target);
      const centerState = absolute(center);
      return {
        positionKm: {
          x:
            targetState.positionKm.x -
            centerState.positionKm.x,
          y:
            targetState.positionKm.y -
            centerState.positionKm.y,
          z:
            targetState.positionKm.z -
            centerState.positionKm.z,
        },
        velocityKmPerSecond: {
          x:
            targetState.velocityKmPerSecond.x -
            centerState.velocityKmPerSecond.x,
          y:
            targetState.velocityKmPerSecond.y -
            centerState.velocityKmPerSecond.y,
          z:
            targetState.velocityKmPerSecond.z -
            centerState.velocityKmPerSecond.z,
        },
      };
    },
  };
}

test("converged light time evaluates the target at emission epoch", () => {
  const result = observedState(
    linearSource(),
    1,
    0,
    0,
    "CN",
  );

  assert.ok(Math.abs(result.lightTimeSeconds - 10) < 1e-9);
  assert.ok(Math.abs(result.emissionEtSeconds + 10) < 1e-9);
  assert.ok(Math.abs(result.positionKm.y + 10) < 1e-8);
  assert.ok(
    Math.abs(result.velocityKmPerSecond.y - 1) < 1e-8,
  );
});

test("stellar aberration rotates apparent direction toward observer velocity", () => {
  const range = 10 * SPEED_OF_LIGHT_KM_PER_SECOND;
  const velocity = { x: 0, y: 30, z: 0 };
  const result = applyStellarAberration(
    { x: range, y: 0, z: 0 },
    velocity,
  );
  const angle = Math.atan2(result.y, result.x);

  assert.ok(result.y > 0);
  assert.ok(
    Math.abs(
      angle -
      30 / SPEED_OF_LIGHT_KM_PER_SECOND,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(Math.hypot(result.x, result.y) - range) < 1e-8,
  );
});
