import { pckRadii } from "../astronomy/pck/ShapeConstants.js";

function model(bodyId, name, diffuseReflectance, baseReflectanceRgb, emissive, modelDescription) {
  const radii = pckRadii(bodyId);
  const tuple = [radii.xMeters, radii.yMeters, radii.zMeters];
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

export const BODY_MODELS = Object.freeze({
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
    "pck00011 oblate ellipsoid; BMNG reference color when available",
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

export function bodyModel(bodyId) {
  const model = BODY_MODELS[bodyId];
  if (!model) throw new Error("No physical render model registered for NAIF body " + bodyId + ".");
  return model;
}
