export interface Vec3d {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const ZERO_VEC3D: Vec3d = Object.freeze({ x: 0, y: 0, z: 0 });

export function add(a: Vec3d, b: Vec3d): Vec3d {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3d, b: Vec3d): Vec3d {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3d, scalar: number): Vec3d {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

export function dot(a: Vec3d, b: Vec3d): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3d, b: Vec3d): Vec3d {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function magnitude(v: Vec3d): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize(v: Vec3d): Vec3d {
  const length = magnitude(v);
  if (!Number.isFinite(length) || length === 0) {
    throw new Error("Cannot normalize a zero or non-finite vector.");
  }
  return scale(v, 1 / length);
}
