import { SECONDS_PER_DAY } from "../../core/units.js";
import { taiMinusUtcAt } from "./LeapSecondKernel.js";
import { J2000_JD, unixMsToJulianDate } from "./JulianDate.js";
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;
function parseIsoUtc(isoUtc) {
    const match = isoUtc.match(ISO_UTC);
    if (!match) {
        throw new Error("UTC epoch must be an ISO-8601 timestamp ending in Z, e.g. 2026-09-27T21:00:00Z.");
    }
    const [, y, mo, d, h, mi, secRaw, fractionRaw = ""] = match;
    if (!y || !mo || !d || !h || !mi || !secRaw)
        throw new Error("Incomplete UTC epoch.");
    const sec = Number(secRaw);
    if (sec === 60) {
        throw new Error("The leap-second label :60 is intentionally not accepted yet. Use the instant immediately before or after the leap second; " +
            "the LSK discontinuity is modeled explicitly.");
    }
    if (sec > 59)
        throw new Error("UTC seconds must be between 00 and 59.");
    const millis = Number((fractionRaw + "000").slice(0, 3));
    const unixMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), sec, millis);
    const date = new Date(unixMs);
    if (date.getUTCFullYear() !== Number(y) ||
        date.getUTCMonth() !== Number(mo) - 1 ||
        date.getUTCDate() !== Number(d) ||
        date.getUTCHours() !== Number(h) ||
        date.getUTCMinutes() !== Number(mi) ||
        date.getUTCSeconds() !== sec) {
        throw new Error(`Invalid UTC calendar timestamp: ${isoUtc}`);
    }
    return { unixMs, normalizedIso: date.toISOString() };
}
function tdbMinusTtSeconds(kernel, ttSecondsPastJ2000) {
    let et = ttSecondsPastJ2000;
    for (let i = 0; i < 2; i += 1) {
        const m = kernel.meanAnomalyAtJ2000Rad + kernel.meanAnomalyRateRadPerSecond * et;
        const e = m + kernel.eccentricity * Math.sin(m);
        const periodic = kernel.kSeconds * Math.sin(e);
        et = ttSecondsPastJ2000 + periodic;
    }
    return et - ttSecondsPastJ2000;
}
export class TimeConverter {
    kernel;
    constructor(kernel) {
        this.kernel = kernel;
    }
    fromUtc(isoUtc) {
        const parsed = parseIsoUtc(isoUtc);
        const utcJulianDate = unixMsToJulianDate(parsed.unixMs);
        const taiMinusUtcSeconds = taiMinusUtcAt(this.kernel, parsed.unixMs);
        const ttMinusUtcSeconds = taiMinusUtcSeconds + this.kernel.deltaTaSeconds;
        const ttJulianDate = utcJulianDate + ttMinusUtcSeconds / SECONDS_PER_DAY;
        const ttSecondsPastJ2000 = (ttJulianDate - J2000_JD) * SECONDS_PER_DAY;
        const periodic = tdbMinusTtSeconds(this.kernel, ttSecondsPastJ2000);
        const etSecondsPastJ2000 = ttSecondsPastJ2000 + periodic;
        const tdbJulianDate = J2000_JD + etSecondsPastJ2000 / SECONDS_PER_DAY;
        return Object.freeze({
            utcIso: parsed.normalizedIso,
            utcJulianDate,
            taiMinusUtcSeconds,
            ttJulianDate,
            tdbJulianDate,
            etSecondsPastJ2000,
            tdbMinusTtSeconds: periodic,
            provenance: Object.freeze({
                leapSecondKernel: this.kernel.sourceName,
                model: "NAIF-DELTET",
            }),
        });
    }
}
