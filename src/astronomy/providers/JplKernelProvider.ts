import { METERS_PER_KILOMETER } from "../../core/units.js";
import { scale } from "../../core/Vec3d.js";
import type { PlanetaryKernelManifest } from "../../data/KernelManifest.js";
import type { AstronomyProvider } from "../AstronomyProvider.js";
import type { CelestialBodyId, CelestialState, Epoch } from "../types.js";

interface InitMessage {
  readonly type: "init";
  readonly requestId: number;
  readonly buffer: ArrayBuffer;
  readonly manifest: Pick<PlanetaryKernelManifest, "displayName" | "expectedMd5">;
  readonly source: string;
  readonly leapSecondKernelText: string;
}

interface StateMessage {
  readonly type: "states";
  readonly requestId: number;
  readonly bodies: readonly number[];
  readonly isoUtc: string;
}

interface WorkerState {
  readonly bodyId: number;
  readonly epochUtc: string;
  readonly etSecondsPastJ2000: number;
  readonly positionKm: { readonly x: number; readonly y: number; readonly z: number };
  readonly velocityKmPerSecond: { readonly x: number; readonly y: number; readonly z: number };
}

interface SuccessMessage {
  readonly type: "success";
  readonly requestId: number;
  readonly states?: readonly WorkerState[];
  readonly kernelName?: string;
}

interface ErrorMessage {
  readonly type: "error";
  readonly requestId: number;
  readonly message: string;
}

type WorkerResponse = SuccessMessage | ErrorMessage;

export interface JplProviderInit {
  readonly buffer: ArrayBuffer;
  readonly manifest: PlanetaryKernelManifest;
  readonly source: string;
  readonly leapSecondKernelText: string;
}

export class JplKernelProvider implements AstronomyProvider {
  private readonly worker: Worker;
  private nextRequestId = 1;
  private readonly pending = new Map<number, {
    resolve: (message: SuccessMessage) => void;
    reject: (error: Error) => void;
  }>();
  private manifest: PlanetaryKernelManifest | null = null;
  private kernelSource = "";
  private initialized = false;
  private kernelName = "";

  constructor() {
    this.worker = new Worker(new URL("../worker/ephemeris.worker.js", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Ephemeris worker failed.");
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    });
  }

  async initialize(init: JplProviderInit): Promise<string> {
    this.manifest = init.manifest;
    this.kernelSource = init.source;
    const requestId = this.nextRequestId++;
    const response = this.request({
      type: "init",
      requestId,
      buffer: init.buffer,
      manifest: { displayName: init.manifest.displayName, expectedMd5: init.manifest.expectedMd5 },
      source: init.source,
      leapSecondKernelText: init.leapSecondKernelText,
    }, [init.buffer]);
    const result = await response;
    this.initialized = true;
    this.kernelName = result.kernelName ?? init.manifest.displayName;
    return this.kernelName;
  }

  async stateAt(body: CelestialBodyId, epoch: Epoch): Promise<CelestialState> {
    const states = await this.statesAt([body], epoch);
    const state = states[0];
    if (!state) throw new Error(`No state returned for body ${body}.`);
    return state;
  }

  async statesAt(bodies: readonly CelestialBodyId[], epoch: Epoch): Promise<readonly CelestialState[]> {
    if (!this.initialized || !this.manifest) throw new Error("JPL provider has not been initialized.");
    const requestId = this.nextRequestId++;
    const response = await this.request({ type: "states", requestId, bodies, isoUtc: epoch.isoUtc });
    const workerStates = response.states ?? [];
    const manifest = this.manifest;

    return Object.freeze(workerStates.map((state): CelestialState => Object.freeze({
      bodyId: state.bodyId,
      epochUtc: state.epochUtc,
      etSecondsPastJ2000: state.etSecondsPastJ2000,
      positionMeters: scale(state.positionKm, METERS_PER_KILOMETER),
      velocityMetersPerSecond: scale(state.velocityKmPerSecond, METERS_PER_KILOMETER),
      provenance: Object.freeze({
        provider: "JPL-SPK" as const,
        dataset: manifest.displayName,
        kernelMd5: manifest.expectedMd5,
        kernelSource: this.kernelSource,
        referenceFrame: "J2000" as const,
        center: "SSB" as const,
        timeScale: "TDB/ET" as const,
        computationMode: "geometric" as const,
      }),
    })));
  }

  dispose(): void {
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.terminate();
    for (const entry of this.pending.values()) entry.reject(new Error("Ephemeris provider disposed."));
    this.pending.clear();
  }

  get description(): string {
    return this.kernelName || this.manifest?.displayName || "JPL SPK";
  }

  private request(message: InitMessage | StateMessage, transfer: Transferable[] = []): Promise<SuccessMessage> {
    return new Promise((resolve, reject) => {
      this.pending.set(message.requestId, { resolve, reject });
      this.worker.postMessage(message, transfer);
    });
  }

  private readonly onMessage = (event: MessageEvent<WorkerResponse>): void => {
    const message = event.data;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    if (message.type === "error") pending.reject(new Error(message.message));
    else pending.resolve(message);
  };
}
