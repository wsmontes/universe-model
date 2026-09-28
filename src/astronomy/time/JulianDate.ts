export const J2000_JD = 2_451_545.0;
export const MILLISECONDS_PER_DAY = 86_400_000;
export const UNIX_EPOCH_JD = 2_440_587.5;

export function unixMsToJulianDate(unixMs: number): number {
  if (!Number.isFinite(unixMs)) throw new Error("Unix time must be finite.");
  return UNIX_EPOCH_JD + unixMs / MILLISECONDS_PER_DAY;
}

export function julianDateToUnixMs(jd: number): number {
  if (!Number.isFinite(jd)) throw new Error("Julian date must be finite.");
  return (jd - UNIX_EPOCH_JD) * MILLISECONDS_PER_DAY;
}
