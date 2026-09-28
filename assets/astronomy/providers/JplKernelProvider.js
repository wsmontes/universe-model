import { METERS_PER_KILOMETER } from "../../core/units.js";
import { scale } from "../../core/Vec3d.js";

export class JplKernelProvider {
  worker;
  nextRequestId = 1;
  pending = new Map();
  manifest = null;
  kernelSource = "";
  initialized = false;
  kernelName = "";

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

  async stateAt(body, epoch) {
    const states = await this.statesAt([body], epoch);
    const state = states[0];
    if (!state) throw new Error(`No state returned for body ${body}.`);
    return state;
  }

  async statesAt(bodies, epoch) {
    if (!this.initialized || !this.manifest) throw new Error("JPL provider has not been initialized.");
    const requestId = this.nextRequestId++;
    const response = await this.request({ type: "states", requestId, bodies, isoUtc: epoch.isoUtc });
    const workerStates = response.states ?? [];
    const manifest = this.manifest;

    return Object.freeze(workerStates.map((state) => Object.freeze({
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
    })));
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
