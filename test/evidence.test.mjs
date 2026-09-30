import test from "node:test";
import assert from "node:assert/strict";
import {
  EvidenceRegistry,
} from "../.test-dist/src/evidence/EvidenceProvider.js";
import {
  EvidenceResolver,
} from "../.test-dist/src/evidence/EvidenceResolver.js";

function evidence(
  sourceId,
  spatialMeters,
  overrides = {},
) {
  return {
    source: {
      id: sourceId,
      name: sourceId,
      authority: "official",
    },
    resolution: { spatialMeters },
    referenceFrame: "ITRF93",
    kind: "measurement",
    license: { name: "test" },
    attribution: { text: "test" },
    integrity: { verified: true },
    payload: {
      kind: "terrain-tile",
      data: { sourceId },
    },
    ...overrides,
  };
}

function provider(
  id,
  available,
  value,
) {
  return {
    id,
    payloadKinds: [
      "terrain-tile",
    ],
    coverage() {
      return available
        ? { status: "available" }
        : {
            status: "unavailable",
            reason:
              "outside footprint",
          };
    },
    resolve() {
      return available
        ? value
        : null;
    },
  };
}

test(
  "resolver prefers finer valid spatial evidence",
  async () => {
    const registry =
      new EvidenceRegistry();
    registry.register(
      provider(
        "copernicus",
        true,
        evidence(
          "copernicus",
          30,
        ),
      ),
    );
    registry.register(
      provider(
        "hma",
        true,
        evidence("hma", 8),
      ),
    );

    const result =
      await new EvidenceResolver(
        registry,
      ).resolveBest({
        payloadKind:
          "terrain-tile",
        requiredReferenceFrame:
          "ITRF93",
        selectionCriteria: [
          "spatial-resolution",
          "source-authority",
        ],
      });

    assert.equal(
      result.evidence?.source.id,
      "hma",
    );
  },
);

test(
  "resolver falls back when regional evidence is outside coverage",
  async () => {
    const registry =
      new EvidenceRegistry();
    registry.register(
      provider(
        "copernicus",
        true,
        evidence(
          "copernicus",
          30,
        ),
      ),
    );
    registry.register(
      provider(
        "hma",
        false,
        evidence("hma", 8),
      ),
    );

    const result =
      await new EvidenceResolver(
        registry,
      ).resolveBest({
        payloadKind:
          "terrain-tile",
      });

    assert.equal(
      result.evidence?.source.id,
      "copernicus",
    );
    assert.deepEqual(
      result.unavailableProviders,
      [
        {
          providerId: "hma",
          reason:
            "outside footprint",
        },
      ],
    );
  },
);

test(
  "temporal comparison uses caller-supplied continuous timeline",
  async () => {
    const registry =
      new EvidenceRegistry();

    registry.register(
      provider(
        "undated",
        true,
        evidence(
          "undated",
          10,
        ),
      ),
    );

    registry.register(
      provider(
        "dated",
        true,
        evidence(
          "dated",
          10,
          {
            observationEpoch: {
              utcIso:
                "2016-12-31T23:59:60Z",
              timeline:
                "TAI_UNIX",
              timelineSeconds:
                1483228836,
            },
          },
        ),
      ),
    );

    const result =
      await new EvidenceResolver(
        registry,
      ).resolveBest({
        payloadKind:
          "terrain-tile",
        epoch: {
          utcIso:
            "2017-01-01T00:00:00Z",
          timeline:
            "TAI_UNIX",
          timelineSeconds:
            1483228837,
        },
        selectionCriteria: [
          "temporal-distance",
          "spatial-resolution",
        ],
      });

    assert.equal(
      result.evidence?.source.id,
      "dated",
    );
  },
);

test(
  "resolver rejects evidence that violates a hard frame constraint",
  async () => {
    const registry =
      new EvidenceRegistry();

    registry.register(
      provider(
        "wrong-frame",
        true,
        evidence(
          "wrong-frame",
          5,
          {
            referenceFrame:
              "MOON_PA_DE440",
          },
        ),
      ),
    );

    await assert.rejects(
      () =>
        new EvidenceResolver(
          registry,
        ).resolveBest({
          payloadKind:
            "terrain-tile",
          requiredReferenceFrame:
            "ITRF93",
        }),
      /expected ITRF93/,
    );
  },
);


test(
  "BMNG provider exposes the existing Earth surface as dated evidence",
  async () => {
    const {
      EarthBmngEvidenceProvider,
    } = await import(
      "../.test-dist/src/evidence/providers/EarthBmngEvidenceProvider.js"
    );

    const registry =
      new EvidenceRegistry();
    registry.register(
      new EarthBmngEvidenceProvider(),
    );

    const result =
      await new EvidenceResolver(
        registry,
      ).resolveBest({
        payloadKind:
          "raster-tile",
        bodyId: 399,
        epoch: {
          utcIso:
            "2026-09-29T12:00:00Z",
        },
        requiredReferenceFrame:
          "ITRF93",
        acceptableEvidenceKinds: [
          "reconstruction",
        ],
      });

    assert.equal(
      result.evidence?.source.id,
      "nasa-earth-bmng-2004",
    );
    assert.equal(
      result.evidence?.source.product,
      "Blue Marble: Next Generation — Base Map",
    );
    assert.equal(
      result.evidence?.kind,
      "reconstruction",
    );
    assert.equal(
      result.evidence?.integrity.verified,
      false,
    );
    assert.equal(
      result.evidence?.temporalExtent?.start?.utcIso,
      "2004-09-01T00:00:00Z",
    );
    assert.equal(
      result.evidence?.temporalExtent?.end?.utcIso,
      "2004-10-01T00:00:00Z",
    );
    assert.match(
      result.evidence?.payload.uri ?? "",
      /september\/world\.200409\.3x5400x2700\.jpg$/,
    );
  },
);


test(
  "BMNG December evidence closes at the 2005 boundary",
  async () => {
    const {
      EarthBmngEvidenceProvider,
    } = await import(
      "../.test-dist/src/evidence/providers/EarthBmngEvidenceProvider.js"
    );

    const evidence =
      new EarthBmngEvidenceProvider().resolve({
        payloadKind: "raster-tile",
        bodyId: 399,
        epoch: {
          utcIso: "2016-12-31T23:59:60.5Z",
        },
      });

    assert.ok(evidence);
    assert.equal(
      evidence.temporalExtent?.start?.utcIso,
      "2004-12-01T00:00:00Z",
    );
    assert.equal(
      evidence.temporalExtent?.end?.utcIso,
      "2005-01-01T00:00:00Z",
    );
  },
);
