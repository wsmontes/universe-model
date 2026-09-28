const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

export interface LeapSecondEntry {
  readonly taiMinusUtcSeconds: number;
  readonly effectiveUtcIso: string;
  readonly effectiveUnixMs: number;
}

export interface LeapSecondKernelData {
  readonly deltaTaSeconds: number;
  readonly kSeconds: number;
  readonly eccentricity: number;
  readonly meanAnomalyAtJ2000Rad: number;
  readonly meanAnomalyRateRadPerSecond: number;
  readonly leapSeconds: readonly LeapSecondEntry[];
  readonly sourceName: string;
}

function parseFortranNumber(raw: string): number {
  const value = Number(raw.replace(/[dD]/g, "E"));
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value in LSK: ${raw}`);
  }
  return value;
}

function requireScalar(text: string, name: string): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*=\\s*([+\\-0-9.DEd]+)`));
  if (!match?.[1]) {
    throw new Error(`Missing ${name} in leap-seconds kernel.`);
  }
  return parseFortranNumber(match[1]);
}

function parseEffectiveDate(year: string, monthName: string, day: string): { iso: string; unixMs: number } {
  const month = MONTHS[monthName.toUpperCase()];
  if (!month) {
    throw new Error(`Unknown month in leap-seconds kernel: ${monthName}`);
  }
  const y = Number(year);
  const d = Number(day);
  const iso = `${year.padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00Z`;
  const unixMs = Date.UTC(y, month - 1, d, 0, 0, 0, 0);
  if (!Number.isFinite(unixMs)) {
    throw new Error(`Invalid leap-second effective date: ${iso}`);
  }
  return { iso, unixMs };
}

export function parseLeapSecondKernel(text: string, sourceName = "NAIF LSK"): LeapSecondKernelData {
  if (!text.includes("KPL/LSK")) {
    throw new Error("The supplied text is not a NAIF leap-seconds kernel.");
  }

  const mMatch = text.match(/DELTET\/M\s*=\s*\(\s*([+\-0-9.DEd]+)\s+([+\-0-9.DEd]+)\s*\)/);
  if (!mMatch?.[1] || !mMatch[2]) {
    throw new Error("Missing DELTET/M constants in leap-seconds kernel.");
  }

  const leapSeconds: LeapSecondEntry[] = [];
  const leapPattern = /(\d+)\s*,\s*@([+-]?\d+)-([A-Z]{3})-(\d+)/g;
  for (const match of text.matchAll(leapPattern)) {
    const [, deltaAtRaw, yearRaw, monthRaw, dayRaw] = match;
    if (!deltaAtRaw || !yearRaw || !monthRaw || !dayRaw) continue;
    const effective = parseEffectiveDate(yearRaw, monthRaw, dayRaw);
    leapSeconds.push({
      taiMinusUtcSeconds: Number(deltaAtRaw),
      effectiveUtcIso: effective.iso,
      effectiveUnixMs: effective.unixMs,
    });
  }

  if (leapSeconds.length === 0) {
    throw new Error("No leap-second entries found in leap-seconds kernel.");
  }

  leapSeconds.sort((a, b) => a.effectiveUnixMs - b.effectiveUnixMs);

  return Object.freeze({
    deltaTaSeconds: requireScalar(text, "DELTET/DELTA_T_A"),
    kSeconds: requireScalar(text, "DELTET/K"),
    eccentricity: requireScalar(text, "DELTET/EB"),
    meanAnomalyAtJ2000Rad: parseFortranNumber(mMatch[1]),
    meanAnomalyRateRadPerSecond: parseFortranNumber(mMatch[2]),
    leapSeconds: Object.freeze(leapSeconds),
    sourceName,
  });
}

export function taiMinusUtcAt(kernel: LeapSecondKernelData, unixMs: number): number {
  let selected: LeapSecondEntry | undefined;
  for (const entry of kernel.leapSeconds) {
    if (unixMs >= entry.effectiveUnixMs) selected = entry;
    else break;
  }
  if (!selected) {
    const earliest = kernel.leapSeconds[0];
    throw new Error(
      `UTC conversion is not supported before ${earliest?.effectiveUtcIso ?? "the first LSK entry"}. ` +
      "Use a TDB epoch for historical dates rather than inventing pre-UTC timing.",
    );
  }
  return selected.taiMinusUtcSeconds;
}
