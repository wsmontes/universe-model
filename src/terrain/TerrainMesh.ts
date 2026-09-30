import type {
  Vec3d,
} from "../core/Vec3d.js";
import {
  cross,
  magnitude,
  normalize,
  subtract,
} from "../core/Vec3d.js";
import {
  geodeticToBodyFixed,
} from "../geodesy/Geodetic.js";
import type {
  OblateEllipsoid,
} from "../geodesy/ReferenceEllipsoid.js";
import type {
  VerticalDatum,
  VerticalDatumTransformRegistry,
  HeightAtLocation,
} from "../geodesy/VerticalDatum.js";
import {
  terrainSampleIsValid,
  validateTerrainTile,
  type TerrainTile,
} from "./TerrainTile.js";

export interface TerrainMesh {
  readonly tileId: string;
  readonly bodyId: number;
  readonly referenceFrame: string;
  readonly verticalDatum: string;
  readonly geometricErrorMeters: number;
  readonly positionsBodyFixedMeters:
    Float64Array;
  readonly normalsBodyFixed:
    Float64Array;
  readonly indices: Uint32Array;
  readonly validVertexMask:
    Uint8Array;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly minimumEllipsoidalHeightMeters:
    number;
  readonly maximumEllipsoidalHeightMeters:
    number;
}

function longitudeAt(
  westDegrees: number,
  eastDegrees: number,
  t: number,
): number {
  const span =
    westDegrees <= eastDegrees
      ? eastDegrees - westDegrees
      : eastDegrees +
        360 -
        westDegrees;

  let longitude =
    westDegrees +
    span * t;

  if (longitude > 180) {
    longitude -= 360;
  }
  if (longitude < -180) {
    longitude += 360;
  }
  return longitude;
}

function ellipsoidNormal(
  ellipsoid: OblateEllipsoid,
  position: Vec3d,
): Vec3d {
  const a2 =
    ellipsoid.semiMajorMeters *
    ellipsoid.semiMajorMeters;
  const b2 =
    ellipsoid.semiMinorMeters *
    ellipsoid.semiMinorMeters;

  return normalize({
    x: position.x / a2,
    y: position.y / a2,
    z: position.z / b2,
  });
}

function readPosition(
  positions: Float64Array,
  vertexIndex: number,
): Vec3d {
  const offset =
    vertexIndex * 3;
  const x =
    positions[offset];
  const y =
    positions[offset + 1];
  const z =
    positions[offset + 2];

  if (
    x === undefined ||
    y === undefined ||
    z === undefined
  ) {
    throw new Error(
      `Terrain mesh position index ${vertexIndex} is out of bounds.`,
    );
  }

  return { x, y, z };
}

function addNormal(
  normals: Float64Array,
  vertexIndex: number,
  normal: Vec3d,
): void {
  const offset =
    vertexIndex * 3;
  normals[offset] =
    (normals[offset] ?? 0) +
    normal.x;
  normals[offset + 1] =
    (normals[offset + 1] ?? 0) +
    normal.y;
  normals[offset + 2] =
    (normals[offset + 2] ?? 0) +
    normal.z;
}

function appendTriangle(
  indices: number[],
  normals: Float64Array,
  positions: Float64Array,
  a: number,
  b: number,
  c: number,
): void {
  const pa =
    readPosition(
      positions,
      a,
    );
  const pb =
    readPosition(
      positions,
      b,
    );
  const pc =
    readPosition(
      positions,
      c,
    );

  const faceNormal =
    cross(
      subtract(pb, pa),
      subtract(pc, pa),
    );

  if (
    magnitude(faceNormal) <= 0
  ) {
    return;
  }

  indices.push(a, b, c);
  addNormal(
    normals,
    a,
    faceNormal,
  );
  addNormal(
    normals,
    b,
    faceNormal,
  );
  addNormal(
    normals,
    c,
    faceNormal,
  );
}

function validateMeshInputs(
  tile: TerrainTile,
  ellipsoid: OblateEllipsoid,
  ellipsoidalDatum:
    VerticalDatum,
): void {
  validateTerrainTile(tile);

  if (
    tile.bodyId !==
    ellipsoid.bodyId
  ) {
    throw new Error(
      `Terrain tile body ${tile.bodyId} does not match ellipsoid body ${ellipsoid.bodyId}.`,
    );
  }

  if (
    tile.referenceFrame !==
    ellipsoid.referenceFrame
  ) {
    throw new Error(
      `Terrain tile frame ${tile.referenceFrame} does not match ellipsoid frame ${ellipsoid.referenceFrame}.`,
    );
  }

  if (
    ellipsoidalDatum.kind !==
    "ellipsoidal"
  ) {
    throw new Error(
      `Terrain mesh target datum ${ellipsoidalDatum.id} is not ellipsoidal.`,
    );
  }

  if (
    ellipsoidalDatum.bodyId !==
    tile.bodyId
  ) {
    throw new Error(
      `Terrain mesh target datum body ${ellipsoidalDatum.bodyId} does not match tile body ${tile.bodyId}.`,
    );
  }
}

export async function buildTerrainMesh(
  tile: TerrainTile,
  ellipsoid: OblateEllipsoid,
  ellipsoidalDatum:
    VerticalDatum,
  datumTransforms:
    VerticalDatumTransformRegistry,
): Promise<TerrainMesh> {
  validateMeshInputs(
    tile,
    ellipsoid,
    ellipsoidalDatum,
  );

  const vertexCount =
    tile.width *
    tile.height;
  const positions =
    new Float64Array(
      vertexCount * 3,
    );
  positions.fill(Number.NaN);

  const normals =
    new Float64Array(
      vertexCount * 3,
    );
  const validVertexMask =
    new Uint8Array(
      vertexCount,
    );

  const validSamples: {
    readonly vertexIndex:
      number;
    readonly sample:
      HeightAtLocation;
  }[] = [];

  for (
    let row = 0;
    row < tile.height;
    row += 1
  ) {
    const rowT =
      row /
      (tile.height - 1);
    const latitudeDegrees =
      tile.extent
        .northLatitudeDegrees +
      (
        tile.extent
          .southLatitudeDegrees -
        tile.extent
          .northLatitudeDegrees
      ) *
        rowT;

    for (
      let column = 0;
      column < tile.width;
      column += 1
    ) {
      const columnT =
        column /
        (tile.width - 1);
      const longitudeDegrees =
        longitudeAt(
          tile.extent
            .westLongitudeDegrees,
          tile.extent
            .eastLongitudeDegrees,
          columnT,
        );

      const vertexIndex =
        row *
          tile.width +
        column;
      const heightMeters =
        tile.elevationsMeters[
          vertexIndex
        ];

      if (
        heightMeters ===
          undefined ||
        !terrainSampleIsValid(
          tile,
          heightMeters,
        )
      ) {
        continue;
      }

      validSamples.push({
        vertexIndex,
        sample: {
          heightMeters,
          location: {
            kind: "geodetic",
            bodyId:
              tile.bodyId,
            latitudeDegrees,
            longitudeDegrees,
            referenceFrame:
              tile.referenceFrame,
            verticalDatum:
              tile.verticalDatum,
          },
        },
      });
    }
  }

  if (
    validSamples.length === 0
  ) {
    throw new Error(
      `Terrain tile ${tile.id} contains no valid elevation samples.`,
    );
  }

  const ellipsoidalHeights =
    await datumTransforms.transformHeights(
      tile.bodyId,
      validSamples.map(
        (entry) =>
          entry.sample,
      ),
      tile.verticalDatum,
      ellipsoidalDatum.id,
    );

  let minimumHeight =
    Number.POSITIVE_INFINITY;
  let maximumHeight =
    Number.NEGATIVE_INFINITY;

  validSamples.forEach(
    (entry, index) => {
      const height =
        ellipsoidalHeights[
          index
        ];
      if (
        height === undefined
      ) {
        throw new Error(
          `Terrain datum conversion returned no height for sample ${index}.`,
        );
      }

      const position =
        geodeticToBodyFixed(
          ellipsoid,
          entry.sample.location
            .latitudeDegrees,
          entry.sample.location
            .longitudeDegrees,
          height,
        );

      const offset =
        entry.vertexIndex * 3;
      positions[offset] =
        position.x;
      positions[offset + 1] =
        position.y;
      positions[offset + 2] =
        position.z;
      validVertexMask[
        entry.vertexIndex
      ] = 1;

      minimumHeight =
        Math.min(
          minimumHeight,
          height,
        );
      maximumHeight =
        Math.max(
          maximumHeight,
          height,
        );
    },
  );

  const indices: number[] = [];

  for (
    let row = 0;
    row <
      tile.height - 1;
    row += 1
  ) {
    for (
      let column = 0;
      column <
        tile.width - 1;
      column += 1
    ) {
      const northWest =
        row *
          tile.width +
        column;
      const northEast =
        northWest + 1;
      const southWest =
        northWest +
        tile.width;
      const southEast =
        southWest + 1;

      if (
        validVertexMask[
          northWest
        ] &&
        validVertexMask[
          southWest
        ] &&
        validVertexMask[
          northEast
        ]
      ) {
        appendTriangle(
          indices,
          normals,
          positions,
          northWest,
          southWest,
          northEast,
        );
      }

      if (
        validVertexMask[
          northEast
        ] &&
        validVertexMask[
          southWest
        ] &&
        validVertexMask[
          southEast
        ]
      ) {
        appendTriangle(
          indices,
          normals,
          positions,
          northEast,
          southWest,
          southEast,
        );
      }
    }
  }

  for (
    let vertexIndex = 0;
    vertexIndex <
      vertexCount;
    vertexIndex += 1
  ) {
    if (
      !validVertexMask[
        vertexIndex
      ]
    ) {
      continue;
    }

    const offset =
      vertexIndex * 3;
    const accumulated = {
      x:
        normals[offset] ?? 0,
      y:
        normals[offset + 1] ??
        0,
      z:
        normals[offset + 2] ??
        0,
    };

    const normal =
      magnitude(accumulated) >
      0
        ? normalize(accumulated)
        : ellipsoidNormal(
            ellipsoid,
            readPosition(
              positions,
              vertexIndex,
            ),
          );

    normals[offset] =
      normal.x;
    normals[offset + 1] =
      normal.y;
    normals[offset + 2] =
      normal.z;
  }

  return Object.freeze({
    tileId: tile.id,
    bodyId: tile.bodyId,
    referenceFrame:
      tile.referenceFrame,
    verticalDatum:
      ellipsoidalDatum.id,
    geometricErrorMeters:
      tile.geometricErrorMeters,
    positionsBodyFixedMeters:
      positions,
    normalsBodyFixed:
      normals,
    indices:
      new Uint32Array(
        indices,
      ),
    validVertexMask,
    sourceWidth: tile.width,
    sourceHeight:
      tile.height,
    minimumEllipsoidalHeightMeters:
      minimumHeight,
    maximumEllipsoidalHeightMeters:
      maximumHeight,
  });
}
