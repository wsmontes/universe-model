import type { Vec3d } from "../core/Vec3d.js";
import { add, scale } from "../core/Vec3d.js";

export interface CameraState {
  readonly positionMeters: Vec3d;
  readonly targetMeters: Vec3d;
  readonly distanceMeters: number;
}

export class OrbitCamera {
  private target: Vec3d = { x: 0, y: 0, z: 0 };
  private distance = 1;
  private yaw = 0.85;
  private pitch = 0.35;
  private readonly canvas: HTMLCanvasElement;
  private onChange: (() => void) | null = null;
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
  }

  setChangeHandler(handler: () => void): void {
    this.onChange = handler;
  }

  frame(targetMeters: Vec3d, distanceMeters: number): void {
    if (!(distanceMeters > 0) || !Number.isFinite(distanceMeters)) {
      throw new Error("Camera distance must be a positive finite value.");
    }
    this.target = targetMeters;
    this.distance = distanceMeters;
    this.onChange?.();
  }

  follow(targetMeters: Vec3d): void {
    this.target = targetMeters;
  }

  state(): CameraState {
    const cosPitch = Math.cos(this.pitch);
    const direction: Vec3d = {
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

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerUp);
    this.canvas.removeEventListener("wheel", this.wheel);
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch + dy * 0.006));
    this.onChange?.();
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private readonly wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.0012);
    this.distance = Math.max(0.01, this.distance * factor);
    this.onChange?.();
  };
}
