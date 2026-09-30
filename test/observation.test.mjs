import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStellarAberration,
  observedState,
} from "../.test-dist/src/astronomy/observation/Aberration.js";
import {
  SPEED_OF_LIGHT_KM_PER_SECOND,
} from "../.test-dist/src/core/units.js";

function linearSource(
  observerVelocity = { x: 0, y: 0, z: 0 },
) {
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
            velocityKmPerSecond: {
              x: 0,
              y: 1,
              z: 0,
            },
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
        throw new Error(
          `Unknown synthetic body ${body}.`,
        );
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

test(
  "converged light time evaluates target at emission epoch",
  () => {
    const result = observedState(
      linearSource(),
      1,
      0,
      0,
      "CN",
    );

    assert.ok(
      Math.abs(result.lightTimeSeconds - 10) <
        1e-9,
    );
    assert.ok(
      Math.abs(result.emissionEtSeconds + 10) <
        1e-9,
    );
    assert.ok(
      Math.abs(result.positionKm.y + 10) <
        1e-8,
    );
    assert.ok(
      Math.abs(
        result.velocityKmPerSecond.y - 1,
      ) < 1e-8,
    );
  },
);

test(
  "stellar aberration rotates apparent direction toward observer velocity",
  () => {
    const range =
      10 * SPEED_OF_LIGHT_KM_PER_SECOND;
    const velocity = { x: 0, y: 30, z: 0 };
    const result = applyStellarAberration(
      { x: range, y: 0, z: 0 },
      velocity,
    );
    const angle = Math.atan2(
      result.y,
      result.x,
    );

    assert.ok(result.y > 0);
    assert.ok(
      Math.abs(
        angle -
        30 / SPEED_OF_LIGHT_KM_PER_SECOND,
      ) < 1e-12,
    );
    assert.ok(
      Math.abs(
        Math.hypot(result.x, result.y) -
        range,
      ) < 1e-8,
    );
  },
);
