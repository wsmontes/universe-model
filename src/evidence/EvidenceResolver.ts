import { EvidenceRegistry } from "./EvidenceProvider.js";
import {
  spatialContainment,
} from "./SpatialCoverage.js";
import type {
  Evidence,
  EvidenceInstant,
  EvidenceQuery,
  EvidenceResolution,
  EvidenceSelectionCriterion,
  SourceAuthority,
  Uncertainty,
} from "./types.js";

const DEFAULT_SELECTION_CRITERIA = Object.freeze([
  "spatial-resolution",
  "temporal-distance",
  "uncertainty",
  "source-authority",
] satisfies readonly EvidenceSelectionCriterion[]);

const AUTHORITY_RANK: Readonly<
  Record<SourceAuthority, number>
> = Object.freeze({
  primary: 0,
  official: 1,
  "scientific-derived": 2,
  community: 3,
  unknown: 4,
});

export class EvidenceIntegrityError
  extends Error
{
  readonly providerId: string;

  constructor(
    providerId: string,
    message: string,
  ) {
    super(
      `Evidence integrity violation from ${providerId}: ${message}`,
    );
    this.name = "EvidenceIntegrityError";
    this.providerId = providerId;
  }
}

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function comparableSeconds(
  instant: EvidenceInstant | undefined,
  requiredTimeline: string | undefined,
): number | null {
  if (
    instant?.timelineSeconds === undefined ||
    !Number.isFinite(instant.timelineSeconds)
  ) {
    return null;
  }
  if (
    requiredTimeline !== undefined &&
    instant.timeline !== requiredTimeline
  ) {
    return null;
  }
  return instant.timelineSeconds;
}

function temporalDistanceSeconds(
  evidence: Evidence,
  query: EvidenceQuery,
): number {
  if (!query.epoch) return 0;

  const timeline = query.epoch.timeline;
  const requested = comparableSeconds(
    query.epoch,
    timeline,
  );
  if (requested === null) {
    return Number.POSITIVE_INFINITY;
  }

  const observed = comparableSeconds(
    evidence.observationEpoch,
    timeline,
  );
  if (observed !== null) {
    return Math.abs(requested - observed);
  }

  const start = comparableSeconds(
    evidence.temporalExtent?.start,
    timeline,
  );
  const end = comparableSeconds(
    evidence.temporalExtent?.end,
    timeline,
  );

  if (start !== null && requested < start) {
    return start - requested;
  }
  if (end !== null && requested > end) {
    return requested - end;
  }
  if (start !== null || end !== null) {
    return 0;
  }

  return Number.POSITIVE_INFINITY;
}

function uncertaintyMeters(
  uncertainty: Uncertainty | undefined,
): number {
  if (!uncertainty) {
    return Number.POSITIVE_INFINITY;
  }

  const values = [
    uncertainty.horizontalMeters,
    uncertainty.verticalMeters,
  ].filter(
    (value): value is number =>
      value !== undefined &&
      Number.isFinite(value),
  );

  return values.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.max(...values);
}

function criterionValue(
  criterion: EvidenceSelectionCriterion,
  evidence: Evidence,
  query: EvidenceQuery,
): number {
  switch (criterion) {
    case "spatial-resolution":
      return (
        evidence.resolution.spatialMeters ??
        Number.POSITIVE_INFINITY
      );
    case "temporal-distance":
      return temporalDistanceSeconds(
        evidence,
        query,
      );
    case "uncertainty":
      return uncertaintyMeters(
        evidence.uncertainty,
      );
    case "source-authority":
      return AUTHORITY_RANK[
        evidence.source.authority
      ];
  }
}

function compareEvidence(
  a: Evidence,
  b: Evidence,
  query: EvidenceQuery,
): number {
  const criteria =
    query.selectionCriteria ??
    DEFAULT_SELECTION_CRITERIA;

  for (const criterion of criteria) {
    const delta =
      criterionValue(criterion, a, query) -
      criterionValue(criterion, b, query);
    if (
      delta !== 0 &&
      !Number.isNaN(delta)
    ) {
      return delta;
    }
  }

  return a.source.id.localeCompare(
    b.source.id,
  );
}

function integrityFailure(
  evidence: Evidence,
  message: string,
): never {
  throw new EvidenceIntegrityError(
    evidence.source.id,
    message,
  );
}

function validateEvidence(
  evidence: Evidence,
  query: EvidenceQuery,
): void {
  if (
    evidence.payload.kind !==
    query.payloadKind
  ) {
    integrityFailure(
      evidence,
      `returned ${evidence.payload.kind} for ${query.payloadKind} query.`,
    );
  }

  if (
    query.requiredReferenceFrame !==
      undefined &&
    evidence.referenceFrame !==
      query.requiredReferenceFrame
  ) {
    integrityFailure(
      evidence,
      `returned reference frame ${evidence.referenceFrame}; expected ${query.requiredReferenceFrame}.`,
    );
  }

  if (
    query.requiredVerticalDatum !==
      undefined &&
    evidence.verticalDatum !==
      query.requiredVerticalDatum
  ) {
    integrityFailure(
      evidence,
      `returned vertical datum ${evidence.verticalDatum ?? "unknown"}; expected ${query.requiredVerticalDatum}.`,
    );
  }

  if (
    query.acceptableEvidenceKinds !==
      undefined &&
    !query.acceptableEvidenceKinds.includes(
      evidence.kind,
    )
  ) {
    integrityFailure(
      evidence,
      `returned disallowed evidence kind ${evidence.kind}.`,
    );
  }

  if (
    query.bodyId !== undefined &&
    evidence.spatialExtent !== undefined &&
    evidence.spatialExtent.bodyId !==
      query.bodyId
  ) {
    integrityFailure(
      evidence,
      `returned spatial extent for body ${evidence.spatialExtent.bodyId}; expected body ${query.bodyId}.`,
    );
  }

  if (
    query.location !== undefined &&
    evidence.spatialExtent !== undefined
  ) {
    let containment;
    try {
      containment = spatialContainment(
        evidence.spatialExtent,
        query.location,
      );
    } catch (error) {
      integrityFailure(
        evidence,
        `returned invalid spatial metadata: ${errorMessage(error)}`,
      );
    }

    if (containment === "outside") {
      integrityFailure(
        evidence,
        "returned evidence outside its declared spatial extent for the requested location.",
      );
    }
  }
}

export class EvidenceResolver {
  constructor(
    private readonly registry:
      EvidenceRegistry,
  ) {}

  async resolveBest(
    query: EvidenceQuery,
  ): Promise<EvidenceResolution> {
    if (
      query.bodyId !== undefined &&
      query.location !== undefined &&
      query.location.bodyId !== query.bodyId
    ) {
      throw new Error(
        `Evidence query body ${query.bodyId} conflicts with location body ${query.location.bodyId}.`,
      );
    }

    const providers =
      this.registry.matching(query);
    const consideredProviders =
      providers.map(
        (candidate) => candidate.id,
      );
    const unavailableProviders: {
      providerId: string;
      reason: string;
    }[] = [];
    const candidates: Evidence[] = [];

    await Promise.all(
      providers.map(async (candidate) => {
        let coverage;
        try {
          coverage =
            await candidate.coverage(query);
        } catch (error) {
          unavailableProviders.push({
            providerId: candidate.id,
            reason:
              `coverage failed: ${errorMessage(error)}`,
          });
          return;
        }

        if (
          coverage.status ===
          "unavailable"
        ) {
          unavailableProviders.push({
            providerId: candidate.id,
            reason:
              coverage.reason ??
              "outside provider coverage",
          });
          return;
        }

        let evidence;
        try {
          evidence =
            await candidate.resolve(query);
        } catch (error) {
          unavailableProviders.push({
            providerId: candidate.id,
            reason:
              `resolve failed: ${errorMessage(error)}`,
          });
          return;
        }

        if (!evidence) {
          unavailableProviders.push({
            providerId: candidate.id,
            reason:
              "provider reported coverage but returned no evidence",
          });
          return;
        }

        // Provider transport/availability failures are isolated above.
        // A provider that returns incompatible or self-contradictory
        // evidence is different: that is an integrity error and must
        // fail the resolution rather than being silently bypassed.
        validateEvidence(
          evidence,
          query,
        );
        candidates.push(evidence);
      }),
    );

    candidates.sort((a, b) =>
      compareEvidence(a, b, query),
    );
    unavailableProviders.sort(
      (a, b) =>
        a.providerId.localeCompare(
          b.providerId,
        ),
    );

    return Object.freeze({
      evidence: candidates[0] ?? null,
      consideredProviders: Object.freeze([
        ...consideredProviders,
      ]),
      unavailableProviders:
        Object.freeze(
          unavailableProviders.map(
            (entry) =>
              Object.freeze({
                ...entry,
              }),
          ),
        ),
    });
  }
}
