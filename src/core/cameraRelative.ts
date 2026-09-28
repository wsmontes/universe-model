import type { Vec3d } from "./Vec3d.js";
import { subtract } from "./Vec3d.js";

export function cameraRelative(
  absolutePosition: Vec3d,
  cameraOrigin: Vec3d,
): Float32Array {
  const local = subtract(absolutePosition, cameraOrigin);
  return new Float32Array([local.x, local.y, local.z]);
}
