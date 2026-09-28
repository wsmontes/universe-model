import { magnitude, scale, add } from "../core/Vec3d.js";
import { JplKernelProvider } from "../astronomy/providers/JplKernelProvider.js";
import { BODY_NAMES, NAIF } from "../astronomy/spk/naif.js";
import { DE440S, DE442S } from "../data/KernelManifest.js";
import { KernelLoader } from "../data/KernelLoader.js";
import { AuxiliaryKernelLoader } from "../data/AuxiliaryKernelLoader.js";
import { ORIENTATION_KERNELS } from "../data/OrientationKernelManifest.js";
import { bodyModel } from "../render/BodyModels.js";
import { OrbitCamera } from "../render/OrbitCamera.js";
import { WebGpuRenderer } from "../render/WebGpuRenderer.js";

const ASTRONOMICAL_BODIES = [NAIF.SUN, NAIF.EARTH, NAIF.MOON];

function element(selector) {
  const value = document.querySelector(selector);
  if (!value) throw new Error("Missing required UI element: " + selector);
  return value;
}

function formatDistance(meters) {
  const absolute = Math.abs(meters);
  if (absolute >= 1e12) return (meters / 1e12).toFixed(3) + " Tm";
  if (absolute >= 1e9) return (meters / 1e9).toFixed(3) + " Gm";
  if (absolute >= 1e6) return (meters / 1e6).toFixed(3) + " Mm";
  if (absolute >= 1e3) return (meters / 1e3).toFixed(3) + " km";
  return meters.toFixed(2) + " m";
}

function currentUtcIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function midpoint(a, b) {
  return scale(add(a, b), 0.5);
}

export class App {
  canvas = element("#universe");
  renderer = new WebGpuRenderer(this.canvas);
  camera = new OrbitCamera(this.canvas);
  provider = null;
  states = [];
  frameSelection = NAIF.EARTH;
  leapSecondKernelText = "";

  simulationRate = 0;
  lastNonZeroRate = 3600;
  simulationAnchorUtcMs = Date.now();
  simulationAnchorRealMs = performance.now();
  animationHandle = null;
  lastEphemerisRequestRealMs = 0;
  tickInFlight = false;
  surfaceEpochKey = "";

  epochInput = element("#epoch-input");
  gpuStatus = element("#gpu-status");
  astronomyStatus = element("#astronomy-status");
  orientationStatus = element("#orientation-status");
  timeStatus = element("#time-status");
  sourceStatus = element("#source-status");
  integrityStatus = element("#integrity-status");
  surfaceStatus = element("#surface-status");
  displayReferenceRadiance = element("#display-reference-radiance");
  runtimeBadge = element("#runtime-badge");
  message = element("#message");
  targetName = element("#target-name");
  targetDistance = element("#target-distance");
  cameraDistance = element("#camera-distance");
  surfaceModel = element("#surface-model");
  kernelFile = element("#kernel-file");
  playToggle = element("#play-toggle");
  timeRate = element("#time-rate");

  async start() {
    this.epochInput.value = currentUtcIso();
    this.resetSimulationClock(this.epochInput.value);
    this.bindUi();
    this.camera.setChangeHandler(() => this.render());

    try {
      await this.renderer.initialize();
      this.gpuStatus.textContent = "initialized (reversed-Z)";
      this.renderer.clear();
    } catch (error) {
      this.gpuStatus.textContent = "unavailable: " + this.errorMessage(error);
      this.message.textContent = "Astronomy can still load, but this browser cannot materialize the WebGPU scene.";
    }

    try {
      this.leapSecondKernelText = await this.loadLeapSecondKernel();
      const loaded = await this.loadBestPlanetaryKernel();
      const orientationKernels = await this.loadOrientationKernels();
      await this.initializeProvider(loaded, orientationKernels);
      await this.refreshAstronomy(true);
      this.runtimeBadge.textContent = "physical state live";
      this.startAnimationLoop();
    } catch (error) {
      this.runtimeBadge.textContent = "kernel required";
      this.astronomyStatus.textContent = "not loaded";
      this.message.textContent = this.errorMessage(error) + " You can select an official DE442s.bsp or DE440s.bsp file below.";
    }
  }

  bindUi() {
    element("#apply-epoch").addEventListener("click", () => {
      this.setSimulationRate(0);
      void this.refreshAstronomy(false);
    });
    element("#now").addEventListener("click", () => {
      this.setSimulationRate(0);
      this.epochInput.value = currentUtcIso();
      void this.refreshAstronomy(false);
    });

    this.playToggle.addEventListener("click", () => {
      this.setSimulationRate(this.simulationRate === 0 ? this.lastNonZeroRate : 0);
    });
    this.timeRate.addEventListener("change", () => {
      this.setSimulationRate(Number(this.timeRate.value));
    });
    this.displayReferenceRadiance.addEventListener("input", () => {
      this.render();
    });

    for (const button of document.querySelectorAll("[data-frame]")) {
      button.addEventListener("click", () => {
        const value = button.dataset.frame;
        this.frameSelection = value === "system" ? "system" : Number(value);
        for (const peer of document.querySelectorAll("[data-frame]")) {
          peer.classList.toggle("selected", peer === button);
        }
        this.frameCamera();
        this.render();
      });
    }

    this.kernelFile.addEventListener("change", () => {
      const file = this.kernelFile.files?.[0];
      if (file) void this.loadLocalKernel(file);
    });
  }

  async loadLeapSecondKernel() {
    const response = await fetch("./kernels/naif0012.tls", { cache: "force-cache" });
    if (!response.ok) throw new Error("Unable to load local NAIF leap-seconds kernel (" + response.status + ").");
    return response.text();
  }

  async loadBestPlanetaryKernel() {
    const loader = new KernelLoader((status) => {
      this.astronomyStatus.textContent = status;
      this.message.textContent = status;
    });
    try {
      return await loader.load(DE442S);
    } catch (de442Error) {
      this.message.textContent = "DE442s unavailable (" + this.errorMessage(de442Error) + "). Trying DE440s fallback…";
      return loader.load(DE440S);
    }
  }

  async loadOrientationKernels() {
    const loader = new AuxiliaryKernelLoader((status) => {
      this.orientationStatus.textContent = status;
    });

    const results = await Promise.allSettled(
      ORIENTATION_KERNELS.map((manifest) => loader.load(manifest)),
    );

    const loaded = [];
    const failures = [];
    results.forEach((result, index) => {
      const manifest = ORIENTATION_KERNELS[index];
      if (result.status === "fulfilled") {
        loaded.push(result.value);
      } else if (manifest) {
        failures.push(manifest.frameName + ": " + this.errorMessage(result.reason));
      }
    });

    if (loaded.length > 0) {
      this.orientationStatus.textContent =
        loaded.map((kernel) =>
          kernel.manifest.frameName + " · MD5 " + kernel.md5.slice(0, 8) + "…"
        ).join(" | ");
    } else {
      this.orientationStatus.textContent = "no binary PCK available";
    }

    if (failures.length > 0) {
      this.message.textContent =
        "Orientation data partially unavailable: " + failures.join(" | ");
    }

    return Object.freeze(loaded);
  }

  async loadLocalKernel(file) {
    const manifest = [DE442S, DE440S].find((candidate) => candidate.expectedBytes === file.size);
    if (!manifest) {
      this.message.textContent = "File size " + file.size + " bytes does not match the pinned DE442s or DE440s kernels.";
      return;
    }

    try {
      const loader = new KernelLoader((status) => {
        this.astronomyStatus.textContent = status;
        this.message.textContent = status;
      });
      const loaded = await loader.fromFile(file, manifest);
      const orientationKernels = await this.loadOrientationKernels();
      await this.initializeProvider(loaded, orientationKernels);
      await this.refreshAstronomy(true);
      this.runtimeBadge.textContent = "physical state live";
      this.startAnimationLoop();
    } catch (error) {
      this.message.textContent = this.errorMessage(error);
    }
  }

  async initializeProvider(loaded, orientationKernels) {
    this.provider?.dispose();
    const provider = new JplKernelProvider();
    this.astronomyStatus.textContent = "Parsing " + loaded.manifest.displayName + " in worker…";
    const kernelName = await provider.initialize({
      buffer: loaded.buffer,
      manifest: loaded.manifest,
      source: loaded.source,
      leapSecondKernelText: this.leapSecondKernelText,
      orientationKernels,
    });
    this.provider = provider;
    this.astronomyStatus.textContent = loaded.manifest.displayName + " · " + (kernelName || "SPK");
    this.sourceStatus.textContent =
      [loaded.source, ...orientationKernels.map((kernel) => kernel.manifest.frameName)].join(" | ");
    const orientationValidation = provider.orientationValidationSummary;
    this.integrityStatus.textContent =
      "SPK MD5 verified " + loaded.md5 +
      (orientationValidation ? " · " + orientationValidation : "");
  }

  async refreshAstronomy(reframe, isoUtc = this.epochInput.value.trim(), quiet = false, resetClock = true) {
    const provider = this.provider;
    if (!provider) return;
    if (!quiet) this.message.textContent = "Computing geometric J2000/SSB states…";
    try {
      this.states = await provider.statesAt(ASTRONOMICAL_BODIES, { isoUtc });
      const first = this.states[0];
      if (first) {
        this.epochInput.value = first.epochUtc.replace(/\.000Z$/, "Z");
        this.timeStatus.textContent = "ET " + first.etSecondsPastJ2000.toFixed(3) + " s past J2000 (TDB) · rate " + this.formatRate();
        if (resetClock) this.resetSimulationClock(first.epochUtc);
        this.prepareSurfacesForEpoch(first.epochUtc);
      }

      if (reframe) this.frameCamera();
      else this.followCameraTarget();
      this.render();
      this.updateReadout();
      if (!quiet) {
        this.message.textContent = "Geometric state reconstructed from the JPL kernel. Drag to orbit; wheel to change camera distance.";
      }
    } catch (error) {
      this.setSimulationRate(0);
      this.message.textContent = this.errorMessage(error);
    }
  }

  prepareSurfacesForEpoch(isoUtc) {
    const instant = new Date(isoUtc);
    if (!Number.isFinite(instant.getTime())) return;
    const key = String(instant.getUTCMonth() + 1).padStart(2, "0");
    if (key === this.surfaceEpochKey) return;

    this.surfaceEpochKey = key;
    this.surfaceStatus.textContent = "loading authoritative reference surface maps…";
    void this.renderer.prepareSurfaceEpoch(isoUtc)
      .then((summary) => {
        if (this.surfaceEpochKey !== key) return;
        this.surfaceStatus.textContent = summary || "uniform physical materials";
        this.render();
      })
      .catch((error) => {
        if (this.surfaceEpochKey !== key) return;
        this.surfaceStatus.textContent =
          "uniform fallback · " + this.errorMessage(error);
      });
  }

  startAnimationLoop() {
    if (this.animationHandle !== null) return;
    this.animationHandle = requestAnimationFrame(this.animationStep);
  }

  animationStep = (now) => {
    this.animationHandle = requestAnimationFrame(this.animationStep);
    if (this.simulationRate === 0 || !this.provider || this.tickInFlight) return;
    if (now - this.lastEphemerisRequestRealMs < 33) return;

    const utcMs = this.simulationUtcMs(now);
    if (!Number.isFinite(utcMs)) {
      this.setSimulationRate(0);
      return;
    }

    this.lastEphemerisRequestRealMs = now;
    this.tickInFlight = true;
    const iso = new Date(utcMs).toISOString();
    void this.refreshAstronomy(false, iso, true, false).finally(() => {
      this.tickInFlight = false;
    });
  };

  simulationUtcMs(realNow = performance.now()) {
    return this.simulationAnchorUtcMs +
      (realNow - this.simulationAnchorRealMs) * this.simulationRate;
  }

  resetSimulationClock(isoUtc) {
    const parsed = Date.parse(isoUtc);
    if (!Number.isFinite(parsed)) throw new Error("Cannot anchor simulation clock to invalid UTC epoch: " + isoUtc);
    this.simulationAnchorUtcMs = parsed;
    this.simulationAnchorRealMs = performance.now();
  }

  setSimulationRate(rate) {
    if (!Number.isFinite(rate)) return;
    const now = performance.now();
    const currentUtcMs = this.simulationUtcMs(now);
    this.simulationAnchorUtcMs = currentUtcMs;
    this.simulationAnchorRealMs = now;
    this.simulationRate = rate;
    if (rate !== 0) this.lastNonZeroRate = rate;
    this.timeRate.value = String(rate);
    this.playToggle.textContent = rate === 0 ? "Play" : "Pause";
    this.updateTimeStatusRate();
  }

  updateTimeStatusRate() {
    const existing = this.timeStatus.textContent ?? "";
    const base = existing.split(" · rate ")[0] ?? existing;
    this.timeStatus.textContent = base + " · rate " + this.formatRate();
  }

  formatRate() {
    if (this.simulationRate === 0) return "paused";
    return this.simulationRate.toLocaleString() + "×";
  }

  frameCamera() {
    if (this.states.length === 0) return;
    if (this.frameSelection === "system") {
      const earth = this.state(NAIF.EARTH);
      const moon = this.state(NAIF.MOON);
      const target = midpoint(earth.positionMeters, moon.positionMeters);
      const separation = magnitude({
        x: earth.positionMeters.x - moon.positionMeters.x,
        y: earth.positionMeters.y - moon.positionMeters.y,
        z: earth.positionMeters.z - moon.positionMeters.z,
      });
      const extent = separation / 2 + bodyModel(NAIF.EARTH).radiusMeters;
      this.camera.frame(target, extent * 3.2);
      return;
    }

    const state = this.state(this.frameSelection);
    const model = bodyModel(this.frameSelection);
    this.camera.frame(state.positionMeters, model.radiusMeters * 3.2);
  }

  followCameraTarget() {
    if (this.states.length === 0) return;
    if (this.frameSelection === "system") {
      this.camera.follow(midpoint(
        this.state(NAIF.EARTH).positionMeters,
        this.state(NAIF.MOON).positionMeters,
      ));
      return;
    }
    this.camera.follow(this.state(this.frameSelection).positionMeters);
  }

  render() {
    if (this.states.length === 0) return;
    try {
      this.renderer.render(
        this.states,
        this.camera.state(),
        Number(this.displayReferenceRadiance.value),
      );
      this.updateReadout();
    } catch (error) {
      this.gpuStatus.textContent = "render error: " + this.errorMessage(error);
    }
  }

  updateReadout() {
    const camera = this.camera.state();
    this.cameraDistance.textContent = formatDistance(camera.distanceMeters);
    if (this.frameSelection === "system") {
      this.targetName.textContent = "Earth–Moon system";
      this.targetDistance.textContent = "camera target: geometric midpoint";
      this.surfaceModel.textContent = "two physical-radius bodies";
      return;
    }
    const state = this.state(this.frameSelection);
    const model = bodyModel(this.frameSelection);
    this.targetName.textContent = BODY_NAMES[this.frameSelection] ?? String(this.frameSelection);
    this.targetDistance.textContent = formatDistance(magnitude(state.positionMeters));
    this.surfaceModel.textContent =
      state.orientation
        ? model.modelDescription + " · " + state.orientation.provenance.frameName
        : state.orientationUnavailableReason
          ? "not rendered accurately: " + state.orientationUnavailableReason
          : model.modelDescription;
  }

  state(bodyId) {
    const state = this.states.find((candidate) => candidate.bodyId === bodyId);
    if (!state) throw new Error("State for body " + bodyId + " is unavailable.");
    return state;
  }

  errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }
}
