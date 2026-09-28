import type { Vec3d } from "../../core/Vec3d.js";

export type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const IDENTITY_MATRIX3: Matrix3 = Object.freeze([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
]) as Matrix3;

export function multiplyMatrix3(a: Matrix3, b: Matrix3): Matrix3 {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += (a[row * 3 + k] ?? 0) * (b[k * 3 + col] ?? 0);
      }
      out[row * 3 + col] = sum;
    }
  }
  return Object.freeze(out) as unknown as Matrix3;
}

export function transposeMatrix3(m: Matrix3): Matrix3 {
  return Object.freeze([
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ]) as Matrix3;
}

/**
 * SPICE reference-frame rotation [angle]_1.
 *
 * This rotates coordinate axes by +angle around X, equivalently rotating
 * vectors by -angle in a fixed coordinate system.
 */
export function frameRotationX(angle: number): Matrix3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return Object.freeze([
    1, 0, 0,
    0, c, s,
    0, -s, c,
  ]) as Matrix3;
}

/** SPICE reference-frame rotation [angle]_3. */
export function frameRotationZ(angle: number): Matrix3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return Object.freeze([
    c, s, 0,
    -s, c, 0,
    0, 0, 1,
  ]) as Matrix3;
}

export function pckEulerToBaseToBodyFixed(
  angle1: number,
  angle2: number,
  angle3: number,
): Matrix3 {
  return multiplyMatrix3(
    frameRotationZ(angle3),
    multiplyMatrix3(frameRotationX(angle2), frameRotationZ(angle1)),
  );
}

const ARCSECONDS_PER_RADIAN = 206_264.80624709636;
const J2000_OBLIQUITY_ARCSECONDS = 84_381.448;
export const J2000_OBLIQUITY_RADIANS =
  J2000_OBLIQUITY_ARCSECONDS / ARCSECONDS_PER_RADIAN;

export const J2000_TO_ECLIPJ2000: Matrix3 =
  frameRotationX(J2000_OBLIQUITY_RADIANS);

export function j2000ToInertialFrame(frameId: number): Matrix3 {
  if (frameId === 1) return IDENTITY_MATRIX3;
  if (frameId === 17) return J2000_TO_ECLIPJ2000;
  throw new Error(`Unsupported PCK inertial base frame ID ${frameId}.`);
}


export function transformMatrix3Vector(m: Matrix3, v: Vec3d): Vec3d {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}
