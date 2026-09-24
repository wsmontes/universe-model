import "./styles.css";
import { UnavailableAstronomyProvider } from "./astronomy/AstronomyProvider";
import { WebGpuRenderer } from "./render/WebGpuRenderer";

const canvas = document.querySelector<HTMLCanvasElement>("#universe");
const gpuStatus = document.querySelector<HTMLElement>("#gpu-status");
const astronomyStatus = document.querySelector<HTMLElement>("#astronomy-status");
const epoch = document.querySelector<HTMLElement>("#epoch");

if (!canvas || !gpuStatus || !astronomyStatus || !epoch) {
  throw new Error("Application shell is incomplete.");
}

const astronomy = new UnavailableAstronomyProvider();
void astronomy;

epoch.textContent = `Epoch (UTC): ${new Date().toISOString()}`;

const renderer = new WebGpuRenderer(canvas);

try {
  await renderer.initialize();
  renderer.render();
  gpuStatus.textContent = "WebGPU: initialized";
  astronomyStatus.textContent =
    "Astronomical state: intentionally empty until authoritative ephemerides are connected";
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  gpuStatus.textContent = `WebGPU: ${message}`;
  astronomyStatus.textContent = "Astronomical state: not rendered";
}
