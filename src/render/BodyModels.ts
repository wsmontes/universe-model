export interface BodyRenderModel {
  readonly bodyId: number;
  readonly name: string;
  readonly radiusMeters: number;
  readonly diffuseReflectance: number;
  readonly baseReflectanceRgb: readonly [number, number, number];
  readonly emissive: boolean;
  readonly modelDescription: string;
}

export const BODY_MODELS: Readonly<Record<number, BodyRenderModel>> = Object.freeze({
  10: Object.freeze({
    bodyId: 10,
    name: "Sun",
    radiusMeters: 695_700_000,
    diffuseReflectance: 0,
    baseReflectanceRgb: [1, 1, 1] as const,
    emissive: true,
    modelDescription: "IAU nominal-radius sphere; emissive display model",
  }),
  399: Object.freeze({
    bodyId: 399,
    name: "Earth",
    radiusMeters: 6_371_008.8,
    diffuseReflectance: 0.30,
    baseReflectanceRgb: [1, 1, 1] as const,
    emissive: false,
    modelDescription: "mean-radius sphere; uniform diffuse reflectance; no invented texture",
  }),
  301: Object.freeze({
    bodyId: 301,
    name: "Moon",
    radiusMeters: 1_737_400,
    diffuseReflectance: 0.12,
    baseReflectanceRgb: [0.95, 0.95, 0.95] as const,
    emissive: false,
    modelDescription: "mean-radius sphere; uniform diffuse reflectance; no invented texture",
  }),
});

export function bodyModel(bodyId: number): BodyRenderModel {
  const model = BODY_MODELS[bodyId];
  if (!model) throw new Error(`No physical render model registered for NAIF body ${bodyId}.`);
  return model;
}
