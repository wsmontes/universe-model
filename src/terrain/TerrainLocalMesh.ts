import type {
  Vec3d,
} from "../core/Vec3d.js";
import type {
  TerrainMesh,
} from "./TerrainMesh.js";

export interface TerrainLocalMesh {
  readonly tileId: string;
  readonly bodyId: number;
  readonly referenceFrame: string;
  readonly verticalDatum: string;
  readonly geometricErrorMeters: number;
  readonly originBodyFixedMeters:
    Vec3d;
  readonly positionsRelativeMeters:
    Float32Array;
  readonly normalsBodyFixed:
    Float32Array;
  readonly indices: Uint32Array;
  readonly maximumPositionQuantizationErrorMeters:
    number;
}

function component(
  array: Float64Array,
  index: number,
  componentOffset: number,
): number {
  const value =
    array[
      index * 3 +
      componentOffset
    ];
  if (value === undefined) {
    throw new Error(
      `Terrain mesh component is missing at vertex ${index}.`,
    );
  }
  return value;
}

export function localizeTerrainMesh(
  mesh: TerrainMesh,
): TerrainLocalMesh {
  const vertexCount =
    mesh.validVertexMask.length;

  let minX =
    Number.POSITIVE_INFINITY;
  let minY =
    Number.POSITIVE_INFINITY;
  let minZ =
    Number.POSITIVE_INFINITY;
  let maxX =
    Number.NEGATIVE_INFINITY;
  let maxY =
    Number.NEGATIVE_INFINITY;
  let maxZ =
    Number.NEGATIVE_INFINITY;

  let validCount = 0;

  for (
    let index = 0;
    index < vertexCount;
    index += 1
  ) {
    if (
      !mesh.validVertexMask[
        index
      ]
    ) {
      continue;
    }

    const x = component(
      mesh.positionsBodyFixedMeters,
      index,
      0,
    );
    const y = component(
      mesh.positionsBodyFixedMeters,
      index,
      1,
    );
    const z = component(
      mesh.positionsBodyFixedMeters,
      index,
      2,
    );

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    validCount += 1;
  }

  if (validCount === 0) {
    throw new Error(
      `Terrain mesh ${mesh.tileId} contains no valid vertices.`,
    );
  }

  const origin:
    Vec3d = Object.freeze({
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    });

  const positions =
    new Float32Array(
      vertexCount * 3,
    );
  const normals =
    new Float32Array(
      vertexCount * 3,
    );

  let maximumError = 0;

  for (
    let index = 0;
    index < vertexCount;
    index += 1
  ) {
    if (
      !mesh.validVertexMask[
        index
      ]
    ) {
      continue;
    }

    const offset =
      index * 3;

    const absoluteX =
      component(
        mesh.positionsBodyFixedMeters,
        index,
        0,
      );
    const absoluteY =
      component(
        mesh.positionsBodyFixedMeters,
        index,
        1,
      );
    const absoluteZ =
      component(
        mesh.positionsBodyFixedMeters,
        index,
        2,
      );

    const localX =
      absoluteX - origin.x;
    const localY =
      absoluteY - origin.y;
    const localZ =
      absoluteZ - origin.z;

    positions[offset] =
      localX;
    positions[offset + 1] =
      localY;
    positions[offset + 2] =
      localZ;

    const storedX =
      positions[offset];
    const storedY =
      positions[offset + 1];
    const storedZ =
      positions[offset + 2];

    if (
      storedX === undefined ||
      storedY === undefined ||
      storedZ === undefined
    ) {
      throw new Error(
        `Localized terrain position is missing at vertex ${index}.`,
      );
    }

    const reconstructedX =
      origin.x + storedX;
    const reconstructedY =
      origin.y + storedY;
    const reconstructedZ =
      origin.z + storedZ;

    maximumError =
      Math.max(
        maximumError,
        Math.hypot(
          reconstructedX -
            absoluteX,
          reconstructedY -
            absoluteY,
          reconstructedZ -
            absoluteZ,
        ),
      );

    const nx =
      mesh.normalsBodyFixed[
        offset
      ];
    const ny =
      mesh.normalsBodyFixed[
        offset + 1
      ];
    const nz =
      mesh.normalsBodyFixed[
        offset + 2
      ];

    if (
      nx === undefined ||
      ny === undefined ||
      nz === undefined
    ) {
      throw new Error(
        `Terrain normal is missing at vertex ${index}.`,
      );
    }

    normals[offset] = nx;
    normals[offset + 1] = ny;
    normals[offset + 2] = nz;
  }

  return Object.freeze({
    tileId: mesh.tileId,
    bodyId: mesh.bodyId,
    referenceFrame:
      mesh.referenceFrame,
    verticalDatum:
      mesh.verticalDatum,
    geometricErrorMeters:
      mesh.geometricErrorMeters,
    originBodyFixedMeters:
      origin,
    positionsRelativeMeters:
      positions,
    normalsBodyFixed:
      normals,
    indices: mesh.indices,
    maximumPositionQuantizationErrorMeters:
      maximumError,
  });
}
