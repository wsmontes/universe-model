import type {
  TerrainLocalMesh,
} from "./TerrainLocalMesh.js";

export class TerrainGpuResource {
  readonly tileId: string;
  readonly localMesh:
    TerrainLocalMesh;
  readonly positionBuffer:
    GPUBuffer;
  readonly normalBuffer:
    GPUBuffer;
  readonly indexBuffer:
    GPUBuffer;
  readonly indexCount: number;

  constructor(
    device: GPUDevice,
    localMesh:
      TerrainLocalMesh,
  ) {
    this.tileId =
      localMesh.tileId;
    this.localMesh =
      localMesh;
    this.indexCount =
      localMesh.indices.length;

    this.positionBuffer =
      device.createBuffer({
        label:
          `terrain-${this.tileId}-positions`,
        size: Math.max(
          4,
          localMesh
            .positionsRelativeMeters
            .byteLength,
        ),
        usage:
          GPUBufferUsage.VERTEX |
          GPUBufferUsage.COPY_DST,
      });

    this.normalBuffer =
      device.createBuffer({
        label:
          `terrain-${this.tileId}-normals`,
        size: Math.max(
          4,
          localMesh
            .normalsBodyFixed
            .byteLength,
        ),
        usage:
          GPUBufferUsage.VERTEX |
          GPUBufferUsage.COPY_DST,
      });

    this.indexBuffer =
      device.createBuffer({
        label:
          `terrain-${this.tileId}-indices`,
        size: Math.max(
          4,
          localMesh.indices
            .byteLength,
        ),
        usage:
          GPUBufferUsage.INDEX |
          GPUBufferUsage.COPY_DST,
      });

    if (
      localMesh
        .positionsRelativeMeters
        .byteLength > 0
    ) {
      device.queue.writeBuffer(
        this.positionBuffer,
        0,
        localMesh
          .positionsRelativeMeters,
      );
    }

    if (
      localMesh
        .normalsBodyFixed
        .byteLength > 0
    ) {
      device.queue.writeBuffer(
        this.normalBuffer,
        0,
        localMesh
          .normalsBodyFixed,
      );
    }

    if (
      localMesh.indices
        .byteLength > 0
    ) {
      device.queue.writeBuffer(
        this.indexBuffer,
        0,
        localMesh.indices,
      );
    }
  }

  destroy(): void {
    this.positionBuffer.destroy();
    this.normalBuffer.destroy();
    this.indexBuffer.destroy();
  }
}
