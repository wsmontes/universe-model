import {
  add,
  subtract,
  type Vec3d,
} from "../core/Vec3d.js";
import {
  transformMatrix3Vector,
} from "../astronomy/frames/Matrix3.js";
import type {
  CelestialState,
} from "../astronomy/types.js";
import type {
  TerrainLocalMesh,
} from "./TerrainLocalMesh.js";

export interface TerrainFramePlacement {
  readonly originCameraRelativeJ2000Meters:
    Vec3d;
  readonly bodyFixedToJ2000:
    readonly number[];
}

export function terrainFramePlacement(
  mesh: TerrainLocalMesh,
  bodyState: CelestialState,
  cameraPositionMeters:
    Vec3d,
): TerrainFramePlacement {
  if (
    mesh.bodyId !==
    bodyState.bodyId
  ) {
    throw new Error(
      `Terrain mesh body ${mesh.bodyId} does not match astronomical state body ${bodyState.bodyId}.`,
    );
  }

  const orientation =
    bodyState.orientation;
  if (!orientation) {
    throw new Error(
      `Terrain mesh ${mesh.tileId} requires body-fixed orientation for body ${mesh.bodyId}.`,
    );
  }

  if (
    orientation.provenance
      .frameName !==
    mesh.referenceFrame
  ) {
    throw new Error(
      `Terrain mesh frame ${mesh.referenceFrame} does not match active body-fixed frame ${orientation.provenance.frameName}.`,
    );
  }

  const originJ2000 =
    add(
      bodyState.positionMeters,
      transformMatrix3Vector(
        orientation
          .bodyFixedToJ2000,
        mesh.originBodyFixedMeters,
      ),
    );

  return Object.freeze({
    originCameraRelativeJ2000Meters:
      subtract(
        originJ2000,
        cameraPositionMeters,
      ),
    bodyFixedToJ2000:
      orientation
        .bodyFixedToJ2000,
  });
}
