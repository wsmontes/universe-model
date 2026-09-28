export const ZERO_VEC3D = Object.freeze({ x: 0, y: 0, z: 0 });
export function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function scale(v, scalar) {
    return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}
export function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}
export function magnitude(v) {
    return Math.hypot(v.x, v.y, v.z);
}
export function normalize(v) {
    const length = magnitude(v);
    if (!Number.isFinite(length) || length === 0) {
        throw new Error("Cannot normalize a zero or non-finite vector.");
    }
    return scale(v, 1 / length);
}
