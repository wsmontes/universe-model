export class WebGpuRenderer {
  private readonly canvas: HTMLCanvasElement;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async initialize(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not available in this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });

    if (!adapter) {
      throw new Error("No WebGPU adapter is available.");
    }

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu");

    if (!this.context) {
      throw new Error("Unable to create a WebGPU canvas context.");
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.resize();

    window.addEventListener("resize", this.resize);
  }

  render(): void {
    if (!this.device || !this.context || !this.format) {
      throw new Error("Renderer must be initialized before rendering.");
    }

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.device?.destroy();
  }

  private readonly resize = (): void => {
    if (!this.device || !this.context || !this.format) {
      return;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });
  };
}
