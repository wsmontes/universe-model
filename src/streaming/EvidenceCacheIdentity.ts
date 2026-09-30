import type {
  Evidence,
} from "../evidence/types.js";

export interface EvidenceCacheIdentity {
  readonly key: string;
  readonly persistentSafe: boolean;
  readonly reason: string;
}

function encode(
  value: string,
): string {
  return encodeURIComponent(value);
}

export function evidenceCacheIdentity(
  evidence: Evidence,
): EvidenceCacheIdentity {
  const integrityToken =
    evidence.integrity.digest ??
    evidence.integrity.immutableId ??
    evidence.source.version ??
    "mutable-or-unknown";

  const epochToken =
    evidence.observationEpoch?.utcIso ??
    evidence.temporalExtent?.start?.utcIso ??
    "undated";

  const uriToken =
    evidence.payload.uri ??
    "inline";

  const key = [
    "evidence-v1",
    encode(evidence.source.id),
    encode(
      evidence.source.product ??
        "product-unknown",
    ),
    encode(integrityToken),
    encode(evidence.payload.kind),
    encode(epochToken),
    encode(uriToken),
  ].join(":");

  const persistentSafe =
    evidence.integrity.verified &&
    (
      evidence.integrity.digest !==
        undefined ||
      evidence.integrity.immutableId !==
        undefined
    );

  return Object.freeze({
    key,
    persistentSafe,
    reason: persistentSafe
      ? "verified immutable evidence identity"
      : "evidence is not both verified and immutably identified",
  });
}
