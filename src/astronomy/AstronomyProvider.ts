import type {
  CelestialBodyId,
  CelestialState,
  Epoch,
} from "./types";

export interface AstronomyProvider {
  stateAt(body: CelestialBodyId, epoch: Epoch): Promise<CelestialState>;
}

/**
 * Intentional default: the application renders no celestial body until an
 * authoritative astronomy provider is connected.
 *
 * Fabricated placeholder ephemerides are forbidden by project policy.
 */
export class UnavailableAstronomyProvider implements AstronomyProvider {
  async stateAt(
    _body: CelestialBodyId,
    _epoch: Epoch,
  ): Promise<CelestialState> {
    throw new Error(
      "No authoritative ephemeris provider is configured. Astronomical state will not be fabricated.",
    );
  }
}
