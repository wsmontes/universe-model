import type { SurfaceTextureAsset } from "./SurfaceTextureManifest.js";

export interface LoadedSurfaceTexture {
  readonly asset: SurfaceTextureAsset;
  readonly texture: GPUTexture;
  readonly width: number;
  readonly height: number;
}

export class SurfaceTextureLoader {
  private readonly device: GPUDevice;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  async load(asset: SurfaceTextureAsset): Promise<LoadedSurfaceTexture> {
    const response = await fetch(asset.url, {
      mode: "cors",
      cache: "force-cache",
    });
    if (!response.ok) {
      throw new Error(
        `${asset.displayName} returned HTTP ${response.status}.`,
      );
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: "none",
      colorSpaceConversion: "default",
    });

    try {
      const texture = this.device.createTexture({
        label: asset.id,
        size: [bitmap.width, bitmap.height],
        format: "rgba8unorm-srgb",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture },
        [bitmap.width, bitmap.height],
      );

      return Object.freeze({
        asset,
        texture,
        width: bitmap.width,
        height: bitmap.height,
      });
    } finally {
      bitmap.close();
    }
  }
}
