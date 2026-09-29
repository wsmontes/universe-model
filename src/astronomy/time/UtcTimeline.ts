import type { LeapSecondKernelData } from "./LeapSecondKernel.js";
import { taiMinusUtcAt } from "./LeapSecondKernel.js";

const ISO_UTC =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

export interface UtcCalendarLabel {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly fractionalSecond: number;
  readonly isLeapSecond: boolean;
  readonly normalizedIso: string;
  /**
   * POSIX-like carrier used only to locate the UTC label on the civil
   * calendar. During 23:59:60 it maps to the following midnight plus the
   * fractional part; the older DELTA_AT value makes the derived TAI instant
   * continuous and unambiguous.
   */
  readonly posixUnixSeconds: number;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function normalizedFraction(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.replace(/0+$/, "");
  return trimmed ? "." + trimmed : "";
}

function validateCalendarFields(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  validationSecond: number,
  original: string,
): number {
  const unixMs = Date.UTC(year, month - 1, day, hour, minute, validationSecond, 0);
  const date = new Date(unixMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== validationSecond
  ) {
    throw new Error("Invalid UTC calendar timestamp: " + original);
  }
  return unixMs;
}

export function parseIsoUtcLabel(isoUtc: string): UtcCalendarLabel {
  const match = isoUtc.match(ISO_UTC);
  if (!match) {
    throw new Error(
      "UTC epoch must be an ISO-8601 timestamp ending in Z, e.g. 2026-09-27T21:00:00Z.",
    );
  }

  const [, yRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, fractionRaw = ""] = match;
  if (!yRaw || !monthRaw || !dayRaw || !hourRaw || !minuteRaw || !secondRaw) {
    throw new Error("Incomplete UTC epoch.");
  }

  const year = Number(yRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const fractionalSecond = fractionRaw ? Number("0." + fractionRaw) : 0;

  if (second > 60) throw new Error("UTC seconds must be between 00 and 60.");
  if (second === 60 && (hour !== 23 || minute !== 59)) {
    throw new Error("A UTC leap-second label is only valid at 23:59:60.");
  }

  const validationSecond = second === 60 ? 59 : second;
  const unixMs = validateCalendarFields(
    year,
    month,
    day,
    hour,
    minute,
    validationSecond,
    isoUtc,
  );

  const baseUnixSeconds =
    unixMs / 1000 + (second === 60 ? 1 : 0) + fractionalSecond;
  const normalizedIso =
    pad(year, 4) + "-" +
    pad(month, 2) + "-" +
    pad(day, 2) + "T" +
    pad(hour, 2) + ":" +
    pad(minute, 2) + ":" +
    pad(second, 2) +
    normalizedFraction(fractionRaw) +
    "Z";

  return Object.freeze({
    year,
    month,
    day,
    hour,
    minute,
    second,
    fractionalSecond,
    isLeapSecond: second === 60,
    normalizedIso,
    posixUnixSeconds: baseUnixSeconds,
  });
}

function positiveLeapTransition(
  kernel: LeapSecondKernelData,
  transitionUnixSeconds: number,
): { previousDeltaAt: number; currentDeltaAt: number } | null {
  for (let i = 1; i < kernel.leapSeconds.length; i += 1) {
    const current = kernel.leapSeconds[i];
    const previous = kernel.leapSeconds[i - 1];
    if (!current || !previous) continue;
    if (current.effectiveUnixMs / 1000 !== transitionUnixSeconds) continue;
    if (current.taiMinusUtcSeconds - previous.taiMinusUtcSeconds !== 1) return null;
    return {
      previousDeltaAt: previous.taiMinusUtcSeconds,
      currentDeltaAt: current.taiMinusUtcSeconds,
    };
  }
  return null;
}

/**
 * Converts an ISO UTC label into a continuous TAI-based Unix-second axis.
 *
 * The Unix epoch is used only as a numeric origin. Unlike POSIX time, this
 * axis includes inserted UTC leap seconds because DELTA_AT is part of the
 * mapping. It is therefore suitable for physical-time playback.
 */
export function utcIsoToTaiUnixSeconds(
  kernel: LeapSecondKernelData,
  isoUtc: string,
): number {
  const parsed = parseIsoUtcLabel(isoUtc);

  if (parsed.isLeapSecond) {
    const transitionUnixSeconds =
      parsed.posixUnixSeconds - parsed.fractionalSecond;
    const transition = positiveLeapTransition(kernel, transitionUnixSeconds);
    if (!transition) {
      throw new Error(
        parsed.normalizedIso +
          " is not a positive UTC leap second declared by " +
          kernel.sourceName +
          ".",
      );
    }
    return parsed.posixUnixSeconds + transition.previousDeltaAt;
  }

  // Use the containing UTC millisecond when selecting DELTA_AT. Rounding
  // could incorrectly cross a leap boundary for a label such as
  // 23:59:59.9996.
  const unixMs = Math.floor(parsed.posixUnixSeconds * 1000);
  const deltaAt = taiMinusUtcAt(kernel, unixMs);
  return parsed.posixUnixSeconds + deltaAt;
}

function formatFraction(value: number, digits: number): string {
  if (digits === 0) return "";
  const scale = 10 ** digits;
  const units = Math.round(value * scale);
  if (units <= 0) return "";
  return "." + String(units).padStart(digits, "0").replace(/0+$/, "");
}

function formatOrdinaryUtc(posixUnixSeconds: number, digits: number): string {
  const scale = 10 ** digits;
  const rounded = Math.round(posixUnixSeconds * scale) / scale;
  let whole = Math.floor(rounded);
  let fractional = rounded - whole;
  let fractionUnits = Math.round(fractional * scale);
  if (fractionUnits >= scale) {
    whole += 1;
    fractionUnits = 0;
    fractional = 0;
  } else {
    fractional = fractionUnits / scale;
  }

  const date = new Date(whole * 1000);
  return (
    pad(date.getUTCFullYear(), 4) + "-" +
    pad(date.getUTCMonth() + 1, 2) + "-" +
    pad(date.getUTCDate(), 2) + "T" +
    pad(date.getUTCHours(), 2) + ":" +
    pad(date.getUTCMinutes(), 2) + ":" +
    pad(date.getUTCSeconds(), 2) +
    formatFraction(fractional, digits) +
    "Z"
  );
}

/**
 * Inverse of utcIsoToTaiUnixSeconds for epochs covered by the LSK.
 *
 * Positive leap-second intervals are emitted with the literal 23:59:60
 * label. Negative leap seconds, should they ever appear in an LSK, need no
 * special label because the missing UTC second is naturally skipped by the
 * DELTA_AT boundary.
 */
export function taiUnixSecondsToUtcIso(
  kernel: LeapSecondKernelData,
  taiUnixSeconds: number,
  fractionalDigits = 3,
): string {
  if (!Number.isFinite(taiUnixSeconds)) {
    throw new Error("TAI timeline value must be finite.");
  }
  if (!Number.isInteger(fractionalDigits) || fractionalDigits < 0 || fractionalDigits > 3) {
    throw new Error("UTC formatting supports 0 to 3 fractional digits.");
  }

  for (let i = 1; i < kernel.leapSeconds.length; i += 1) {
    const current = kernel.leapSeconds[i];
    const previous = kernel.leapSeconds[i - 1];
    if (!current || !previous) continue;
    if (current.taiMinusUtcSeconds - previous.taiMinusUtcSeconds !== 1) continue;

    const transitionUnixSeconds = current.effectiveUnixMs / 1000;
    const leapStartTai = transitionUnixSeconds + previous.taiMinusUtcSeconds;
    const leapEndTai = transitionUnixSeconds + current.taiMinusUtcSeconds;
    if (taiUnixSeconds < leapStartTai || taiUnixSeconds >= leapEndTai) continue;

    const scale = 10 ** fractionalDigits;
    const fraction = taiUnixSeconds - leapStartTai;
    const roundedUnits = Math.round(fraction * scale);
    if (roundedUnits >= scale) {
      return taiUnixSecondsToUtcIso(kernel, leapEndTai, fractionalDigits);
    }

    const previousDate = new Date((transitionUnixSeconds - 1) * 1000);
    const fractional = roundedUnits / scale;
    return (
      pad(previousDate.getUTCFullYear(), 4) + "-" +
      pad(previousDate.getUTCMonth() + 1, 2) + "-" +
      pad(previousDate.getUTCDate(), 2) + "T" +
      pad(previousDate.getUTCHours(), 2) + ":" +
      pad(previousDate.getUTCMinutes(), 2) + ":60" +
      formatFraction(fractional, fractionalDigits) +
      "Z"
    );
  }

  let selected = kernel.leapSeconds[0];
  for (const entry of kernel.leapSeconds) {
    const effectiveTai =
      entry.effectiveUnixMs / 1000 + entry.taiMinusUtcSeconds;
    if (taiUnixSeconds >= effectiveTai) selected = entry;
    else break;
  }

  if (!selected) {
    throw new Error("TAI timeline precedes the first LSK entry.");
  }

  const first = kernel.leapSeconds[0];
  const firstTai =
    (first?.effectiveUnixMs ?? Number.POSITIVE_INFINITY) / 1000 +
    (first?.taiMinusUtcSeconds ?? 0);
  if (taiUnixSeconds < firstTai) {
    throw new Error(
      "TAI timeline precedes " +
        (first?.effectiveUtcIso ?? "the first LSK entry") +
        ".",
    );
  }

  return formatOrdinaryUtc(
    taiUnixSeconds - selected.taiMinusUtcSeconds,
    fractionalDigits,
  );
}

export function utcCalendarMonthIndex(isoUtc: string): number {
  return parseIsoUtcLabel(isoUtc).month - 1;
}
