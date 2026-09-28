import { DafReader } from "../spk/DafReader.js";
import { evaluateChebyshevWithDerivative } from "../spk/Chebyshev.js";
import {
  j2000ToInertialFrame,
  multiplyMatrix3,
  pckEulerToBaseToBodyFixed,
  transposeMatrix3,
} from "../frames/Matrix3.js";

const PCK_TYPE_2 = 2;

export class BinaryPck {
  constructor(buffer) {
    this.daf = new DafReader(buffer);
    if (!this.daf.fileRecord.idWord.startsWith("DAF/PCK")) {
      throw new Error("Expected DAF/PCK kernel, got " + this.daf.fileRecord.idWord + ".");
    }
    if (this.daf.fileRecord.nd !== 2 || this.daf.fileRecord.ni !== 5) {
      throw new Error(
        "Unexpected binary PCK DAF summary layout ND=" +
          this.daf.fileRecord.nd + ", NI=" + this.daf.fileRecord.ni + "."
      );
    }
    this.name = this.daf.fileRecord.internalFileName;
    this.segments = Object.freeze(this.daf.summaries().map((summary) => {
      if (summary.integers.length < 5) {
        throw new Error("PCK summary has fewer than five integer components.");
      }
      return Object.freeze({
        startEtSeconds: summary.startEtSeconds,
        endEtSeconds: summary.endEtSeconds,
        frameClassId: summary.integers[0] ?? 0,
        baseFrameId: summary.integers[1] ?? 0,
        type: summary.integers[2] ?? 0,
        firstAddress: summary.integers[3] ?? 0,
        lastAddress: summary.integers[4] ?? 0,
      });
    }));
  }

  orientation(frameClassId, etSeconds) {
    const segment = this.findSegment(frameClassId, etSeconds);
    if (!segment) {
      throw new Error(
        "No binary PCK segment for frame class " + frameClassId + " at ET=" + etSeconds + "."
      );
    }
    if (segment.type !== PCK_TYPE_2) {
      throw new Error(
        "PCK type " + segment.type +
          " is not supported yet; Earth/Moon high-accuracy kernels use Type 2."
      );
    }

    const angles = this.evaluateType2(segment, etSeconds);
    const baseToBody = pckEulerToBaseToBodyFixed(
      angles.values[0],
      angles.values[1],
      angles.values[2],
    );
    const j2000ToBase = j2000ToInertialFrame(segment.baseFrameId);
    const j2000ToBodyFixed = multiplyMatrix3(baseToBody, j2000ToBase);

    return Object.freeze({
      frameClassId,
      baseFrameId: segment.baseFrameId,
      angle1Radians: angles.values[0],
      angle2Radians: angles.values[1],
      angle3Radians: angles.values[2],
      angleRatesRadiansPerSecond: Object.freeze(angles.rates),
      j2000ToBodyFixed,
      bodyFixedToJ2000: transposeMatrix3(j2000ToBodyFixed),
    });
  }

  findSegment(frameClassId, etSeconds) {
    for (let i = this.segments.length - 1; i >= 0; i -= 1) {
      const segment = this.segments[i];
      if (
        segment &&
        segment.frameClassId === frameClassId &&
        etSeconds >= segment.startEtSeconds &&
        etSeconds <= segment.endEtSeconds
      ) return segment;
    }
    return undefined;
  }

  evaluateType2(segment, etSeconds) {
    const view = this.daf.view;
    const littleEndian = this.daf.fileRecord.littleEndian;
    const dataStart = (segment.firstAddress - 1) * 8;
    const dataEndExclusive = segment.lastAddress * 8;

    if (dataStart < 0 || dataEndExclusive > view.byteLength || dataEndExclusive - dataStart < 32) {
      throw new Error("PCK segment data addresses are outside the kernel buffer.");
    }

    const meta = dataEndExclusive - 32;
    const init = view.getFloat64(meta, littleEndian);
    const intervalSeconds = view.getFloat64(meta + 8, littleEndian);
    const recordSize = Math.round(view.getFloat64(meta + 16, littleEndian));
    const recordCount = Math.round(view.getFloat64(meta + 24, littleEndian));

    if (!(intervalSeconds > 0) || recordSize < 5 || recordCount < 1) {
      throw new Error("Invalid PCK Type 2 segment metadata.");
    }

    const coefficientCount = (recordSize - 2) / 3;
    if (!Number.isInteger(coefficientCount) || coefficientCount < 1) {
      throw new Error("Invalid PCK Type 2 record size: " + recordSize + ".");
    }

    let recordIndex = Math.floor((etSeconds - init) / intervalSeconds);
    if (recordIndex < 0) recordIndex = 0;
    if (recordIndex >= recordCount) recordIndex = recordCount - 1;

    const recordOffset = dataStart + recordIndex * recordSize * 8;
    const midpointEt = view.getFloat64(recordOffset, littleEndian);
    const radiusSeconds = view.getFloat64(recordOffset + 8, littleEndian);
    if (!(radiusSeconds > 0)) throw new Error("Invalid PCK Chebyshev interval radius.");

    const normalizedTime = (etSeconds - midpointEt) / radiusSeconds;
    if (normalizedTime < -1.0000000001 || normalizedTime > 1.0000000001) {
      throw new Error(
        "PCK normalized time " + normalizedTime + " is outside the Chebyshev interval."
      );
    }

    const values = [0, 0, 0];
    const rates = [0, 0, 0];

    for (let axis = 0; axis < 3; axis += 1) {
      const coefficients = [];
      const axisOffset = recordOffset + 16 + axis * coefficientCount * 8;
      for (let i = 0; i < coefficientCount; i += 1) {
        coefficients.push(view.getFloat64(axisOffset + i * 8, littleEndian));
      }
      const evaluated = evaluateChebyshevWithDerivative(coefficients, normalizedTime);
      values[axis] = evaluated.value;
      rates[axis] = evaluated.derivativeByX / radiusSeconds;
    }

    return { values, rates };
  }
}
