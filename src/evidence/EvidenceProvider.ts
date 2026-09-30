import type {
  Coverage,
  Evidence,
  EvidencePayloadKind,
  EvidenceQuery,
} from "./types.js";

export interface EvidenceProvider {
  readonly id: string;
  readonly payloadKinds: readonly EvidencePayloadKind[];
  coverage(
    query: EvidenceQuery,
  ): Coverage | Promise<Coverage>;
  resolve(
    query: EvidenceQuery,
  ): Evidence | null | Promise<Evidence | null>;
}

export class EvidenceRegistry {
  private readonly providers =
    new Map<string, EvidenceProvider>();

  register(provider: EvidenceProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(
        `Evidence provider already registered: ${provider.id}`,
      );
    }
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  matching(
    query: EvidenceQuery,
  ): readonly EvidenceProvider[] {
    return Object.freeze(
      [...this.providers.values()].filter(
        (candidate) =>
          candidate.payloadKinds.includes(
            query.payloadKind,
          ),
      ),
    );
  }

  get size(): number {
    return this.providers.size;
  }
}
