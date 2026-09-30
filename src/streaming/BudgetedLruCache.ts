export interface BudgetedLruCacheOptions<T> {
  readonly maxBytes: number;
  readonly onEvict?: (
    key: string,
    value: T,
  ) => void;
}

interface CacheEntry<T> {
  readonly value: T;
  readonly bytes: number;
  pinCount: number;
  lastAccess: number;
}

export interface BudgetedLruSnapshot {
  readonly entries: number;
  readonly usedBytes: number;
  readonly maxBytes: number;
  readonly pinnedEntries: number;
}

export class ResourceBudgetExceededError
  extends Error
{
  readonly requestedBytes: number;
  readonly maxBytes: number;

  constructor(
    requestedBytes: number,
    maxBytes: number,
  ) {
    super(
      `Resource requires ${requestedBytes} bytes but the cache cannot free enough unpinned capacity within its ${maxBytes}-byte budget.`,
    );
    this.name =
      "ResourceBudgetExceededError";
    this.requestedBytes =
      requestedBytes;
    this.maxBytes = maxBytes;
  }
}

function validateBytes(
  value: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new RangeError(
      `${label} must be a safe integer >= 0.`,
    );
  }
  return value;
}

export class BudgetedLruCache<T> {
  private readonly entries =
    new Map<string, CacheEntry<T>>();
  private readonly maxBytes:
    number;
  private readonly onEvict:
    | ((
        key: string,
        value: T,
      ) => void)
    | undefined;
  private usedBytes = 0;
  private accessSequence = 1;

  constructor(
    options:
      BudgetedLruCacheOptions<T>,
  ) {
    this.maxBytes =
      validateBytes(
        options.maxBytes,
        "maxBytes",
      );
    this.onEvict =
      options.onEvict;
  }

  get(key: string): T | undefined {
    const entry =
      this.entries.get(key);
    if (!entry) return undefined;

    entry.lastAccess =
      this.accessSequence++;
    return entry.value;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  set(
    key: string,
    value: T,
    bytes: number,
  ): void {
    if (!key) {
      throw new Error(
        "Cache key must not be empty.",
      );
    }

    const normalizedBytes =
      validateBytes(
        bytes,
        "resource bytes",
      );

    if (
      normalizedBytes >
      this.maxBytes
    ) {
      throw new ResourceBudgetExceededError(
        normalizedBytes,
        this.maxBytes,
      );
    }

    const existing =
      this.entries.get(key);
    const existingBytes =
      existing?.bytes ?? 0;

    this.ensureCapacity(
      normalizedBytes -
        existingBytes,
      key,
    );

    if (existing) {
      this.usedBytes -=
        existing.bytes;
      this.evictValue(
        key,
        existing.value,
      );
    }

    this.entries.set(key, {
      value,
      bytes: normalizedBytes,
      pinCount:
        existing?.pinCount ?? 0,
      lastAccess:
        this.accessSequence++,
    });
    this.usedBytes +=
      normalizedBytes;
  }

  pin(key: string): boolean {
    const entry =
      this.entries.get(key);
    if (!entry) return false;
    entry.pinCount += 1;
    entry.lastAccess =
      this.accessSequence++;
    return true;
  }

  unpin(key: string): boolean {
    const entry =
      this.entries.get(key);
    if (!entry) return false;
    if (entry.pinCount > 0) {
      entry.pinCount -= 1;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry =
      this.entries.get(key);
    if (!entry) return false;

    this.entries.delete(key);
    this.usedBytes -= entry.bytes;
    this.evictValue(
      key,
      entry.value,
    );
    return true;
  }

  clear(): void {
    for (
      const [
        key,
        entry,
      ] of this.entries
    ) {
      this.evictValue(
        key,
        entry.value,
      );
    }
    this.entries.clear();
    this.usedBytes = 0;
  }

  snapshot():
    BudgetedLruSnapshot {
    let pinnedEntries = 0;
    for (
      const entry of
      this.entries.values()
    ) {
      if (entry.pinCount > 0) {
        pinnedEntries += 1;
      }
    }

    return Object.freeze({
      entries: this.entries.size,
      usedBytes: this.usedBytes,
      maxBytes: this.maxBytes,
      pinnedEntries,
    });
  }

  private ensureCapacity(
    additionalBytes: number,
    replacingKey: string,
  ): void {
    if (additionalBytes <= 0) {
      return;
    }

    while (
      this.usedBytes +
        additionalBytes >
      this.maxBytes
    ) {
      let evictionKey:
        string | null = null;
      let oldestAccess =
        Number.POSITIVE_INFINITY;

      for (
        const [
          key,
          entry,
        ] of this.entries
      ) {
        if (
          key === replacingKey ||
          entry.pinCount > 0
        ) {
          continue;
        }
        if (
          entry.lastAccess <
          oldestAccess
        ) {
          oldestAccess =
            entry.lastAccess;
          evictionKey = key;
        }
      }

      if (!evictionKey) {
        throw new ResourceBudgetExceededError(
          this.usedBytes +
            additionalBytes,
          this.maxBytes,
        );
      }

      this.delete(evictionKey);
    }
  }

  private evictValue(
    key: string,
    value: T,
  ): void {
    this.onEvict?.(
      key,
      value,
    );
  }
}
