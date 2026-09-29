import { SECONDS_PER_DAY } from "../../core/units.js";
import type { LeapSecondKernelData } from "./LeapSecondKernel.js";
import { J2000_JD, UNIX_EPOCH_JD } from "./JulianDate.js";
import {
  parseIsoUtcLabel,
  utcIsoToTaiUnixSeconds,
} from "./UtcTimeline.js";

export interface TimeInstant {
  readonly utcIso: string;
  /**
   * JDUTC cannot uniquely represent an instant during a leap second.
   * NAIF recommends against JDUTC for those labels, so this field is null
   * when utcIso contains the literal second 60.
   */
  readonly utcJulianDate: number | null;
  readonly taiMinusUtcSeconds: number;
  readonly taiUnixSeconds: number;
  readonly ttJulianDate: number;
  readonly tdbJulianDate: number;
  readonly etSecondsPastJ2000: number;
  readonly tdbMinusTtSeconds: number;
  readonly provenance: {
    readonly leapSecondKernel: string;
    readonly model: "NAIF-DELTET";
  };
}

function tdbMinusTtSeconds(
  kernel: LeapSecondKernelData,
  ttSecondsPastJ2000: number,
): number {
  let et = ttSecondsPastJ2000;
  for (let i = 0; i < 2; i += 1) {
    const m =
      kernel.meanAnomalyAtJ2000Rad +
      kernel.meanAnomalyRateRadPerSecond * et;
    const e = m + kernel.eccentricity * Math.sin(m);
    const periodic = kernel.kSeconds * Math.sin(e);
    et = ttSecondsPastJ2000 + periodic;
  }
  return et - ttSecondsPastJ2000;
}

export class TimeConverter {
  constructor(private readonly kernel: LeapSecondKernelData) {}

  fromUtc(isoUtc: string): TimeInstant {
    const parsed = parseIsoUtcLabel(isoUtc);
    const taiUnixSeconds = utcIsoToTaiUnixSeconds(this.kernel, isoUtc);
    const taiMinusUtcSeconds = taiUnixSeconds - parsed.posixUnixSeconds;

    const utcJulianDate = parsed.isLeapSecond
      ? null
      : UNIX_EPOCH_JD + parsed.posixUnixSeconds / SECONDS_PER_DAY;

    const ttUnixSeconds = taiUnixSeconds + this.kernel.deltaTaSeconds;
    const ttJulianDate =
      UNIX_EPOCH_JD + ttUnixSeconds / SECONDS_PER_DAY;
    const ttSecondsPastJ2000 =
      (ttJulianDate - J2000_JD) * SECONDS_PER_DAY;
    const periodic = tdbMinusTtSeconds(this.kernel, ttSecondsPastJ2000);
    const etSecondsPastJ2000 = ttSecondsPastJ2000 + periodic;
    const tdbJulianDate =
      J2000_JD + etSecondsPastJ2000 / SECONDS_PER_DAY;

    return Object.freeze({
      utcIso: parsed.normalizedIso,
      utcJulianDate,
      taiMinusUtcSeconds,
      taiUnixSeconds,
      ttJulianDate,
      tdbJulianDate,
      etSecondsPastJ2000,
      tdbMinusTtSeconds: periodic,
      provenance: Object.freeze({
        leapSecondKernel: this.kernel.sourceName,
        model: "NAIF-DELTET" as const,
      }),
    });
  }
}
