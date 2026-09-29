import { SECONDS_PER_DAY } from "../../core/units.js";
import type { LeapSecondKernelData } from "./LeapSecondKernel.js";
import { taiMinusUtcAt } from "./LeapSecondKernel.js";
import { J2000_JD, unixMsToJulianDate } from "./JulianDate.js";

const J2000_UTC_NOON_UNIX_SECONDS =
  Date.UTC(2000, 0, 1, 12, 0, 0, 0) / 1000;

export interface TimeInstant {
  readonly utcIso: string;
  readonly utcJulianDate: number;
  readonly taiMinusUtcSeconds: number;
  readonly ttJulianDate: number;
  readonly tdbJulianDate: number;
  readonly etSecondsPastJ2000: number;
  readonly tdbMinusTtSeconds: number;
  readonly utcLabelKind: "ordinary" | "positive-leap-second";
  readonly provenance: {
    readonly leapSecondKernel: string;
    readonly model: "NAIF-DELTET";
  };
}

const ISO_UTC =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

interface ParsedUtc {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly fractionSeconds: number;
  readonly unixMsAtWholeSecond: number;
  readonly normalizedIso: string;
}

function parseIsoUtc(isoUtc: string): ParsedUtc {
  const match = isoUtc.match(ISO_UTC);
  if (!match) {
    throw new Error(
      "UTC epoch must be an ISO-8601 timestamp ending in Z, e.g. 2026-09-27T21:00:00Z.",
    );
  }

  const [, y, mo, d, h, mi, secRaw, fractionRaw = ""] = match;
  if (!y || !mo || !d || !h || !mi || !secRaw) {
    throw new Error("Incomplete UTC epoch.");
  }

  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(secRaw);
  if (second > 60) {
    throw new Error("UTC seconds must be between 00 and 60.");
  }

  const validationSecond = Math.min(second, 59);
  const unixMsAtWholeSecond = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    validationSecond,
    0,
  );
  const date = new Date(unixMsAtWholeSecond);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== validationSecond
  ) {
    throw new Error(`Invalid UTC calendar timestamp: ${isoUtc}`);
  }

  const fractionSeconds = fractionRaw ? Number(`0.${fractionRaw}`) : 0;
  const trimmedFraction = fractionRaw.replace(/0+$/, "");
  const fractionText = trimmedFraction ? `.${trimmedFraction}` : "";
  const normalizedIso =
    `${y}-${mo}-${d}T${h}:${mi}:${secRaw}${fractionText}Z`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    fractionSeconds,
    unixMsAtWholeSecond,
    normalizedIso,
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

function positiveLeapSecond(
  kernel: LeapSecondKernelData,
  parsed: ParsedUtc,
): {
  readonly utcJulianDate: number;
  readonly ttSecondsPastJ2000: number;
  readonly taiMinusUtcSeconds: number;
} {
  if (parsed.hour !== 23 || parsed.minute !== 59) {
    throw new Error(
      "UTC :60 is valid only at 23:59 on a positive leap-second day.",
    );
  }

  const nextMidnightMs = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day + 1,
    0,
    0,
    0,
    0,
  );
  const nextEntry = kernel.leapSeconds.find(
    (entry) => entry.effectiveUnixMs === nextMidnightMs,
  );
  const previousDelta = taiMinusUtcAt(kernel, nextMidnightMs - 1);

  if (
    !nextEntry ||
    nextEntry.taiMinusUtcSeconds !== previousDelta + 1
  ) {
    throw new Error(
      `${parsed.normalizedIso} is not a positive leap second declared by ${kernel.sourceName}.`,
    );
  }

  const secondsBeforeNext = 1 - parsed.fractionSeconds;
  const nextUtcJulianDate = unixMsToJulianDate(nextMidnightMs);
  const nextTtSecondsPastJ2000 =
    nextMidnightMs / 1000 -
    J2000_UTC_NOON_UNIX_SECONDS +
    nextEntry.taiMinusUtcSeconds +
    kernel.deltaTaSeconds;

  return {
    // UTC itself is not a uniform numerical scale through a leap second.
    // This JD is only a monotonic display coordinate for the UTC label.
    utcJulianDate:
      nextUtcJulianDate - secondsBeforeNext / SECONDS_PER_DAY,
    ttSecondsPastJ2000:
      nextTtSecondsPastJ2000 - secondsBeforeNext,
    taiMinusUtcSeconds: previousDelta,
  };
}

export class TimeConverter {
  constructor(private readonly kernel: LeapSecondKernelData) {}

  fromUtc(isoUtc: string): TimeInstant {
    const parsed = parseIsoUtc(isoUtc);

    let utcJulianDate: number;
    let ttSecondsPastJ2000: number;
    let taiMinusUtcSeconds: number;
    let utcLabelKind: TimeInstant["utcLabelKind"];

    if (parsed.second === 60) {
      const leap = positiveLeapSecond(this.kernel, parsed);
      utcJulianDate = leap.utcJulianDate;
      ttSecondsPastJ2000 = leap.ttSecondsPastJ2000;
      taiMinusUtcSeconds = leap.taiMinusUtcSeconds;
      utcLabelKind = "positive-leap-second";
    } else {
      const unixSeconds =
        parsed.unixMsAtWholeSecond / 1000 + parsed.fractionSeconds;
      utcJulianDate =
        unixMsToJulianDate(parsed.unixMsAtWholeSecond) +
        parsed.fractionSeconds / SECONDS_PER_DAY;
      taiMinusUtcSeconds = taiMinusUtcAt(
        this.kernel,
        parsed.unixMsAtWholeSecond,
      );
      ttSecondsPastJ2000 =
        unixSeconds -
        J2000_UTC_NOON_UNIX_SECONDS +
        taiMinusUtcSeconds +
        this.kernel.deltaTaSeconds;
      utcLabelKind = "ordinary";
    }

    const ttJulianDate =
      J2000_JD + ttSecondsPastJ2000 / SECONDS_PER_DAY;
    const periodic = tdbMinusTtSeconds(
      this.kernel,
      ttSecondsPastJ2000,
    );
    const etSecondsPastJ2000 = ttSecondsPastJ2000 + periodic;
    const tdbJulianDate =
      J2000_JD + etSecondsPastJ2000 / SECONDS_PER_DAY;

    return Object.freeze({
      utcIso: parsed.normalizedIso,
      utcJulianDate,
      taiMinusUtcSeconds,
      ttJulianDate,
      tdbJulianDate,
      etSecondsPastJ2000,
      tdbMinusTtSeconds: periodic,
      utcLabelKind,
      provenance: Object.freeze({
        leapSecondKernel: this.kernel.sourceName,
        model: "NAIF-DELTET" as const,
      }),
    });
  }
}
