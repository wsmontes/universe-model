import {
  EvidenceRegistry,
} from "./EvidenceProvider.js";
import {
  EvidenceResolver,
} from "./EvidenceResolver.js";
import {
  EarthBmngEvidenceProvider,
} from "./providers/EarthBmngEvidenceProvider.js";

export function createDefaultEvidenceResolver(): EvidenceResolver {
  const registry =
    new EvidenceRegistry();

  registry.register(
    new EarthBmngEvidenceProvider(),
  );

  return new EvidenceResolver(
    registry,
  );
}
