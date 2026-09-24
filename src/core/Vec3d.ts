export interface Vec3d {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function subtract(a: Vec3d, b: Vec3d): Vec3d {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

export function magnitude(v: Vec3d): number {
  return Math.hypot(v.x, v.y, v.z);
}
