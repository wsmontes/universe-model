import type { Vec3d } from "../../core/Vec3d.js";
import { add, subtract, ZERO_VEC3D } from "../../core/Vec3d.js";
import { DafReader } from "./DafReader.js";
import { evaluateChebyshevWithDerivative } from "./Chebyshev.js";

const SPK_TYPE_2 = 2;
const J2000_FRAME_ID = 1;

export interface SpkSegment {
  readonly startEtSeconds: number;
  readonly endEtSeconds: number;
  readonly target: number;
  readonly center: number;
  readonly frame: number;
  readonly type: number;
  readonly firstAddress: number;
  readonly lastAddress: number;
}

export interface SpkStateKm {
  readonly positionKm: Vec3d;
  readonly velocityKmPerSecond: Vec3d;
}

function vec(x: number, y: number, z: number): Vec3d {
  return { x, y, z };
}

function addState(a: SpkStateKm, b: SpkStateKm): SpkStateKm {
  return {
    positionKm: add(a.positionKm, b.positionKm),
    velocityKmPerSecond: add(a.velocityKmPerSecond, b.velocityKmPerSecond),
  };
}

function subtractState(a: SpkStateKm, b: SpkStateKm): SpkStateKm {
  return {
    positionKm: subtract(a.positionKm, b.positionKm),
    velocityKmPerSecond: subtract(a.velocityKmPerSecond, b.velocityKmPerSecond),
  };
}

const ZERO_STATE: SpkStateKm = Object.freeze({
  positionKm: ZERO_VEC3D,
  velocityKmPerSecond: ZERO_VEC3D,
});

export class SpkKernel {
  readonly name: string;
  readonly segments: readonly SpkSegment[];
  private readonly daf: DafReader;

  constructor(buffer: ArrayBuffer) {
    this.daf = new DafReader(buffer);
    if (!this.daf.fileRecord.idWord.startsWith("DAF/SPK")) {
      throw new Error(`Expected DAF/SPK kernel, got ${this.daf.fileRecord.idWord}.`);
    }
    this.name = this.daf.fileRecord.internalFileName;
    this.segments = Object.freeze(this.daf.summaries().map((summary): SpkSegment => {
      if (summary.integers.length < 6) throw new Error("SPK summary has fewer than six integer components.");
      return Object.freeze({
        startEtSeconds: summary.startEtSeconds,
        endEtSeconds: summary.endEtSeconds,
        target: summary.integers[0] ?? 0,
        center: summary.integers[1] ?? 0,
        frame: summary.integers[2] ?? 0,
        type: summary.integers[3] ?? 0,
        firstAddress: summary.integers[4] ?? 0,
        lastAddress: summary.integers[5] ?? 0,
      });
    }));
  }

  get coverage(): { startEtSeconds: number; endEtSeconds: number } {
    if (this.segments.length === 0) throw new Error("SPK kernel contains no segments.");
    return {
      startEtSeconds: Math.min(...this.segments.map((segment) => segment.startEtSeconds)),
      endEtSeconds: Math.max(...this.segments.map((segment) => segment.endEtSeconds)),
    };
  }

  state(target: number, center: number, etSeconds: number): SpkStateKm {
    if (target === center) return ZERO_STATE;
    const direct = this.findSegment(target, center, etSeconds);
    if (direct) return this.evaluateSegment(direct, etSeconds);

    const targetFromSsb = this.stateFromSsb(target, etSeconds, new Set<number>());
    const centerFromSsb = center === 0
      ? ZERO_STATE
      : this.stateFromSsb(center, etSeconds, new Set<number>());
    return subtractState(targetFromSsb, centerFromSsb);
  }

  private stateFromSsb(target: number, etSeconds: number, visited: Set<number>): SpkStateKm {
    if (target === 0) return ZERO_STATE;
    if (visited.has(target)) throw new Error(`Cycle detected while resolving SPK target ${target}.`);
    visited.add(target);

    const direct = this.findSegment(target, 0, etSeconds);
    if (direct) return this.evaluateSegment(direct, etSeconds);

    let candidate: SpkSegment | undefined;
    for (let i = this.segments.length - 1; i >= 0; i -= 1) {
      const segment = this.segments[i];
      if (
        segment &&
        segment.target === target &&
        etSeconds >= segment.startEtSeconds &&
        etSeconds <= segment.endEtSeconds
      ) {
        candidate = segment;
        break;
      }
    }
    if (!candidate) {
      throw new Error(`No SPK chain from SSB to target ${target} at ET=${etSeconds}.`);
    }

    const targetFromCenter = this.evaluateSegment(candidate, etSeconds);
    const centerFromSsb = candidate.center === 0
      ? ZERO_STATE
      : this.stateFromSsb(candidate.center, etSeconds, visited);
    return addState(centerFromSsb, targetFromCenter);
  }

  private findSegment(target: number, center: number, etSeconds: number): SpkSegment | undefined {
    for (let i = this.segments.length - 1; i >= 0; i -= 1) {
      const segment = this.segments[i];
      if (
        segment &&
        segment.target === target &&
        segment.center === center &&
        etSeconds >= segment.startEtSeconds &&
        etSeconds <= segment.endEtSeconds
      ) return segment;
    }
    return undefined;
  }

  private evaluateSegment(segment: SpkSegment, etSeconds: number): SpkStateKm {
    if (segment.frame !== J2000_FRAME_ID) {
      throw new Error(`SPK frame ${segment.frame} is not supported yet; expected J2000 frame 1.`);
    }
    if (segment.type !== SPK_TYPE_2) {
      throw new Error(`SPK type ${segment.type} is not supported yet; DE44xs planetary states use Type 2.`);
    }

    const view = this.daf.view;
    const littleEndian = this.daf.fileRecord.littleEndian;
    const dataStart = (segment.firstAddress - 1) * 8;
    const dataEndExclusive = segment.lastAddress * 8;
    if (dataStart < 0 || dataEndExclusive > view.byteLength || dataEndExclusive - dataStart < 32) {
      throw new Error("SPK segment data addresses are outside the kernel buffer.");
    }

    const meta = dataEndExclusive - 32;
    const init = view.getFloat64(meta, littleEndian);
    const intervalSeconds = view.getFloat64(meta + 8, littleEndian);
    const recordSize = Math.round(view.getFloat64(meta + 16, littleEndian));
    const recordCount = Math.round(view.getFloat64(meta + 24, littleEndian));

    if (!(intervalSeconds > 0) || recordSize < 5 || recordCount < 1) {
      throw new Error("Invalid SPK Type 2 segment metadata.");
    }
    const coefficientCount = (recordSize - 2) / 3;
    if (!Number.isInteger(coefficientCount) || coefficientCount < 1) {
      throw new Error(`Invalid SPK Type 2 record size: ${recordSize}.`);
    }

    let recordIndex = Math.floor((etSeconds - init) / intervalSeconds);
    if (recordIndex < 0) recordIndex = 0;
    if (recordIndex >= recordCount) recordIndex = recordCount - 1;

    const recordOffset = dataStart + recordIndex * recordSize * 8;
    const midpointEt = view.getFloat64(recordOffset, littleEndian);
    const radiusSeconds = view.getFloat64(recordOffset + 8, littleEndian);
    if (!(radiusSeconds > 0)) throw new Error("Invalid SPK Chebyshev interval radius.");
    const normalizedTime = (etSeconds - midpointEt) / radiusSeconds;
    if (normalizedTime < -1.0000000001 || normalizedTime > 1.0000000001) {
      throw new Error(`SPK normalized time ${normalizedTime} is outside the Chebyshev interval.`);
    }

    const axes: Array<{ value: number; derivativeByX: number }> = [];
    for (let axis = 0; axis < 3; axis += 1) {
      const coefficients: number[] = [];
      const axisOffset = recordOffset + 16 + axis * coefficientCount * 8;
      for (let i = 0; i < coefficientCount; i += 1) {
        coefficients.push(view.getFloat64(axisOffset + i * 8, littleEndian));
      }
      axes.push(evaluateChebyshevWithDerivative(coefficients, normalizedTime));
    }

    const x = axes[0];
    const y = axes[1];
    const z = axes[2];
    if (!x || !y || !z) throw new Error("Failed to evaluate SPK vector components.");

    return {
      positionKm: vec(x.value, y.value, z.value),
      velocityKmPerSecond: vec(
        x.derivativeByX / radiusSeconds,
        y.derivativeByX / radiusSeconds,
        z.derivativeByX / radiusSeconds,
      ),
    };
  }
}
