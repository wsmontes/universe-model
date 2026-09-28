import { METERS_PER_KILOMETER } from "../../core/units.js";
import { scale } from "../../core/Vec3d.js";
import type { Matrix3 } from "../frames/Matrix3.js";
import type { AstronomyProvider } from "../AstronomyProvider.js";
import type { CelestialBodyId, CelestialState, Epoch } from "../types.js";
import type { LoadedOrientationKernel } from "../../data/AuxiliaryKernelLoader.js";
import type { PlanetaryKernelManifest } from "../../data/KernelManifest.js";

interface WorkerOrientation {
  readonly bodyFixedToJ2000: readonly number[];
  readonly j2000ToBodyFixed: readonly number[];
  readonly frameClassId: number;
  readonly baseFrameId: number;
  readonly provenance: {
    readonly dataset: string;
    readonly kernelMd5: string;
    readonly kernelSource: string;
    readonly frameName: string;
    readonly baseFrameName: string;
    readonly quality: string;
  };
}

interface WorkerState {
  readonly bodyId: number;
  readonly epochUtc: string;
  readonly etSecondsPastJ2000: number;
  readonly positionKm: { readonly x: number; readonly y: number; readonly z: number };
  readonly velocityKmPerSecond: { readonly x: number; readonly y: number; readonly z: number };
  readonly orientation?: WorkerOrientation;
  readonly orientationUnavailableReason?: string;
}

interface SuccessMessage {
  readonly type: "success";
  readonly requestId: number;
  readonly states?: readonly WorkerState[];
  readonly kernelName?: string;
  readonly lunarPaGoldenErrorKm?: number;
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
  readonly orientationKernels?: readonly LoadedOrientationKernel[];
}

function matrix3(values: readonly number[]): Matrix3 {
  if (values.length !== 9 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Worker returned an invalid 3x3 orientation matrix.");
  }
  return Object.freeze([...values]) as unknown as Matrix3;
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
  private lunarPaGoldenErrorKm: number | null = null;

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

    const orientationKernels = (init.orientationKernels ?? []).map((loaded) => ({
      buffer: loaded.buffer,
      manifest: loaded.manifest,
      md5: loaded.md5,
      source: loaded.source,
    }));

    const transfer: Transferable[] = [
      init.buffer,
      ...orientationKernels.map((kernel) => kernel.buffer),
    ];

    const response = this.request({
      type: "init",
      requestId,
      buffer: init.buffer,
      manifest: { displayName: init.manifest.displayName, expectedMd5: init.manifest.expectedMd5 },
      source: init.source,
      leapSecondKernelText: init.leapSecondKernelText,
      orientationKernels,
    }, transfer);

    const result = await response;
    this.initialized = true;
    this.kernelName = result.kernelName ?? init.manifest.displayName;
    this.lunarPaGoldenErrorKm = result.lunarPaGoldenErrorKm ?? null;
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

    return Object.freeze(workerStates.map((state): CelestialState => {
      const base = {
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
      };

      if (state.orientation) {
        return Object.freeze({
          ...base,
          orientation: Object.freeze({
            bodyFixedToJ2000: matrix3(state.orientation.bodyFixedToJ2000),
            j2000ToBodyFixed: matrix3(state.orientation.j2000ToBodyFixed),
            frameClassId: state.orientation.frameClassId,
            baseFrameId: state.orientation.baseFrameId,
            provenance: Object.freeze({
              provider: "NAIF-BINARY-PCK" as const,
              ...state.orientation.provenance,
            }),
          }),
        });
      }

      if (state.orientationUnavailableReason) {
        return Object.freeze({
          ...base,
          orientationUnavailableReason: state.orientationUnavailableReason,
        });
      }

      return Object.freeze(base);
    }));
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

  get orientationValidationSummary(): string | null {
    if (this.lunarPaGoldenErrorKm === null) return null;
    return `NAIF lunar PA golden Δmax=${this.lunarPaGoldenErrorKm.toFixed(3)} km`;
  }

  private request(message: object & { requestId: number }, transfer: Transferable[] = []): Promise<SuccessMessage> {
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
