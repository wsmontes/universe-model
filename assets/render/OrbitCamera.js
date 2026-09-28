import { add, scale } from "../core/Vec3d.js";
export class OrbitCamera {
    target = { x: 0, y: 0, z: 0 };
    distance = 1;
    yaw = 0.85;
    pitch = 0.35;
    canvas;
    onChange = null;
    pointerId = null;
    lastX = 0;
    lastY = 0;
    constructor(canvas) {
        this.canvas = canvas;
        canvas.addEventListener("pointerdown", this.pointerDown);
        canvas.addEventListener("pointermove", this.pointerMove);
        canvas.addEventListener("pointerup", this.pointerUp);
        canvas.addEventListener("pointercancel", this.pointerUp);
        canvas.addEventListener("wheel", this.wheel, { passive: false });
    }
    setChangeHandler(handler) {
        this.onChange = handler;
    }
    frame(targetMeters, distanceMeters) {
        if (!(distanceMeters > 0) || !Number.isFinite(distanceMeters)) {
            throw new Error("Camera distance must be a positive finite value.");
        }
        this.target = targetMeters;
        this.distance = distanceMeters;
        this.onChange?.();
    }
    state() {
        const cosPitch = Math.cos(this.pitch);
        const direction = {
            x: cosPitch * Math.cos(this.yaw),
            y: cosPitch * Math.sin(this.yaw),
            z: Math.sin(this.pitch),
        };
        return {
            targetMeters: this.target,
            distanceMeters: this.distance,
            positionMeters: add(this.target, scale(direction, this.distance)),
        };
    }
    dispose() {
        this.canvas.removeEventListener("pointerdown", this.pointerDown);
        this.canvas.removeEventListener("pointermove", this.pointerMove);
        this.canvas.removeEventListener("pointerup", this.pointerUp);
        this.canvas.removeEventListener("pointercancel", this.pointerUp);
        this.canvas.removeEventListener("wheel", this.wheel);
    }
    pointerDown = (event) => {
        if (event.button !== 0)
            return;
        this.pointerId = event.pointerId;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.canvas.setPointerCapture(event.pointerId);
    };
    pointerMove = (event) => {
        if (this.pointerId !== event.pointerId)
            return;
        const dx = event.clientX - this.lastX;
        const dy = event.clientY - this.lastY;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        this.yaw -= dx * 0.006;
        this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch + dy * 0.006));
        this.onChange?.();
    };
    pointerUp = (event) => {
        if (this.pointerId !== event.pointerId)
            return;
        this.pointerId = null;
        if (this.canvas.hasPointerCapture(event.pointerId))
            this.canvas.releasePointerCapture(event.pointerId);
    };
    wheel = (event) => {
        event.preventDefault();
        const factor = Math.exp(event.deltaY * 0.0012);
        this.distance = Math.max(0.01, this.distance * factor);
        this.onChange?.();
    };
}
