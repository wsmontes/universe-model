import { SECONDS_PER_DAY } from "../../core/units.js";
import type {
  LeapSecondEntry,
  LeapSecondKernelData,
} from "./LeapSecondKernel.js";
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

interface UtcFromTt {
  readonly utcIso: string;
  readonly utcJulianDate: number;
  readonly taiMinusUtcSeconds: number;
  readonly utcLabelKind: TimeInstant["utcLabelKind"];
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

  const fractionSeconds = fractionRaw
    ? Number(`0.${fractionRaw}`)
    : 0;
  const trimmedFraction = fractionRaw.replace(/0+$/, "");
  const fractionText = trimmedFraction
    ? `.${trimmedFraction}`
    : "";
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
  for (let i = 0; i < 3; i += 1) {
    const m =
      kernel.meanAnomalyAtJ2000Rad +
      kernel.meanAnomalyRateRadPerSecond * et;
    const e = m + kernel.eccentricity * Math.sin(m);
    const periodic = kernel.kSeconds * Math.sin(e);
    et = ttSecondsPastJ2000 + periodic;
  }
  return et - ttSecondsPastJ2000;
}

function ttSecondsFromEt(
  kernel: LeapSecondKernelData,
  etSecondsPastJ2000: number,
): number {
  let tt = etSecondsPastJ2000;
  for (let i = 0; i < 4; i += 1) {
    tt =
      etSecondsPastJ2000 -
      tdbMinusTtSeconds(kernel, tt);
  }
  return tt;
}

function effectiveTtSeconds(
  kernel: LeapSecondKernelData,
  entry: LeapSecondEntry,
): number {
  return (
    entry.effectiveUnixMs / 1000 -
    J2000_UTC_NOON_UNIX_SECONDS +
    entry.taiMinusUtcSeconds +
    kernel.deltaTaSeconds
  );
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
  const previousDelta = taiMinusUtcAt(
    kernel,
    nextMidnightMs - 1,
  );

  if (
    !nextEntry ||
    nextEntry.taiMinusUtcSeconds !== previousDelta + 1
  ) {
    throw new Error(
      `${parsed.normalizedIso} is not a positive leap second declared by ${kernel.sourceName}.`,
    );
  }

  const secondsBeforeNext = 1 - parsed.fractionSeconds;
  const nextUtcJulianDate =
    unixMsToJulianDate(nextMidnightMs);
  const nextTtSecondsPastJ2000 =
    effectiveTtSeconds(kernel, nextEntry);

  return {
    // Numerical UTC JD cannot uniquely encode both 23:59:59 and
    // 23:59:60. Physics never uses this field; TT/ET remain continuous.
    utcJulianDate:
      nextUtcJulianDate -
      secondsBeforeNext / SECONDS_PER_DAY,
    ttSecondsPastJ2000:
      nextTtSecondsPastJ2000 - secondsBeforeNext,
    taiMinusUtcSeconds: previousDelta,
  };
}

function fractionText(
  fractionSeconds: number,
): string {
  if (!(fractionSeconds > 0)) return "";
  const nanos = Math.min(
    999_999_999,
    Math.max(
      0,
      Math.round(fractionSeconds * 1e9),
    ),
  );
  if (nanos === 0) return "";
  return `.${String(nanos)
    .padStart(9, "0")
    .replace(/0+$/, "")}`;
}

function formatDateSecond(
  unixWholeSecond: number,
  fractionSeconds: number,
): string {
  let whole = unixWholeSecond;
  let fraction = fractionSeconds;
  if (fraction >= 1 - 0.5e-9) {
    whole += 1;
    fraction = 0;
  }

  const date = new Date(whole * 1000);
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${fractionText(fraction)}Z`;
}

function utcFromTtSeconds(
  kernel: LeapSecondKernelData,
  ttSecondsPastJ2000: number,
): UtcFromTt {
  for (let i = 1; i < kernel.leapSeconds.length; i += 1) {
    const previous = kernel.leapSeconds[i - 1];
    const current = kernel.leapSeconds[i];
    if (!previous || !current) continue;

    if (
      current.taiMinusUtcSeconds ===
      previous.taiMinusUtcSeconds + 1
    ) {
      const transitionTt =
        effectiveTtSeconds(kernel, current);
      if (
        ttSecondsPastJ2000 >= transitionTt - 1 &&
        ttSecondsPastJ2000 < transitionTt
      ) {
        const fraction =
          ttSecondsPastJ2000 - (transitionTt - 1);
        const previousCivil = new Date(
          current.effectiveUnixMs - 1000,
        );
        const y = String(
          previousCivil.getUTCFullYear(),
        ).padStart(4, "0");
        const mo = String(
          previousCivil.getUTCMonth() + 1,
        ).padStart(2, "0");
        const d = String(
          previousCivil.getUTCDate(),
        ).padStart(2, "0");
        const utcIso =
          `${y}-${mo}-${d}T23:59:60${fractionText(fraction)}Z`;
        const utcJulianDate =
          unixMsToJulianDate(
            current.effectiveUnixMs,
          ) -
          (1 - fraction) / SECONDS_PER_DAY;

        return {
          utcIso,
          utcJulianDate,
          taiMinusUtcSeconds:
            previous.taiMinusUtcSeconds,
          utcLabelKind: "positive-leap-second",
        };
      }
    }
  }

  let selected: LeapSecondEntry | undefined;
  for (const entry of kernel.leapSeconds) {
    if (
      ttSecondsPastJ2000 >=
      effectiveTtSeconds(kernel, entry)
    ) {
      selected = entry;
    } else {
      break;
    }
  }

  if (!selected) {
    const earliest = kernel.leapSeconds[0];
    throw new Error(
      `ET/UTC inversion is not supported before ${earliest?.effectiveUtcIso ?? "the first LSK entry"}.`,
    );
  }

  const unixSeconds =
    ttSecondsPastJ2000 -
    selected.taiMinusUtcSeconds -
    kernel.deltaTaSeconds +
    J2000_UTC_NOON_UNIX_SECONDS;
  let wholeSecond = Math.floor(unixSeconds);
  let fraction = unixSeconds - wholeSecond;
  if (fraction >= 1 - 0.5e-9) {
    wholeSecond += 1;
    fraction = 0;
  }

  return {
    utcIso: formatDateSecond(
      wholeSecond,
      fraction,
    ),
    utcJulianDate:
      2440587.5 +
      (wholeSecond + fraction) / SECONDS_PER_DAY,
    taiMinusUtcSeconds:
      selected.taiMinusUtcSeconds,
    utcLabelKind: "ordinary",
  };
}

function makeInstant(
  kernel: LeapSecondKernelData,
  utc: UtcFromTt,
  ttSecondsPastJ2000: number,
  etSecondsPastJ2000: number,
): TimeInstant {
  return Object.freeze({
    utcIso: utc.utcIso,
    utcJulianDate: utc.utcJulianDate,
    taiMinusUtcSeconds:
      utc.taiMinusUtcSeconds,
    ttJulianDate:
      J2000_JD +
      ttSecondsPastJ2000 / SECONDS_PER_DAY,
    tdbJulianDate:
      J2000_JD +
      etSecondsPastJ2000 / SECONDS_PER_DAY,
    etSecondsPastJ2000,
    tdbMinusTtSeconds:
      etSecondsPastJ2000 - ttSecondsPastJ2000,
    utcLabelKind: utc.utcLabelKind,
    provenance: Object.freeze({
      leapSecondKernel: kernel.sourceName,
      model: "NAIF-DELTET" as const,
    }),
  });
}

export class TimeConverter {
  constructor(
    private readonly kernel: LeapSecondKernelData,
  ) {}

  fromUtc(isoUtc: string): TimeInstant {
    const parsed = parseIsoUtc(isoUtc);

    let utcJulianDate: number;
    let ttSecondsPastJ2000: number;
    let taiMinusUtcSeconds: number;
    let utcLabelKind: TimeInstant["utcLabelKind"];

    if (parsed.second === 60) {
      const leap = positiveLeapSecond(
        this.kernel,
        parsed,
      );
      utcJulianDate = leap.utcJulianDate;
      ttSecondsPastJ2000 =
        leap.ttSecondsPastJ2000;
      taiMinusUtcSeconds =
        leap.taiMinusUtcSeconds;
      utcLabelKind = "positive-leap-second";
    } else {
      const unixSeconds =
        parsed.unixMsAtWholeSecond / 1000 +
        parsed.fractionSeconds;
      utcJulianDate =
        unixMsToJulianDate(
          parsed.unixMsAtWholeSecond,
        ) +
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

    const periodic = tdbMinusTtSeconds(
      this.kernel,
      ttSecondsPastJ2000,
    );
    const etSecondsPastJ2000 =
      ttSecondsPastJ2000 + periodic;

    return makeInstant(
      this.kernel,
      {
        utcIso: parsed.normalizedIso,
        utcJulianDate,
        taiMinusUtcSeconds,
        utcLabelKind,
      },
      ttSecondsPastJ2000,
      etSecondsPastJ2000,
    );
  }

  fromEt(
    etSecondsPastJ2000: number,
  ): TimeInstant {
    if (!Number.isFinite(etSecondsPastJ2000)) {
      throw new Error(
        "ET seconds past J2000 must be finite.",
      );
    }

    const ttSecondsPastJ2000 = ttSecondsFromEt(
      this.kernel,
      etSecondsPastJ2000,
    );
    const utc = utcFromTtSeconds(
      this.kernel,
      ttSecondsPastJ2000,
    );
    return makeInstant(
      this.kernel,
      utc,
      ttSecondsPastJ2000,
      etSecondsPastJ2000,
    );
  }
}
