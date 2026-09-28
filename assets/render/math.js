import { cross, normalize, subtract } from "../core/Vec3d.js";
export function multiplyMat4(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col += 1) {
        for (let row = 0; row < 4; row += 1) {
            let sum = 0;
            for (let k = 0; k < 4; k += 1) {
                sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
            }
            out[col * 4 + row] = sum;
        }
    }
    return out;
}
export function reversedInfinitePerspective(fovYRadians, aspect, nearMeters) {
    const f = 1 / Math.tan(fovYRadians / 2);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, 0, -1,
        0, 0, nearMeters, 0,
    ]);
}
export function cameraRotation(cameraPosition, target) {
    const forward = normalize(subtract(target, cameraPosition));
    const referenceUp = Math.abs(forward.z) > 0.98
        ? { x: 0, y: 1, z: 0 }
        : { x: 0, y: 0, z: 1 };
    const right = normalize(cross(forward, referenceUp));
    const up = cross(right, forward);
    return new Float32Array([
        right.x, up.x, -forward.x, 0,
        right.y, up.y, -forward.y, 0,
        right.z, up.z, -forward.z, 0,
        0, 0, 0, 1,
    ]);
}
