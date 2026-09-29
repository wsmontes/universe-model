import type {
  CelestialBodyId,
  CelestialState,
  Epoch,
  ObservedCelestialState,
} from "./types.js";
import type { AberrationCorrection } from "./observation/Aberration.js";

export interface AstronomyProvider {
  stateAt(
    body: CelestialBodyId,
    epoch: Epoch,
  ): Promise<CelestialState>;
}

export interface ObservationProvider {
  observedStatesAt(
    bodies: readonly CelestialBodyId[],
    observerBodyId: CelestialBodyId,
    epoch: Epoch,
    correction?: AberrationCorrection,
  ): Promise<readonly ObservedCelestialState[]>;
}
