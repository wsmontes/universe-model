import { METERS_PER_KILOMETER } from "../../core/units.js";
import { scale } from "../../core/Vec3d.js";

function matrix3(values) {
  if (values.length !== 9 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Worker returned an invalid 3x3 orientation matrix.");
  }
  return Object.freeze([...values]);
}

export class JplKernelProvider {
  worker;
  nextRequestId = 1;
  pending = new Map();
  manifest = null;
  kernelSource = "";
  initialized = false;
  kernelName = "";
  lunarPaGoldenErrorKm = null;

  constructor() {
    this.worker = new Worker(new URL("../worker/ephemeris.worker.js", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Ephemeris worker failed.");
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    });
  }

  async initialize(init) {
    this.manifest = init.manifest;
    this.kernelSource = init.source;
    const requestId = this.nextRequestId++;

    const orientationKernels = (init.orientationKernels ?? []).map((loaded) => ({
      buffer: loaded.buffer,
      manifest: loaded.manifest,
      md5: loaded.md5,
      source: loaded.source,
    }));

    const transfer = [
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

  async stateAt(body, epoch) {
    const states = await this.statesAt([body], epoch);
    const state = states[0];
    if (!state) throw new Error("No state returned for body " + body + ".");
    return state;
  }

  async statesAt(bodies, epoch) {
    if (!this.initialized || !this.manifest) throw new Error("JPL provider has not been initialized.");
    const requestId = this.nextRequestId++;
    const response = await this.request({ type: "states", requestId, bodies, isoUtc: epoch.isoUtc });
    const workerStates = response.states ?? [];
    const manifest = this.manifest;

    return Object.freeze(workerStates.map((state) => {
      const base = {
        bodyId: state.bodyId,
        epochUtc: state.epochUtc,
        etSecondsPastJ2000: state.etSecondsPastJ2000,
        positionMeters: scale(state.positionKm, METERS_PER_KILOMETER),
        velocityMetersPerSecond: scale(state.velocityKmPerSecond, METERS_PER_KILOMETER),
        provenance: Object.freeze({
          provider: "JPL-SPK",
          dataset: manifest.displayName,
          kernelMd5: manifest.expectedMd5,
          kernelSource: this.kernelSource,
          referenceFrame: "J2000",
          center: "SSB",
          timeScale: "TDB/ET",
          computationMode: "geometric",
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
              provider: "NAIF-BINARY-PCK",
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

  dispose() {
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.terminate();
    for (const entry of this.pending.values()) entry.reject(new Error("Ephemeris provider disposed."));
    this.pending.clear();
  }

  get description() {
    return this.kernelName || this.manifest?.displayName || "JPL SPK";
  }

  get orientationValidationSummary() {
    if (this.lunarPaGoldenErrorKm === null) return null;
    return "NAIF lunar PA golden Δmax=" + this.lunarPaGoldenErrorKm.toFixed(3) + " km";
  }

  request(message, transfer = []) {
    return new Promise((resolve, reject) => {
      this.pending.set(message.requestId, { resolve, reject });
      this.worker.postMessage(message, transfer);
    });
  }

  onMessage = (event) => {
    const message = event.data;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    if (message.type === "error") pending.reject(new Error(message.message));
    else pending.resolve(message);
  };
}
