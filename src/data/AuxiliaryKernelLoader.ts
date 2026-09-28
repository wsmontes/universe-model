import { md5Hex } from "./md5.js";
import type { OrientationKernelManifest } from "./OrientationKernelManifest.js";

const CACHE_NAME = "universe-model-orientation-kernels-v1";

export interface LoadedOrientationKernel {
  readonly manifest: OrientationKernelManifest;
  readonly buffer: ArrayBuffer;
  readonly md5: string;
  readonly source: string;
  readonly bytes: number;
  readonly fromCache: boolean;
}

export class AuxiliaryKernelLoader {
  constructor(private readonly progress: (message: string) => void = () => undefined) {}

  async load(manifest: OrientationKernelManifest): Promise<LoadedOrientationKernel> {
    const cache = "caches" in globalThis ? await caches.open(CACHE_NAME) : null;
    const key = new Request(manifest.url, { mode: "cors" });
    const cached = cache ? await cache.match(key) : undefined;

    if (cached) {
      this.progress(`Loading cached ${manifest.displayName}…`);
      const buffer = await cached.arrayBuffer();
      const md5 = md5Hex(buffer);
      return Object.freeze({
        manifest,
        buffer,
        md5,
        source: `${manifest.authority} (browser cache)`,
        bytes: buffer.byteLength,
        fromCache: true,
      });
    }

    this.progress(`Downloading ${manifest.displayName} from ${manifest.authority}…`);
    const response = await fetch(manifest.url, { mode: "cors", cache: "default" });
    if (!response.ok) {
      throw new Error(`${manifest.displayName} returned HTTP ${response.status}.`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 1024) {
      throw new Error(`${manifest.displayName} is too small to be a DAF/PCK kernel.`);
    }
    const md5 = md5Hex(buffer);

    if (cache) {
      await cache.put(key, new Response(buffer.slice(0), {
        headers: {
          "content-type": "application/octet-stream",
          "x-universe-model-md5": md5,
        },
      }));
    }

    return Object.freeze({
      manifest,
      buffer,
      md5,
      source: manifest.authority,
      bytes: buffer.byteLength,
      fromCache: false,
    });
  }
}
