declare const meterBrand: unique symbol;
declare const secondBrand: unique symbol;

export type Meters = number & { readonly [meterBrand]: "meters" };
export type Seconds = number & { readonly [secondBrand]: "seconds" };

export const meters = (value: number): Meters => value as Meters;
export const seconds = (value: number): Seconds => value as Seconds;

export const METERS_PER_KILOMETER = 1000;
export const SECONDS_PER_DAY = 86400;
export const AU_METERS = 149_597_870_700;
