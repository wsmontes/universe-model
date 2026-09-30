import test from "node:test";
import assert from "node:assert/strict";
import {
  EvidenceRegistry,
} from "../.test-dist/src/evidence/EvidenceProvider.js";
import {
  EvidenceIntegrityError,
  EvidenceResolver,
} from "../.test-dist/src/evidence/EvidenceResolver.js";
import {
  spatialContainment,
} from "../.test-dist/src/evidence/SpatialCoverage.js";

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


test(
  "typed geodetic bounds distinguish Everest from Victoria",
  () => {
    const himalaya = {
      kind: "geodetic-bounds",
      bodyId: 399,
      southLatitudeDegrees: 26,
      northLatitudeDegrees: 36,
      westLongitudeDegrees: 75,
      eastLongitudeDegrees: 96,
      referenceFrame: "ITRF93",
    };

    const everest = {
      kind: "geodetic",
      bodyId: 399,
      latitudeDegrees: 27.9881,
      longitudeDegrees: 86.925,
      referenceFrame: "ITRF93",
    };

    const victoria = {
      kind: "geodetic",
      bodyId: 399,
      latitudeDegrees: 48.4284,
      longitudeDegrees: -123.3656,
      referenceFrame: "ITRF93",
    };

    assert.equal(
      spatialContainment(himalaya, everest),
      "contains",
    );
    assert.equal(
      spatialContainment(himalaya, victoria),
      "outside",
    );
  },
);

test(
  "geodetic bounds support antimeridian-crossing footprints",
  () => {
    const crossing = {
      kind: "geodetic-bounds",
      bodyId: 399,
      southLatitudeDegrees: -20,
      northLatitudeDegrees: 20,
      westLongitudeDegrees: 170,
      eastLongitudeDegrees: -170,
      referenceFrame: "ITRF93",
    };

    assert.equal(
      spatialContainment(crossing, {
        kind: "geodetic",
        bodyId: 399,
        latitudeDegrees: 0,
        longitudeDegrees: 179,
        referenceFrame: "ITRF93",
      }),
      "contains",
    );
    assert.equal(
      spatialContainment(crossing, {
        kind: "geodetic",
        bodyId: 399,
        latitudeDegrees: 0,
        longitudeDegrees: 0,
        referenceFrame: "ITRF93",
      }),
      "outside",
    );
  },
);

test(
  "operational provider failures do not hide valid evidence",
  async () => {
    const registry =
      new EvidenceRegistry();

    registry.register({
      id: "offline-provider",
      payloadKinds: ["terrain-tile"],
      coverage() {
        throw new Error(
          "network unavailable",
        );
      },
      resolve() {
        throw new Error(
          "should not resolve",
        );
      },
    });

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
          providerId:
            "offline-provider",
          reason:
            "coverage failed: network unavailable",
        },
      ],
    );
  },
);

test(
  "provider integrity violations fail resolution instead of silently falling back",
  async () => {
    const registry =
      new EvidenceRegistry();

    registry.register(
      provider(
        "valid-provider",
        true,
        evidence(
          "valid-provider",
          30,
        ),
      ),
    );
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
      (error) =>
        error instanceof
          EvidenceIntegrityError &&
        error.providerId ===
          "wrong-frame",
    );
  },
);

test(
  "resolver rejects provider evidence outside its declared footprint",
  async () => {
    const registry =
      new EvidenceRegistry();

    registry.register(
      provider(
        "regional-dem",
        true,
        evidence(
          "regional-dem",
          8,
          {
            spatialExtent: {
              kind:
                "geodetic-bounds",
              bodyId: 399,
              southLatitudeDegrees: 26,
              northLatitudeDegrees: 36,
              westLongitudeDegrees: 75,
              eastLongitudeDegrees: 96,
              referenceFrame:
                "ITRF93",
            },
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
          bodyId: 399,
          location: {
            kind: "geodetic",
            bodyId: 399,
            latitudeDegrees:
              48.4284,
            longitudeDegrees:
              -123.3656,
            referenceFrame:
              "ITRF93",
          },
        }),
      /outside its declared spatial extent/,
    );
  },
);
