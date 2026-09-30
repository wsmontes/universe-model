import type {
  EvidenceCacheIdentity,
} from "./EvidenceCacheIdentity.js";
import {
  StreamingTelemetry,
} from "./StreamingTelemetry.js";

const BYTES_HEADER =
  "x-universe-cache-bytes";
const STORED_AT_HEADER =
  "x-universe-cache-stored-at";
const CONTENT_TYPE_HEADER =
  "content-type";

export interface PersistentBinaryCacheOptions {
  readonly cacheName: string;
  readonly maxBytes: number;
  readonly telemetry?:
    StreamingTelemetry;
}

export class PersistentCacheBudgetError
  extends Error
{
  readonly requestedBytes: number;
  readonly maxBytes: number;

  constructor(
    requestedBytes: number,
    maxBytes: number,
  ) {
    super(
      `Persistent cache entry requires ${requestedBytes} bytes but the cache budget is ${maxBytes} bytes.`,
    );
    this.name =
      "PersistentCacheBudgetError";
    this.requestedBytes =
      requestedBytes;
    this.maxBytes = maxBytes;
  }
}

function validateBudget(
  bytes: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0
  ) {
    throw new RangeError(
      `${label} must be a safe integer >= 0.`,
    );
  }
  return bytes;
}

function requestForKey(
  key: string,
): Request {
  const origin =
    typeof location !== "undefined"
      ? location.origin
      : "https://universe-model.invalid";
  return new Request(
    `${origin}/__universe_model_cache__/${encodeURIComponent(key)}`,
  );
}

interface StoredEntry {
  readonly request: Request;
  readonly bytes: number;
  readonly storedAt: number;
}

export class PersistentBinaryCache {
  readonly telemetry:
    StreamingTelemetry;

  private readonly cacheName:
    string;
  private readonly maxBytes:
    number;
  private mutation:
    Promise<void> =
      Promise.resolve();

  constructor(
    options:
      PersistentBinaryCacheOptions,
  ) {
    if (!options.cacheName.trim()) {
      throw new Error(
        "Persistent cache name must not be empty.",
      );
    }
    this.cacheName =
      options.cacheName;
    this.maxBytes =
      validateBudget(
        options.maxBytes,
        "persistent cache maxBytes",
      );
    this.telemetry =
      options.telemetry ??
      new StreamingTelemetry();
  }

  async get(
    identity:
      EvidenceCacheIdentity,
  ): Promise<ArrayBuffer | null> {
    if (
      !identity.persistentSafe ||
      !("caches" in globalThis)
    ) {
      return null;
    }

    const cache =
      await caches.open(
        this.cacheName,
      );
    const response =
      await cache.match(
        requestForKey(
          identity.key,
        ),
      );
    if (!response) {
      return null;
    }

    const buffer =
      await response.arrayBuffer();
    this.telemetry.recordCacheHit(
      buffer.byteLength,
    );
    return buffer;
  }

  async put(
    identity:
      EvidenceCacheIdentity,
    buffer: ArrayBuffer,
    contentType =
      "application/octet-stream",
  ): Promise<boolean> {
    if (
      !identity.persistentSafe ||
      !("caches" in globalThis)
    ) {
      return false;
    }

    const bytes =
      validateBudget(
        buffer.byteLength,
        "persistent cache entry bytes",
      );

    if (bytes > this.maxBytes) {
      throw new PersistentCacheBudgetError(
        bytes,
        this.maxBytes,
      );
    }

    return this.withMutation(
      async () => {
        const cache =
          await caches.open(
            this.cacheName,
          );
        const request =
          requestForKey(
            identity.key,
          );

        await cache.delete(request);
        await this.evictToFit(
          cache,
          bytes,
        );

        const headers =
          new Headers({
            [BYTES_HEADER]:
              String(bytes),
            [STORED_AT_HEADER]:
              String(Date.now()),
            [CONTENT_TYPE_HEADER]:
              contentType,
          });

        await cache.put(
          request,
          new Response(
            buffer.slice(0),
            {
              status: 200,
              headers,
            },
          ),
        );
        return true;
      },
    );
  }

  async clear(): Promise<void> {
    if (
      !("caches" in globalThis)
    ) {
      return;
    }

    await this.withMutation(
      async () => {
        await caches.delete(
          this.cacheName,
        );
      },
    );
  }

  private async evictToFit(
    cache: Cache,
    incomingBytes: number,
  ): Promise<void> {
    const entries =
      await this.entries(cache);
    let usedBytes =
      entries.reduce(
        (sum, entry) =>
          sum + entry.bytes,
        0,
      );

    const oldestFirst =
      [...entries].sort(
        (a, b) =>
          a.storedAt -
          b.storedAt,
      );

    for (
      const entry of
      oldestFirst
    ) {
      if (
        usedBytes +
          incomingBytes <=
        this.maxBytes
      ) {
        break;
      }

      const deleted =
        await cache.delete(
          entry.request,
        );
      if (deleted) {
        usedBytes -=
          entry.bytes;
      }
    }

    if (
      usedBytes +
        incomingBytes >
      this.maxBytes
    ) {
      throw new PersistentCacheBudgetError(
        usedBytes +
          incomingBytes,
        this.maxBytes,
      );
    }
  }

  private async entries(
    cache: Cache,
  ): Promise<readonly StoredEntry[]> {
    const requests =
      await cache.keys();
    const result:
      StoredEntry[] = [];

    for (
      const request of requests
    ) {
      const response =
        await cache.match(request);
      if (!response) continue;

      const bytes =
        Number(
          response.headers.get(
            BYTES_HEADER,
          ) ?? "0",
        );
      const storedAt =
        Number(
          response.headers.get(
            STORED_AT_HEADER,
          ) ?? "0",
        );

      if (
        !Number.isSafeInteger(bytes) ||
        bytes < 0 ||
        !Number.isFinite(storedAt)
      ) {
        await cache.delete(
          request,
        );
        continue;
      }

      result.push({
        request,
        bytes,
        storedAt,
      });
    }

    return Object.freeze(
      result,
    );
  }

  private async withMutation<T>(
    operation: () =>
      Promise<T>,
  ): Promise<T> {
    const previous =
      this.mutation;

    let release:
      () => void = () =>
        undefined;
    this.mutation =
      new Promise<void>(
        (resolve) => {
          release = resolve;
        },
      );

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
