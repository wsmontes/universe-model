const PI = Math.PI;

export function circleVisibleFraction(
  sourceAngularRadius: number,
  occluderAngularRadius: number,
  angularSeparation: number,
): number {
  if (!(sourceAngularRadius > 0)) return 1;
  if (!(occluderAngularRadius > 0)) return 1;
  if (angularSeparation >= sourceAngularRadius + occluderAngularRadius) return 1;

  const radiusDifference = Math.abs(occluderAngularRadius - sourceAngularRadius);
  if (angularSeparation <= radiusDifference) {
    if (occluderAngularRadius >= sourceAngularRadius) return 0;
    const covered = (occluderAngularRadius * occluderAngularRadius) /
      (sourceAngularRadius * sourceAngularRadius);
    return Math.max(0, Math.min(1, 1 - covered));
  }

  const r1 = sourceAngularRadius;
  const r2 = occluderAngularRadius;
  const d = angularSeparation;
  const cosine1 = Math.max(-1, Math.min(1, (d * d + r1 * r1 - r2 * r2) / (2 * d * r1)));
  const cosine2 = Math.max(-1, Math.min(1, (d * d + r2 * r2 - r1 * r1) / (2 * d * r2)));
  const radical = Math.max(
    0,
    (-d + r1 + r2) *
      (d + r1 - r2) *
      (d - r1 + r2) *
      (d + r1 + r2),
  );
  const overlap =
    r1 * r1 * Math.acos(cosine1) +
    r2 * r2 * Math.acos(cosine2) -
    0.5 * Math.sqrt(radical);
  const sourceArea = PI * r1 * r1;
  return Math.max(0, Math.min(1, 1 - overlap / sourceArea));
}
