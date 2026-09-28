import { magnitude, scale, add } from "../core/Vec3d.js";
import type { Vec3d } from "../core/Vec3d.js";
import { JplKernelProvider } from "../astronomy/providers/JplKernelProvider.js";
import type { CelestialState } from "../astronomy/types.js";
import { BODY_NAMES, NAIF } from "../astronomy/spk/naif.js";
import { DE440S, DE442S } from "../data/KernelManifest.js";
import { KernelLoader, type LoadedKernel } from "../data/KernelLoader.js";
import { bodyModel } from "../render/BodyModels.js";
import { OrbitCamera } from "../render/OrbitCamera.js";
import { WebGpuRenderer } from "../render/WebGpuRenderer.js";

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
  private provider: JplKernelProvider | null = null;
  private states: readonly CelestialState[] = [];
  private frameSelection: FrameSelection = NAIF.EARTH;
  private leapSecondKernelText = "";

  private readonly epochInput = element<HTMLInputElement>("#epoch-input");
  private readonly gpuStatus = element<HTMLElement>("#gpu-status");
  private readonly astronomyStatus = element<HTMLElement>("#astronomy-status");
  private readonly timeStatus = element<HTMLElement>("#time-status");
  private readonly sourceStatus = element<HTMLElement>("#source-status");
  private readonly integrityStatus = element<HTMLElement>("#integrity-status");
  private readonly runtimeBadge = element<HTMLElement>("#runtime-badge");
  private readonly message = element<HTMLElement>("#message");
  private readonly targetName = element<HTMLElement>("#target-name");
  private readonly targetDistance = element<HTMLElement>("#target-distance");
  private readonly cameraDistance = element<HTMLElement>("#camera-distance");
  private readonly surfaceModel = element<HTMLElement>("#surface-model");
  private readonly kernelFile = element<HTMLInputElement>("#kernel-file");

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
      const loaded = await this.loadBestPlanetaryKernel();
      await this.initializeProvider(loaded);
      await this.refreshAstronomy(true);
      this.runtimeBadge.textContent = "physical state live";
    } catch (error) {
      this.runtimeBadge.textContent = "kernel required";
      this.astronomyStatus.textContent = "not loaded";
      this.message.textContent = `${this.errorMessage(error)} You can select an official DE442s.bsp or DE440s.bsp file below.`;
    }
  }

  private bindUi(): void {
    element<HTMLButtonElement>("#apply-epoch").addEventListener("click", () => void this.refreshAstronomy(false));
    element<HTMLButtonElement>("#now").addEventListener("click", () => {
      this.epochInput.value = currentUtcIso();
      void this.refreshAstronomy(false);
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
    return response.text();
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
      await this.initializeProvider(loaded);
      await this.refreshAstronomy(true);
      this.runtimeBadge.textContent = "physical state live";
    } catch (error) {
      this.message.textContent = this.errorMessage(error);
    }
  }

  private async initializeProvider(loaded: LoadedKernel): Promise<void> {
    this.provider?.dispose();
    const provider = new JplKernelProvider();
    this.astronomyStatus.textContent = `Parsing ${loaded.manifest.displayName} in worker…`;
    const kernelName = await provider.initialize({
      buffer: loaded.buffer,
      manifest: loaded.manifest,
      source: loaded.source,
      leapSecondKernelText: this.leapSecondKernelText,
    });
    this.provider = provider;
    this.astronomyStatus.textContent = `${loaded.manifest.displayName} · ${kernelName || "SPK"}`;
    this.sourceStatus.textContent = loaded.source;
    this.integrityStatus.textContent = `MD5 verified ${loaded.md5}`;
  }

  private async refreshAstronomy(reframe: boolean): Promise<void> {
    const provider = this.provider;
    if (!provider) return;
    this.message.textContent = "Computing geometric J2000/SSB states…";
    try {
      this.states = await provider.statesAt(ASTRONOMICAL_BODIES, { isoUtc: this.epochInput.value.trim() });
      const first = this.states[0];
      if (first) {
        this.epochInput.value = first.epochUtc.replace(/\.000Z$/, "Z");
        this.timeStatus.textContent = `ET ${first.etSecondsPastJ2000.toFixed(3)} s past J2000 (TDB)`;
      }
      if (reframe) this.frameCamera();
      this.render();
      this.updateReadout();
      this.message.textContent = "Geometric state reconstructed from the JPL kernel. Drag to orbit; wheel to change camera distance.";
    } catch (error) {
      this.message.textContent = this.errorMessage(error);
    }
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

  private render(): void {
    if (this.states.length === 0) return;
    try {
      this.renderer.render(this.states, this.camera.state());
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
    this.surfaceModel.textContent = model.modelDescription;
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
