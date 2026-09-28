import { subtract } from "./Vec3d.js";
export function cameraRelative(absolutePosition, cameraOrigin) {
    const local = subtract(absolutePosition, cameraOrigin);
    return new Float32Array([local.x, local.y, local.z]);
}
