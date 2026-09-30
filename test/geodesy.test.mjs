import test from "node:test";
import assert from "node:assert/strict";
import {
  EARTH_PCK00011_ELLIPSOID,
} from "../.test-dist/src/geodesy/ReferenceEllipsoid.js";
import {
  bodyFixedToGeodetic,
  geodeticToBodyFixed,
} from "../.test-dist/src/geodesy/Geodetic.js";
import {
  VerticalDatumTransformRegistry,
  VerticalDatumTransformUnavailableError,
} from "../.test-dist/src/geodesy/VerticalDatum.js";
import {
  isTerrainTile,
  validateTerrainTile,
} from "../.test-dist/src/terrain/TerrainTile.js";
import {
  buildTerrainMesh,
} from "../.test-dist/src/terrain/TerrainMesh.js";
import {
  localizeTerrainMesh,
} from "../.test-dist/src/terrain/TerrainLocalMesh.js";
import {
  terrainFramePlacement,
} from "../.test-dist/src/terrain/TerrainFramePlacement.js";

const earth =
  EARTH_PCK00011_ELLIPSOID;

test("Earth geodesy uses the pinned pck00011 ellipsoid", () => {
  assert.equal(
    earth.bodyId,
    399,
  );
  assert.equal(
    earth.referenceFrame,
    "ITRF93",
  );
  assert.equal(
    earth.semiMajorMeters,
    6_378_136.6,
  );
  assert.equal(
    earth.semiMinorMeters,
    6_356_751.9,
  );
  assert.match(
    earth.source,
    /pck00011/,
  );
});

test("geodetic equator and poles land exactly on the reference ellipsoid axes", () => {
  const equator =
    geodeticToBodyFixed(
      earth,
      0,
      0,
      0,
    );
  assert.ok(
    Math.abs(
      equator.x -
      earth.semiMajorMeters,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(equator.y) <
      1e-12,
  );
  assert.ok(
    Math.abs(equator.z) <
      1e-12,
  );

  const northPole =
    geodeticToBodyFixed(
      earth,
      90,
      0,
      0,
    );
  assert.ok(
    Math.abs(northPole.x) <
      1e-6,
  );
  assert.ok(
    Math.abs(northPole.y) <
      1e-12,
  );
  assert.ok(
    Math.abs(
      northPole.z -
      earth.semiMinorMeters,
    ) < 1e-9,
  );
});

test("geodetic/body-fixed conversion round-trips physical positions", () => {
  const positions = [
    {
      latitudeDegrees:
        27.9881,
      longitudeDegrees:
        86.925,
      heightMeters: 123.4,
    },
    {
      latitudeDegrees:
        48.4284,
      longitudeDegrees:
        -123.3656,
      heightMeters: 10,
    },
    {
      latitudeDegrees: 80,
      longitudeDegrees: 179,
      heightMeters: 5_000,
    },
    {
      latitudeDegrees: -45,
      longitudeDegrees: -170,
      heightMeters: -20,
    },
  ];

  for (const source of positions) {
    const fixed =
      geodeticToBodyFixed(
        earth,
        source.latitudeDegrees,
        source.longitudeDegrees,
        source.heightMeters,
      );
    const recovered =
      bodyFixedToGeodetic(
        earth,
        fixed,
      );

    assert.ok(
      Math.abs(
        recovered.latitudeDegrees -
        source.latitudeDegrees,
      ) < 1e-9,
    );
    assert.ok(
      Math.abs(
        recovered.longitudeDegrees -
        source.longitudeDegrees,
      ) < 1e-9,
    );
    assert.ok(
      Math.abs(
        recovered.ellipsoidalHeightMeters -
        source.heightMeters,
      ) < 1e-4,
    );
  }
});

test("geodetic inverse refuses the undefined ellipsoid centre", () => {
  assert.throws(
    () =>
      bodyFixedToGeodetic(
        earth,
        {
          x: 0,
          y: 0,
          z: 0,
        },
      ),
    /undefined at the ellipsoid center/,
  );
});

test("vertical datum identity is exact and unknown transforms fail", async () => {
  const registry =
    new VerticalDatumTransformRegistry();

  const location = {
    kind: "geodetic",
    bodyId: 399,
    latitudeDegrees: 27.9881,
    longitudeDegrees: 86.925,
    referenceFrame: "ITRF93",
  };

  assert.equal(
    await registry.transformHeight(
      399,
      100,
      location,
      "ELLIPSOIDAL",
      "ELLIPSOIDAL",
    ),
    100,
  );

  await assert.rejects(
    () =>
      registry.transformHeight(
        399,
        100,
        location,
        "EGM2008",
        "ELLIPSOIDAL",
      ),
    VerticalDatumTransformUnavailableError,
  );
});

test("registered vertical datum transform is explicit and location-aware", async () => {
  const registry =
    new VerticalDatumTransformRegistry();

  registry.register({
    from: "TEST_GEOID",
    to: "ELLIPSOIDAL",
    bodyId: 399,
    offsetMetersAt(location) {
      assert.equal(
        location.latitudeDegrees,
        10,
      );
      return 12.5;
    },
  });

  const converted =
    await registry.transformHeight(
      399,
      80,
      {
        kind: "geodetic",
        bodyId: 399,
        latitudeDegrees: 10,
        longitudeDegrees: 20,
        referenceFrame: "ITRF93",
        verticalDatum:
          "TEST_GEOID",
      },
      "TEST_GEOID",
      "ELLIPSOIDAL",
    );

  assert.equal(
    converted,
    92.5,
  );
});

function terrainTile(
  overrides = {},
) {
  return {
    id: "terrain-test",
    bodyId: 399,
    extent: {
      kind:
        "geodetic-bounds",
      bodyId: 399,
      southLatitudeDegrees: 27,
      northLatitudeDegrees: 28,
      westLongitudeDegrees: 86,
      eastLongitudeDegrees: 87,
      referenceFrame: "ITRF93",
      verticalDatum:
        "TEST_DATUM",
    },
    referenceFrame:
      "ITRF93",
    verticalDatum:
      "TEST_DATUM",
    geometricErrorMeters: 30,
    width: 2,
    height: 2,
    elevationsMeters:
      new Float32Array([
        1, 2,
        3, 4,
      ]),
    ...overrides,
  };
}

test("TerrainTile validates grid size frame datum and body", () => {
  const valid =
    terrainTile();

  assert.equal(
    isTerrainTile(valid),
    true,
  );
  assert.doesNotThrow(
    () =>
      validateTerrainTile(
        valid,
      ),
  );

  assert.throws(
    () =>
      validateTerrainTile(
        terrainTile({
          verticalDatum:
            "OTHER_DATUM",
        }),
      ),
    /datum/,
  );

  assert.throws(
    () =>
      validateTerrainTile(
        terrainTile({
          referenceFrame:
            "J2000",
        }),
      ),
    /frame/,
  );

  assert.throws(
    () =>
      validateTerrainTile(
        terrainTile({
          elevationsMeters:
            new Float32Array(
              [1, 2, 3],
            ),
        }),
      ),
    /expected 4/,
  );
});


test("terrain mesh stays float64/body-fixed and converts source datum before geometry", async () => {
  const transforms =
    new VerticalDatumTransformRegistry();

  transforms.register({
    from: "TEST_GEOID",
    to:
      "EARTH_PCK00011_ELLIPSOIDAL",
    bodyId: 399,
    offsetsMetersAt(locations) {
      return locations.map(
        () => 5,
      );
    },
    offsetMetersAt() {
      return 5;
    },
  });

  const tile = {
    id: "datum-tile",
    bodyId: 399,
    extent: {
      kind:
        "geodetic-bounds",
      bodyId: 399,
      southLatitudeDegrees: 0,
      northLatitudeDegrees: 0.01,
      westLongitudeDegrees: 0,
      eastLongitudeDegrees: 0.01,
      referenceFrame: "ITRF93",
      verticalDatum:
        "TEST_GEOID",
    },
    referenceFrame: "ITRF93",
    verticalDatum: "TEST_GEOID",
    geometricErrorMeters: 30,
    width: 2,
    height: 2,
    elevationsMeters:
      new Float32Array([
        10, 10,
        10, 10,
      ]),
  };

  const mesh =
    await buildTerrainMesh(
      tile,
      earth,
      {
        id:
          "EARTH_PCK00011_ELLIPSOIDAL",
        kind: "ellipsoidal",
        bodyId: 399,
        source: "test",
      },
      transforms,
    );

  assert.ok(
    mesh.positionsBodyFixedMeters instanceof
      Float64Array,
  );
  assert.equal(
    mesh.minimumEllipsoidalHeightMeters,
    15,
  );
  assert.equal(
    mesh.maximumEllipsoidalHeightMeters,
    15,
  );
  assert.equal(
    mesh.indices.length,
    6,
  );

  const recovered =
    bodyFixedToGeodetic(
      earth,
      {
        x:
          mesh.positionsBodyFixedMeters[0],
        y:
          mesh.positionsBodyFixedMeters[1],
        z:
          mesh.positionsBodyFixedMeters[2],
      },
    );

  assert.ok(
    Math.abs(
      recovered.ellipsoidalHeightMeters -
        15,
    ) < 1e-4,
  );
});

test("terrain triangle winding produces outward body-fixed normals", async () => {
  const tile = terrainTile({
    extent: {
      kind:
        "geodetic-bounds",
      bodyId: 399,
      southLatitudeDegrees: -0.01,
      northLatitudeDegrees: 0.01,
      westLongitudeDegrees: -0.01,
      eastLongitudeDegrees: 0.01,
      referenceFrame: "ITRF93",
      verticalDatum:
        "TEST_DATUM",
    },
    elevationsMeters:
      new Float64Array(
        [0, 0, 0, 0],
      ),
  });

  const mesh =
    await buildTerrainMesh(
      tile,
      earth,
      {
        id: "TEST_DATUM",
        kind: "ellipsoidal",
        bodyId: 399,
        source: "test",
      },
      new VerticalDatumTransformRegistry(),
    );

  for (
    let i = 0;
    i <
      mesh.validVertexMask.length;
    i += 1
  ) {
    if (!mesh.validVertexMask[i]) {
      continue;
    }

    const offset = i * 3;
    const dot =
      mesh.positionsBodyFixedMeters[
        offset
      ] *
        mesh.normalsBodyFixed[
          offset
        ] +
      mesh.positionsBodyFixedMeters[
        offset + 1
      ] *
        mesh.normalsBodyFixed[
          offset + 1
        ] +
      mesh.positionsBodyFixedMeters[
        offset + 2
      ] *
        mesh.normalsBodyFixed[
          offset + 2
        ];

    assert.ok(dot > 0);
  }
});

test("terrain no-data removes triangles instead of inventing elevations", async () => {
  const noData = -9999;
  const tile = terrainTile({
    noDataValue: noData,
    elevationsMeters:
      new Float32Array([
        1, 2,
        3, noData,
      ]),
  });

  const mesh =
    await buildTerrainMesh(
      tile,
      earth,
      {
        id: "TEST_DATUM",
        kind: "ellipsoidal",
        bodyId: 399,
        source: "test",
      },
      new VerticalDatumTransformRegistry(),
    );

  assert.deepEqual(
    [...mesh.validVertexMask],
    [1, 1, 1, 0],
  );
  assert.equal(
    mesh.indices.length,
    3,
  );
  assert.ok(
    Number.isNaN(
      mesh.positionsBodyFixedMeters[
        9
      ],
    ),
  );
});

test("terrain grid interpolation follows antimeridian-crossing bounds", async () => {
  const tile = terrainTile({
    extent: {
      kind:
        "geodetic-bounds",
      bodyId: 399,
      southLatitudeDegrees: 0,
      northLatitudeDegrees: 1,
      westLongitudeDegrees: 170,
      eastLongitudeDegrees: -170,
      referenceFrame: "ITRF93",
      verticalDatum:
        "TEST_DATUM",
    },
    width: 3,
    height: 2,
    elevationsMeters:
      new Float64Array(
        [0, 0, 0, 0, 0, 0],
      ),
  });

  const mesh =
    await buildTerrainMesh(
      tile,
      earth,
      {
        id: "TEST_DATUM",
        kind: "ellipsoidal",
        bodyId: 399,
        source: "test",
      },
      new VerticalDatumTransformRegistry(),
    );

  const middleTopIndex = 1;
  const offset =
    middleTopIndex * 3;
  const recovered =
    bodyFixedToGeodetic(
      earth,
      {
        x:
          mesh.positionsBodyFixedMeters[
            offset
          ],
        y:
          mesh.positionsBodyFixedMeters[
            offset + 1
          ],
        z:
          mesh.positionsBodyFixedMeters[
            offset + 2
          ],
      },
    );

  assert.ok(
    Math.abs(
      Math.abs(
        recovered.longitudeDegrees,
      ) - 180,
    ) < 1e-9,
  );
});


test("terrain localization preserves sub-millimetre reconstruction on a local patch", async () => {
  const tile = terrainTile({
    extent: {
      kind: "geodetic-bounds",
      bodyId: 399,
      southLatitudeDegrees: 27.98,
      northLatitudeDegrees: 28.00,
      westLongitudeDegrees: 86.91,
      eastLongitudeDegrees: 86.94,
      referenceFrame: "ITRF93",
      verticalDatum: "TEST_DATUM",
    },
    width: 3,
    height: 3,
    elevationsMeters:
      new Float64Array([
        10.00, 10.25, 10.50,
        11.00, 11.25, 11.50,
        12.00, 12.25, 12.50,
      ]),
  });

  const mesh =
    await buildTerrainMesh(
      tile,
      earth,
      {
        id: "TEST_DATUM",
        kind: "ellipsoidal",
        bodyId: 399,
        source: "test",
      },
      new VerticalDatumTransformRegistry(),
    );

  const local =
    localizeTerrainMesh(mesh);

  assert.ok(
    local.positionsRelativeMeters instanceof
      Float32Array,
  );
  assert.ok(
    local.maximumPositionQuantizationErrorMeters <
      0.001,
    `quantization error was ${local.maximumPositionQuantizationErrorMeters} m`,
  );

  for (
    let index = 0;
    index <
      mesh.validVertexMask.length;
    index += 1
  ) {
    if (!mesh.validVertexMask[index]) {
      continue;
    }

    const offset = index * 3;
    const dx =
      local.originBodyFixedMeters.x +
      local.positionsRelativeMeters[offset] -
      mesh.positionsBodyFixedMeters[offset];
    const dy =
      local.originBodyFixedMeters.y +
      local.positionsRelativeMeters[offset + 1] -
      mesh.positionsBodyFixedMeters[offset + 1];
    const dz =
      local.originBodyFixedMeters.z +
      local.positionsRelativeMeters[offset + 2] -
      mesh.positionsBodyFixedMeters[offset + 2];

    assert.ok(
      Math.hypot(dx, dy, dz) <
        0.001,
    );
  }
});

test("terrain frame placement subtracts the camera only after float64 body-fixed placement", () => {
  const localMesh = {
    tileId: "placement-test",
    bodyId: 399,
    referenceFrame: "ITRF93",
    verticalDatum:
      "EARTH_PCK00011_ELLIPSOIDAL",
    geometricErrorMeters: 1,
    originBodyFixedMeters: {
      x: 6_378_000,
      y: 1_000,
      z: 2_000,
    },
    positionsRelativeMeters:
      new Float32Array(0),
    normalsBodyFixed:
      new Float32Array(0),
    indices:
      new Uint32Array(0),
    maximumPositionQuantizationErrorMeters:
      0,
  };

  const bodyPosition = {
    x: 149_000_000_000,
    y: -20_000_000_000,
    z: 3_000_000_000,
  };

  const originAbsolute = {
    x:
      bodyPosition.x +
      localMesh.originBodyFixedMeters.x,
    y:
      bodyPosition.y +
      localMesh.originBodyFixedMeters.y,
    z:
      bodyPosition.z +
      localMesh.originBodyFixedMeters.z,
  };

  const camera = {
    x: originAbsolute.x + 100,
    y: originAbsolute.y - 250,
    z: originAbsolute.z + 50,
  };

  const identity = [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ];

  const placement =
    terrainFramePlacement(
      localMesh,
      {
        bodyId: 399,
        positionMeters:
          bodyPosition,
        orientation: {
          bodyFixedToJ2000:
            identity,
          j2000ToBodyFixed:
            identity,
          frameClassId: 3000,
          baseFrameId: 1,
          provenance: {
            provider:
              "NAIF-BINARY-PCK",
            dataset: "test",
            kernelMd5: "test",
            kernelSource: "test",
            frameName: "ITRF93",
            baseFrameName: "J2000",
            quality: "test",
          },
        },
      },
      camera,
    );

  assert.deepEqual(
    placement.originCameraRelativeJ2000Meters,
    {
      x: -100,
      y: 250,
      z: -50,
    },
  );
});