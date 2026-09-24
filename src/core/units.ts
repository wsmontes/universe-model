declare const meterBrand: unique symbol;
declare const secondBrand: unique symbol;

export type Meters = number & { readonly [meterBrand]: "meters" };
export type Seconds = number & { readonly [secondBrand]: "seconds" };

export const meters = (value: number): Meters => value as Meters;
export const seconds = (value: number): Seconds => value as Seconds;
