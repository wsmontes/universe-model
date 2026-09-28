import { md5Hex } from "./md5.js";
import type { KernelSource, PlanetaryKernelManifest } from "./KernelManifest.js";

const CACHE_NAME = "universe-model-kernels-v1";

export interface LoadedKernel {
  readonly buffer: ArrayBuffer;
  readonly manifest: PlanetaryKernelManifest;
  readonly source: string;
  readonly md5: string;
  readonly fromCache: boolean;
}

export type KernelProgress = (message: string) => void;

async function verify(
  buffer: ArrayBuffer,
  manifest: PlanetaryKernelManifest,
  progress: KernelProgress,
): Promise<string> {
  if (buffer.byteLength !== manifest.expectedBytes) {
    throw new Error(
      `${manifest.displayName} byte length mismatch: expected ${manifest.expectedBytes}, got ${buffer.byteLength}.`,
    );
  }
  progress(`Verifying ${manifest.displayName} against the NAIF-published MD5…`);
  const md5 = md5Hex(buffer);
  if (md5 !== manifest.expectedMd5) {
    throw new Error(`${manifest.displayName} MD5 mismatch: expected ${manifest.expectedMd5}, got ${md5}.`);
  }
  return md5;
}

async function fetchSource(source: KernelSource, manifest: PlanetaryKernelManifest): Promise<Response> {
  const response = await fetch(source.url, { mode: "cors", cache: "default" });
  if (!response.ok) {
    throw new Error(`${source.label} returned HTTP ${response.status}.`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 0 && contentLength !== manifest.expectedBytes) {
    throw new Error(`${source.label} advertised ${contentLength} bytes; expected ${manifest.expectedBytes}.`);
  }
  return response;
}

export class KernelLoader {
  constructor(private readonly progress: KernelProgress = () => undefined) {}

  async load(manifest: PlanetaryKernelManifest): Promise<LoadedKernel> {
    const errors: string[] = [];
    const cache = "caches" in globalThis ? await caches.open(CACHE_NAME) : null;

    for (const source of manifest.sources) {
      try {
        const cacheKey = new Request(source.url, { mode: "cors" });
        const cached = cache ? await cache.match(cacheKey) : undefined;
        if (cached) {
          this.progress(`Loading cached ${manifest.displayName}…`);
          const cachedBuffer = await cached.arrayBuffer();
          const md5 = await verify(cachedBuffer, manifest, this.progress);
          return Object.freeze({
            buffer: cachedBuffer,
            manifest,
            source: `${source.label} (browser cache)`,
            md5,
            fromCache: true,
          });
        }

        this.progress(`Downloading ${manifest.displayName} (${Math.round(manifest.expectedBytes / 1_048_576)} MiB) from ${source.label}…`);
        const response = await fetchSource(source, manifest);
        const buffer = await response.arrayBuffer();
        const md5 = await verify(buffer, manifest, this.progress);
        if (cache) {
          await cache.put(cacheKey, new Response(buffer.slice(0), {
            headers: {
              "content-type": "application/octet-stream",
              "x-universe-model-md5": md5,
            },
          }));
        }
        return Object.freeze({ buffer, manifest, source: source.label, md5, fromCache: false });
      } catch (error) {
        errors.push(`${source.label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Unable to load ${manifest.displayName}. ${errors.join(" | ")}`);
  }

  async fromFile(file: File, manifest: PlanetaryKernelManifest): Promise<LoadedKernel> {
    this.progress(`Reading local ${file.name}…`);
    const buffer = await file.arrayBuffer();
    const md5 = await verify(buffer, manifest, this.progress);
    return Object.freeze({
      buffer,
      manifest,
      source: `local file: ${file.name}`,
      md5,
      fromCache: false,
    });
  }
}
