import type { Vec3d } from "./Vec3d";
import { subtract } from "./Vec3d";

/**
 * Convert absolute double-precision world coordinates to GPU-local coordinates.
 *
 * JavaScript numbers are IEEE-754 doubles. We preserve the absolute state in
 * double precision and only narrow to float32 after subtracting the camera
 * origin. The renderer must never store astronomical absolute positions in
 * GPU float32 coordinates.
 */
export function cameraRelative(
  absolutePosition: Vec3d,
  cameraOrigin: Vec3d,
): Float32Array {
  const local = subtract(absolutePosition, cameraOrigin);
  return new Float32Array([local.x, local.y, local.z]);
}
