import { pckRadii } from "../astronomy/pck/ShapeConstants.js";

export interface BodyRenderModel {
  readonly bodyId: number;
  readonly name: string;
  /** Conservative scalar radius used for framing and eclipse bounds. */
  readonly radiusMeters: number;
  readonly radiiMeters: readonly [number, number, number];
  readonly shapeSource: string;
  readonly diffuseReflectance: number;
  readonly baseReflectanceRgb: readonly [number, number, number];
  readonly emissive: boolean;
  readonly modelDescription: string;
}

function model(
  bodyId: number,
  name: string,
  diffuseReflectance: number,
  baseReflectanceRgb: readonly [number, number, number],
  emissive: boolean,
  modelDescription: string,
): BodyRenderModel {
  const radii = pckRadii(bodyId);
  const tuple = [radii.xMeters, radii.yMeters, radii.zMeters] as const;
  return Object.freeze({
    bodyId,
    name,
    radiusMeters: Math.max(...tuple),
    radiiMeters: tuple,
    shapeSource: radii.source,
    diffuseReflectance,
    baseReflectanceRgb,
    emissive,
    modelDescription,
  });
}

export const BODY_MODELS: Readonly<Record<number, BodyRenderModel>> = Object.freeze({
  10: model(
    10,
    "Sun",
    0,
    [1, 1, 1],
    true,
    "pck00011 sphere; emissive display model",
  ),
  399: model(
    399,
    "Earth",
    0.30,
    [1, 1, 1],
    false,
    "pck00011 oblate ellipsoid; uniform diffuse reflectance",
  ),
  301: model(
    301,
    "Moon",
    0.12,
    [0.95, 0.95, 0.95],
    false,
    "pck00011 sphere; uniform diffuse reflectance",
  ),
});

export function bodyModel(bodyId: number): BodyRenderModel {
  const model = BODY_MODELS[bodyId];
  if (!model) throw new Error(`No physical render model registered for NAIF body ${bodyId}.`);
  return model;
}
