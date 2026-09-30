import {
  EvidenceResolver,
} from "../evidence/EvidenceResolver.js";
import type {
  Evidence,
  EvidenceQuery,
} from "../evidence/types.js";
import {
  evidenceCacheIdentity,
} from "./EvidenceCacheIdentity.js";

export type EvidenceStreamStatus =
  | "applied"
  | "unchanged"
  | "unavailable"
  | "superseded";

export interface EvidenceStreamResult<T> {
  readonly status:
    EvidenceStreamStatus;
  readonly evidence:
    Evidence | null;
  readonly value: T | null;
  readonly cacheKey:
    string | null;
  readonly diagnostics:
    readonly string[];
}

export interface EvidenceStreamOptions<T> {
  readonly apply: (
    evidence: Evidence,
  ) => Promise<T>;
  readonly clear: () =>
    void | Promise<void>;
}

interface ActiveEvidence<T> {
  readonly key: string;
  readonly evidence: Evidence;
  readonly value: T;
}

export class EvidenceStreamController<T> {
  private active:
    ActiveEvidence<T> | null = null;
  private generation = 0;
  private desiredKey:
    string | null = null;
  private readonly pending =
    new Map<
      string,
      Promise<EvidenceStreamResult<T>>
    >();

  constructor(
    private readonly resolver:
      EvidenceResolver,
    private readonly options:
      EvidenceStreamOptions<T>,
  ) {}

  async prepare(
    query: EvidenceQuery,
  ): Promise<EvidenceStreamResult<T>> {
    const resolution =
      await this.resolver.resolveBest(
        query,
      );

    const evidence =
      resolution.evidence;

    if (!evidence) {
      this.generation += 1;
      this.desiredKey = null;
      this.active = null;
      await this.options.clear();

      return Object.freeze({
        status:
          "unavailable" as const,
        evidence: null,
        value: null,
        cacheKey: null,
        diagnostics:
          Object.freeze(
            resolution
              .unavailableProviders
              .map(
                (entry) =>
                  `${entry.providerId}: ${entry.reason}`,
              ),
          ),
      });
    }

    const identity =
      evidenceCacheIdentity(
        evidence,
      );

    if (
      this.active?.key ===
        identity.key &&
      this.desiredKey ===
        identity.key
    ) {
      return Object.freeze({
        status:
          "unchanged" as const,
        evidence:
          this.active.evidence,
        value:
          this.active.value,
        cacheKey:
          this.active.key,
        diagnostics:
          Object.freeze([]),
      });
    }

    const existing =
      this.pending.get(
        identity.key,
      );
    if (
      existing &&
      this.desiredKey ===
        identity.key
    ) {
      return existing;
    }

    this.desiredKey =
      identity.key;
    const generation =
      ++this.generation;

    const raw =
      this.applyResolved(
        evidence,
        identity.key,
        generation,
      );
    const pending =
      raw.finally(() => {
        if (
          this.pending.get(
            identity.key,
          ) === pending
        ) {
          this.pending.delete(
            identity.key,
          );
        }
      });

    this.pending.set(
      identity.key,
      pending,
    );

    return pending;
  }

  async clear(): Promise<void> {
    this.generation += 1;
    this.desiredKey = null;
    this.active = null;
    await this.options.clear();
  }

  get activeCacheKey():
    string | null {
    return this.active?.key ?? null;
  }

  private async applyResolved(
    evidence: Evidence,
    key: string,
    generation: number,
  ): Promise<EvidenceStreamResult<T>> {
    try {
      const value =
        await this.options.apply(
          evidence,
        );

      if (
        generation !==
          this.generation ||
        this.desiredKey !== key
      ) {
        return Object.freeze({
          status:
            "superseded" as const,
          evidence,
          value: null,
          cacheKey: key,
          diagnostics:
            Object.freeze([]),
        });
      }

      this.active = {
        key,
        evidence,
        value,
      };

      return Object.freeze({
        status:
          "applied" as const,
        evidence,
        value,
        cacheKey: key,
        diagnostics:
          Object.freeze([]),
      });
    } catch (error) {
      if (
        generation !==
          this.generation ||
        this.desiredKey !== key
      ) {
        return Object.freeze({
          status:
            "superseded" as const,
          evidence,
          value: null,
          cacheKey: key,
          diagnostics:
            Object.freeze([]),
        });
      }
      throw error;
    }
  }
}
