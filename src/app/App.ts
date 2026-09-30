import { magnitude, scale, add } from "../core/Vec3d.js";
import type { Vec3d } from "../core/Vec3d.js";
import { JplKernelProvider } from "../astronomy/providers/JplKernelProvider.js";
import type { CelestialState } from "../astronomy/types.js";
import { BODY_NAMES, NAIF } from "../astronomy/spk/naif.js";
import { DE440S, DE442S } from "../data/KernelManifest.js";
import { KernelLoader, type LoadedKernel } from "../data/KernelLoader.js";
import { AuxiliaryKernelLoader, type LoadedOrientationKernel } from "../data/AuxiliaryKernelLoader.js";
import { ORIENTATION_KERNELS } from "../data/OrientationKernelManifest.js";
import { bodyModel } from "../render/BodyModels.js";
import {
  parseLeapSecondKernel,
  type LeapSecondKernelData,
} from "../astronomy/time/LeapSecondKernel.js";
import {
  taiUnixSecondsToUtcIso,
  utcIsoToTaiUnixSeconds,
} from "../astronomy/time/UtcTimeline.js";
import { OrbitCamera } from "../render/OrbitCamera.js";
import { WebGpuRenderer } from "../render/WebGpuRenderer.js";
import {
  createDefaultEvidenceResolver,
} from "../evidence/DefaultEvidenceRegistry.js";
import {
  EvidenceStreamController,
} from "../streaming/EvidenceStreamController.js";

const ASTRONOMICAL_BODIES = [NAIF.SUN, NAIF.EARTH, NAIF.MOON] as const;
type FrameSelection = number | "system";

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing required UI element: ${selector}`);
  return value;
}

function formatDistance(meters: number): string {
  const absolute = Math.abs(meters);
  if (absolute >= 1e12) return `${(meters / 1e12).toFixed(3)} Tm`;
  if (absolute >= 1e9) return `${(meters / 1e9).toFixed(3)} Gm`;
  if (absolute >= 1e6) return `${(meters / 1e6).toFixed(3)} Mm`;
  if (absolute >= 1e3) return `${(meters / 1e3).toFixed(3)} km`;
  return `${meters.toFixed(2)} m`;
}

function currentUtcIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function midpoint(a: Vec3d, b: Vec3d): Vec3d {
  return scale(add(a, b), 0.5);
}

export class App {
  private readonly canvas = element<HTMLCanvasElement>("#universe");
  private readonly renderer = new WebGpuRenderer(this.canvas);
  private readonly camera = new OrbitCamera(this.canvas);
  private readonly evidenceResolver =
    createDefaultEvidenceResolver();
  private readonly surfaceEvidenceStream =
    new EvidenceStreamController(
      this.evidenceResolver,
      {
        apply: (evidence) =>
          this.renderer.prepareSurfaceEvidence(
            evidence,
          ),
        clear: () =>
          this.renderer.clearSurfaceEvidence(
            NAIF.EARTH,
          ),
      },
    );
  private provider: JplKernelProvider | null = null;
  private states: readonly CelestialState[] = [];
  private frameSelection: FrameSelection = NAIF.EARTH;
  private leapSecondKernelText = "";
  private leapSecondKernel: LeapSecondKernelData | null = null;

  private simulationRate = 0;
  private lastNonZeroRate = 3600;
  private simulationAnchorTaiUnixSeconds = 0;
  private simulationAnchorRealMs = performance.now();
  private animationHandle: number | null = null;
  private lastEphemerisRequestRealMs = 0;
  private tickInFlight = false;

  private readonly epochInput = element<HTMLInputElement>("#epoch-input");
  private readonly gpuStatus = element<HTMLElement>("#gpu-status");
  private readonly astronomyStatus = element<HTMLElement>("#astronomy-status");
  private readonly orientationStatus = element<HTMLElement>("#orientation-status");
  private readonly timeStatus = element<HTMLElement>("#time-status");
  private readonly sourceStatus = element<HTMLElement>("#source-status");
  private readonly integrityStatus = element<HTMLElement>("#integrity-status");
  private readonly surfaceStatus = element<HTMLElement>("#surface-status");
  private readonly displayReferenceRadiance =
    element<HTMLInputElement>("#display-reference-radiance");
  private readonly runtimeBadge = element<HTMLElement>("#runtime-badge");
  private readonly message = element<HTMLElement>("#message");
  private readonly targetName = element<HTMLElement>("#target-name");
  private readonly targetDistance = element<HTMLElement>("#target-distance");
  private readonly cameraDistance = element<HTMLElement>("#camera-distance");
  private readonly surfaceModel = element<HTMLElement>("#surface-model");
  private readonly kernelFile = element<HTMLInputElement>("#kernel-file");
  private readonly playToggle = element<HTMLButtonElement>("#play-toggle");
  private readonly timeRate = element<HTMLSelectElement>("#time-rate");

  async start(): Promise<void> {
    this.epochInput.value = currentUtcIso();
    this.bindUi();
    this.camera.setChangeHandler(() => this.render());

    try {
      await this.renderer.initialize();
      this.gpuStatus.textContent = "initialized (reversed-Z)";
      this.renderer.clear();
    } catch (error) {
      this.gpuStatus.textContent = `unavailable: ${this.errorMessage(error)}`;
      this.message.textContent = "Astronomy can still load, but this browser cannot materialize the WebGPU scene.";
    }

    try {
      this.leapSecondKernelText = await this.loadLeapSecondKernel();
      this.resetSimulationClock(this.epochInput.value);
      const loaded = await this.loadBestPlanetaryKernel();
      const orientationKernels = await this.loadOrientationKernels();
      await this.initializeProvider(loaded, orientationKernels);
      await this.refreshAstronomy(true);
      this.runtimeBadge.textContent = "physical state live";
      this.startAnimationLoop();
    } catch (error) {
      this.runtimeBadge.textContent = "kernel required";
      this.astronomyStatus.textContent = "not loaded";
      this.message.textContent = `${this.errorMessage(error)} You can select an official DE442s.bsp or DE440s.bsp file below.`;
    }
  }

  private bindUi(): void {
    element<HTMLButtonElement>("#apply-epoch").addEventListener("click", () => {
      this.setSimulationRate(0);
      void this.refreshAstronomy(false);
    });
    element<HTMLButtonElement>("#now").addEventListener("click", () => {
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

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-frame]")) {
      button.addEventListener("click", () => {
        const value = button.dataset.frame;
        this.frameSelection = value === "system" ? "system" : Number(value);
        for (const peer of document.querySelectorAll<HTMLButtonElement>("[data-frame]")) {
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

  private async loadLeapSecondKernel(): Promise<string> {
    const response = await fetch("./kernels/naif0012.tls", { cache: "force-cache" });
    if (!response.ok) throw new Error(`Unable to load local NAIF leap-seconds kernel (${response.status}).`);
    const text = await response.text();
    this.leapSecondKernel = parseLeapSecondKernel(text, "NAIF naif0012.tls");
    return text;
  }

  private async loadBestPlanetaryKernel(): Promise<LoadedKernel> {
    const loader = new KernelLoader((status) => {
      this.astronomyStatus.textContent = status;
      this.message.textContent = status;
    });
    try {
      return await loader.load(DE442S);
    } catch (de442Error) {
      this.message.textContent = `DE442s unavailable (${this.errorMessage(de442Error)}). Trying DE440s fallback…`;
      return loader.load(DE440S);
    }
  }

  private async loadOrientationKernels(): Promise<readonly LoadedOrientationKernel[]> {
    const loader = new AuxiliaryKernelLoader((status) => {
      this.orientationStatus.textContent = status;
    });

    const results = await Promise.allSettled(
      ORIENTATION_KERNELS.map((manifest) => loader.load(manifest)),
    );

    const loaded: LoadedOrientationKernel[] = [];
    const failures: string[] = [];
    results.forEach((result, index) => {
      const manifest = ORIENTATION_KERNELS[index];
      if (result.status === "fulfilled") {
        loaded.push(result.value);
      } else if (manifest) {
        failures.push(`${manifest.frameName}: ${this.errorMessage(result.reason)}`);
      }
    });

    if (loaded.length > 0) {
      this.orientationStatus.textContent =
        loaded.map((kernel) => `${kernel.manifest.frameName} · MD5 ${kernel.md5.slice(0, 8)}…`).join(" | ");
    } else {
      this.orientationStatus.textContent = "no binary PCK available";
    }

    if (failures.length > 0) {
      this.message.textContent =
        `Orientation data partially unavailable: ${failures.join(" | ")}`;
    }

    return Object.freeze(loaded);
  }

  private async loadLocalKernel(file: File): Promise<void> {
    const manifest = [DE442S, DE440S].find((candidate) => candidate.expectedBytes === file.size);
    if (!manifest) {
      this.message.textContent = `File size ${file.size} bytes does not match the pinned DE442s or DE440s kernels.`;
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

  private async initializeProvider(
    loaded: LoadedKernel,
    orientationKernels: readonly LoadedOrientationKernel[],
  ): Promise<void> {
    this.provider?.dispose();
    const provider = new JplKernelProvider();
    this.astronomyStatus.textContent = `Parsing ${loaded.manifest.displayName} in worker…`;
    const kernelName = await provider.initialize({
      buffer: loaded.buffer,
      manifest: loaded.manifest,
      source: loaded.source,
      leapSecondKernelText: this.leapSecondKernelText,
      orientationKernels,
    });
    this.provider = provider;
    this.astronomyStatus.textContent = `${loaded.manifest.displayName} · ${kernelName || "SPK"}`;
    this.sourceStatus.textContent =
      [loaded.source, ...orientationKernels.map((kernel) => kernel.manifest.frameName)].join(" | ");
    const orientationValidation = provider.orientationValidationSummary;
    this.integrityStatus.textContent =
      `SPK MD5 verified ${loaded.md5}${orientationValidation ? ` · ${orientationValidation}` : ""}`;
  }

  private async refreshAstronomy(
    reframe: boolean,
    isoUtc = this.epochInput.value.trim(),
    quiet = false,
    resetClock = true,
  ): Promise<void> {
    const provider = this.provider;
    if (!provider) return;
    if (!quiet) this.message.textContent = "Computing geometric J2000/SSB states…";
    try {
      this.states = await provider.statesAt(ASTRONOMICAL_BODIES, { isoUtc });
      const first = this.states[0];
      if (first) {
        this.epochInput.value = first.epochUtc.replace(/\.000Z$/, "Z");
        this.timeStatus.textContent = `ET ${first.etSecondsPastJ2000.toFixed(3)} s past J2000 (TDB) · rate ${this.formatRate()}`;
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

  private prepareSurfacesForEpoch(isoUtc: string): void {
    const kernel =
      this.leapSecondKernel;
    if (!kernel) return;

    if (
      !this.surfaceEvidenceStream
        .activeCacheKey
    ) {
      this.surfaceStatus.textContent =
        "resolving best available surface evidence…";
    }

    const epoch = Object.freeze({
      utcIso: isoUtc,
      timeline: "TAI_UNIX",
      timelineSeconds:
        utcIsoToTaiUnixSeconds(
          kernel,
          isoUtc,
        ),
    });

    void this.surfaceEvidenceStream.prepare({
      payloadKind: "raster-tile",
      bodyId: NAIF.EARTH,
      epoch,
      requiredReferenceFrame:
        "ITRF93",
      acceptableEvidenceKinds: [
        "reconstruction",
      ],
    })
      .then((result) => {
        if (
          result.status ===
          "superseded"
        ) {
          return;
        }

        if (
          result.status ===
          "unavailable"
        ) {
          const reasons =
            result.diagnostics.join(
              " | ",
            );
          this.surfaceStatus.textContent =
            reasons
              ? `uniform physical material · ${reasons}`
              : "uniform physical material · no compatible surface evidence";
          this.render();
          return;
        }

        if (result.value) {
          this.surfaceStatus.textContent =
            `${result.value} · ${this.renderer.streamingTelemetrySummary}`;
        }

        if (
          result.status ===
          "applied"
        ) {
          this.render();
        }
      })
      .catch((error) => {
        this.surfaceStatus.textContent =
          `uniform fallback · ${this.errorMessage(error)}`;
      });
  }

  private startAnimationLoop(): void {
    if (this.animationHandle !== null) return;
    this.animationHandle = requestAnimationFrame(this.animationStep);
  }

  private readonly animationStep = (now: number): void => {
    this.animationHandle = requestAnimationFrame(this.animationStep);
    if (this.simulationRate === 0 || !this.provider || this.tickInFlight) return;
    if (now - this.lastEphemerisRequestRealMs < 33) return;

    const kernel = this.leapSecondKernel;
    if (!kernel) return;
    const taiUnixSeconds = this.simulationTaiUnixSeconds(now);
    if (!Number.isFinite(taiUnixSeconds)) {
      this.setSimulationRate(0);
      return;
    }

    this.lastEphemerisRequestRealMs = now;
    this.tickInFlight = true;
    const iso = taiUnixSecondsToUtcIso(kernel, taiUnixSeconds, 3);
    void this.refreshAstronomy(false, iso, true, false).finally(() => {
      this.tickInFlight = false;
    });
  };

  private simulationTaiUnixSeconds(realNow = performance.now()): number {
    return this.simulationAnchorTaiUnixSeconds +
      ((realNow - this.simulationAnchorRealMs) / 1000) * this.simulationRate;
  }

  private resetSimulationClock(isoUtc: string): void {
    const kernel = this.leapSecondKernel;
    if (!kernel) throw new Error("Leap-second kernel is not loaded.");
    this.simulationAnchorTaiUnixSeconds =
      utcIsoToTaiUnixSeconds(kernel, isoUtc);
    this.simulationAnchorRealMs = performance.now();
  }

  private setSimulationRate(rate: number): void {
    if (!Number.isFinite(rate) || !this.leapSecondKernel) return;
    const now = performance.now();
    const currentTaiUnixSeconds = this.simulationTaiUnixSeconds(now);
    this.simulationAnchorTaiUnixSeconds = currentTaiUnixSeconds;
    this.simulationAnchorRealMs = now;
    this.simulationRate = rate;
    if (rate !== 0) this.lastNonZeroRate = rate;
    this.timeRate.value = String(rate);
    this.playToggle.textContent = rate === 0 ? "Play" : "Pause";
    this.updateTimeStatusRate();
  }

  private updateTimeStatusRate(): void {
    const existing = this.timeStatus.textContent ?? "";
    const base = existing.split(" · rate ")[0] ?? existing;
    this.timeStatus.textContent = `${base} · rate ${this.formatRate()}`;
  }

  private formatRate(): string {
    if (this.simulationRate === 0) return "paused";
    return `${this.simulationRate.toLocaleString()}×`;
  }

  private frameCamera(): void {
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

  private followCameraTarget(): void {
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

  private render(): void {
    if (this.states.length === 0) return;
    try {
      this.renderer.render(
        this.states,
        this.camera.state(),
        Number(this.displayReferenceRadiance.value),
      );
      this.updateReadout();
    } catch (error) {
      this.gpuStatus.textContent = `render error: ${this.errorMessage(error)}`;
    }
  }

  private updateReadout(): void {
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
        ? `${model.modelDescription} · ${state.orientation.provenance.frameName}`
        : state.orientationUnavailableReason
          ? `not rendered accurately: ${state.orientationUnavailableReason}`
          : model.modelDescription;
  }

  private state(bodyId: number): CelestialState {
    const state = this.states.find((candidate) => candidate.bodyId === bodyId);
    if (!state) throw new Error(`State for body ${bodyId} is unavailable.`);
    return state;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
