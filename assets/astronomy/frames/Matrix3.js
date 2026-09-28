export const IDENTITY_MATRIX3 = Object.freeze([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
]);

export function multiplyMatrix3(a, b) {
  const out = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += (a[row * 3 + k] ?? 0) * (b[k * 3 + col] ?? 0);
      }
      out[row * 3 + col] = sum;
    }
  }
  return Object.freeze(out);
}

export function transposeMatrix3(m) {
  return Object.freeze([
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ]);
}

export function frameRotationX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return Object.freeze([
    1, 0, 0,
    0, c, s,
    0, -s, c,
  ]);
}

export function frameRotationZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return Object.freeze([
    c, s, 0,
    -s, c, 0,
    0, 0, 1,
  ]);
}

export function pckEulerToBaseToBodyFixed(angle1, angle2, angle3) {
  return multiplyMatrix3(
    frameRotationZ(angle3),
    multiplyMatrix3(frameRotationX(angle2), frameRotationZ(angle1)),
  );
}

const ARCSECONDS_PER_RADIAN = 206_264.80624709636;
const J2000_OBLIQUITY_ARCSECONDS = 84_381.448;
export const J2000_OBLIQUITY_RADIANS =
  J2000_OBLIQUITY_ARCSECONDS / ARCSECONDS_PER_RADIAN;

export const J2000_TO_ECLIPJ2000 =
  frameRotationX(J2000_OBLIQUITY_RADIANS);

export function j2000ToInertialFrame(frameId) {
  if (frameId === 1) return IDENTITY_MATRIX3;
  if (frameId === 17) return J2000_TO_ECLIPJ2000;
  throw new Error("Unsupported PCK inertial base frame ID " + frameId + ".");
}

export function transformMatrix3Vector(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}
