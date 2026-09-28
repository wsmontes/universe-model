export interface TriaxialRadii {
  readonly xMeters: number;
  readonly yMeters: number;
  readonly zMeters: number;
  readonly source: string;
}

export const PCK00011_RADII: Readonly<Record<number, TriaxialRadii>> = Object.freeze({
  10: Object.freeze({
    xMeters: 695_700_000,
    yMeters: 695_700_000,
    zMeters: 695_700_000,
    source: "NASA/JPL NAIF pck00011.tpc BODY10_RADII",
  }),
  399: Object.freeze({
    xMeters: 6_378_136.6,
    yMeters: 6_378_136.6,
    zMeters: 6_356_751.9,
    source: "NASA/JPL NAIF pck00011.tpc BODY399_RADII",
  }),
  301: Object.freeze({
    xMeters: 1_737_400,
    yMeters: 1_737_400,
    zMeters: 1_737_400,
    source: "NASA/JPL NAIF pck00011.tpc BODY301_RADII",
  }),
});

export function pckRadii(bodyId: number): TriaxialRadii {
  const radii = PCK00011_RADII[bodyId];
  if (!radii) throw new Error(`No pinned pck00011 radii for body ${bodyId}.`);
  return radii;
}
