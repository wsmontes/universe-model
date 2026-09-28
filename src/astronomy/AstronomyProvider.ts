import type { CelestialBodyId, CelestialState, Epoch } from "./types.js";

export interface AstronomyProvider {
  stateAt(body: CelestialBodyId, epoch: Epoch): Promise<CelestialState>;
  statesAt(bodies: readonly CelestialBodyId[], epoch: Epoch): Promise<readonly CelestialState[]>;
  dispose(): void;
}
