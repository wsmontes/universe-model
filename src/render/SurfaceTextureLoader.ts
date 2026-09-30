import type {
  SurfaceRasterAsset,
} from "../evidence/SurfaceRasterAsset.js";
import {
  RequestScheduler,
  type ScheduledRequestHandle,
} from "../streaming/RequestScheduler.js";

export interface LoadedSurfaceTexture {
  readonly asset: SurfaceRasterAsset;
  readonly texture: GPUTexture;
  readonly width: number;
  readonly height: number;
}

export class SurfaceTextureLoader {
  constructor(
    private readonly device: GPUDevice,
    private readonly scheduler:
      RequestScheduler,
  ) {}

  load(
    asset: SurfaceRasterAsset,
    priority = 10,
  ): ScheduledRequestHandle<LoadedSurfaceTexture> {
    return this.scheduler.schedule({
        key:
          this.requestKey(asset.id),
        priority,
        run: async (signal) => {
          const response = await fetch(
            asset.url,
            {
              mode: "cors",
              cache: "force-cache",
              signal,
            },
          );

          if (!response.ok) {
            throw new Error(
              `${asset.displayName} returned HTTP ${response.status}.`,
            );
          }

          const blob =
            await response.blob();
          this.scheduler.telemetry
            .recordTransfer(blob.size);

          if (signal.aborted) {
            throw new DOMException(
              "Surface request aborted.",
              "AbortError",
            );
          }

          const bitmap =
            await createImageBitmap(
              blob,
              {
                premultiplyAlpha:
                  "none",
                colorSpaceConversion:
                  "default",
              },
            );

          try {
            if (signal.aborted) {
              throw new DOMException(
                "Surface request aborted.",
                "AbortError",
              );
            }

            const texture =
              this.device.createTexture({
                label: asset.id,
                size: [
                  bitmap.width,
                  bitmap.height,
                ],
                format:
                  "rgba8unorm-srgb",
                usage:
                  GPUTextureUsage.TEXTURE_BINDING |
                  GPUTextureUsage.COPY_DST,
              });

            this.device.queue
              .copyExternalImageToTexture(
                { source: bitmap },
                { texture },
                [
                  bitmap.width,
                  bitmap.height,
                ],
              );

            if (signal.aborted) {
              texture.destroy();
              throw new DOMException(
                "Surface request aborted.",
                "AbortError",
              );
            }

            return Object.freeze({
              asset,
              texture,
              width: bitmap.width,
              height: bitmap.height,
            });
          } finally {
            bitmap.close();
          }
        },
      });
  }

  private requestKey(
    assetId: string,
  ): string {
    return `surface-raster:${assetId}`;
  }
}
