import { subtract } from "../core/Vec3d.js";
import { bodyModel } from "./BodyModels.js";
import { cameraRotation, multiplyMat4, reversedInfinitePerspective } from "./math.js";
import { createUnitSphereMesh } from "./sphereMesh.js";

const SHADER = `
struct SceneUniforms {
  viewProjection: mat4x4<f32>,
  sunPositionRadius: vec4<f32>,
  exposurePadding: vec4<f32>,
}

struct BodyUniforms {
  centerRadius: vec4<f32>,
  radiiReflectance: vec4<f32>,
  colorEmissive: vec4<f32>,
  occluderCenterRadius: vec4<f32>,
  rotationColumn0: vec4<f32>,
  rotationColumn1: vec4<f32>,
  rotationColumn2: vec4<f32>,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<uniform> body: BodyUniforms;

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
}

@vertex
fn vertexMain(@location(0) unitPosition: vec3<f32>) -> VertexOutput {
  let bodyToJ2000 = mat3x3<f32>(
    body.rotationColumn0.xyz,
    body.rotationColumn1.xyz,
    body.rotationColumn2.xyz
  );
  let bodyFixedPosition = unitPosition * body.radiiReflectance.xyz;
  let worldPosition = body.centerRadius.xyz + bodyToJ2000 * bodyFixedPosition;
  let bodyFixedNormal = normalize(unitPosition / body.radiiReflectance.xyz);

  var output: VertexOutput;
  output.clipPosition = scene.viewProjection * vec4<f32>(worldPosition, 1.0);
  output.worldPosition = worldPosition;
  output.normal = normalize(bodyToJ2000 * bodyFixedNormal);
  return output;
}

fn displayResponse(linearValue: vec3<f32>, exposure: f32) -> vec3<f32> {
  let mapped = vec3<f32>(1.0) - exp(-max(linearValue, vec3<f32>(0.0)) * exposure);
  return pow(mapped, vec3<f32>(1.0 / 2.2));
}

fn solarVisibility(worldPosition: vec3<f32>) -> f32 {
  let occluderRadius = body.occluderCenterRadius.w;
  if (occluderRadius <= 0.0) {
    return 1.0;
  }

  let toSun = scene.sunPositionRadius.xyz - worldPosition;
  let toOccluder = body.occluderCenterRadius.xyz - worldPosition;
  let sunDistance = length(toSun);
  let occluderDistance = length(toOccluder);

  if (sunDistance <= scene.sunPositionRadius.w || occluderDistance <= occluderRadius) {
    return 1.0;
  }

  if (occluderDistance >= sunDistance) {
    return 1.0;
  }

  let sunAngularRadius = asin(clamp(scene.sunPositionRadius.w / sunDistance, 0.0, 1.0));
  let occluderAngularRadius = asin(clamp(occluderRadius / occluderDistance, 0.0, 1.0));
  let separation = acos(clamp(dot(normalize(toSun), normalize(toOccluder)), -1.0, 1.0));

  if (separation >= sunAngularRadius + occluderAngularRadius) {
    return 1.0;
  }

  let radiusDifference = abs(occluderAngularRadius - sunAngularRadius);
  if (separation <= radiusDifference) {
    if (occluderAngularRadius >= sunAngularRadius) {
      return 0.0;
    }
    let covered = (occluderAngularRadius * occluderAngularRadius) /
      (sunAngularRadius * sunAngularRadius);
    return clamp(1.0 - covered, 0.0, 1.0);
  }

  let d = max(separation, 1e-12);
  let r1 = sunAngularRadius;
  let r2 = occluderAngularRadius;
  let cosine1 = clamp((d * d + r1 * r1 - r2 * r2) / (2.0 * d * r1), -1.0, 1.0);
  let cosine2 = clamp((d * d + r2 * r2 - r1 * r1) / (2.0 * d * r2), -1.0, 1.0);
  let radical = max(
    0.0,
    (-d + r1 + r2) *
      (d + r1 - r2) *
      (d - r1 + r2) *
      (d + r1 + r2)
  );
  let overlap =
    r1 * r1 * acos(cosine1) +
    r2 * r2 * acos(cosine2) -
    0.5 * sqrt(radical);
  let sourceArea = 3.141592653589793 * r1 * r1;
  return clamp(1.0 - overlap / sourceArea, 0.0, 1.0);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let emissive = body.colorEmissive.w > 0.5;
  let exposure = scene.exposurePadding.x;
  if (emissive) {
    return vec4<f32>(displayResponse(vec3<f32>(20.0), exposure), 1.0);
  }

  let toSun = scene.sunPositionRadius.xyz - input.worldPosition;
  let distanceToSun = max(length(toSun), 1.0);
  let sunDirection = toSun / distanceToSun;
  let cosine = max(dot(normalize(input.normal), sunDirection), 0.0);
  let astronomicalUnitMeters = 149597870700.0;
  let irradianceRelativeToEarth = (astronomicalUnitMeters / distanceToSun) *
    (astronomicalUnitMeters / distanceToSun);
  let visibleSolarDisk = solarVisibility(input.worldPosition);
  let reflected = body.colorEmissive.rgb * body.radiiReflectance.w *
    cosine * irradianceRelativeToEarth * visibleSolarDisk;
  return vec4<f32>(displayResponse(reflected, exposure), 1.0);
}
`;

export class WebGpuRenderer {
  canvas;
  device = null;
  context = null;
  format = null;
  pipeline = null;
  sceneBuffer = null;
  sceneBindGroup = null;
  vertexBuffer = null;
  indexBuffer = null;
  indexCount = 0;
  depthTexture = null;
  bodyResources = new Map();

  constructor(canvas) {
    this.canvas = canvas;
  }

  async initialize() {
    if (!navigator.gpu) throw new Error("WebGPU is not available in this browser.");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter is available.");

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu");
    if (!this.context) throw new Error("Unable to create a WebGPU canvas context.");
    this.format = navigator.gpu.getPreferredCanvasFormat();

    const module = this.device.createShaderModule({ label: "physical-body-shader", code: SHADER });
    this.pipeline = this.device.createRenderPipeline({
      label: "physical-body-pipeline",
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vertexMain",
        buffers: [{
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
        }],
      },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "greater",
      },
    });

    this.sceneBuffer = this.device.createBuffer({
      label: "scene-uniforms",
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.sceneBuffer } }],
    });

    const mesh = createUnitSphereMesh();
    this.indexCount = mesh.indices.length;
    this.vertexBuffer = this.device.createBuffer({
      label: "unit-sphere-vertices",
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.indexBuffer = this.device.createBuffer({
      label: "unit-sphere-indices",
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, mesh.vertices);
    this.device.queue.writeBuffer(this.indexBuffer, 0, mesh.indices);

    window.addEventListener("resize", this.resize);
    this.resize();
  }

  render(states, camera, exposure = 2.4) {
    const device = this.requireDevice();
    this.resize();

    const context = this.context;
    const pipeline = this.pipeline;
    const sceneBuffer = this.sceneBuffer;
    const sceneBindGroup = this.sceneBindGroup;
    const vertexBuffer = this.vertexBuffer;
    const indexBuffer = this.indexBuffer;
    const depthTexture = this.depthTexture;
    if (!context || !pipeline || !sceneBuffer || !sceneBindGroup || !vertexBuffer || !indexBuffer || !depthTexture) {
      throw new Error("Renderer must be initialized before rendering.");
    }

    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
    const nearMeters = Math.max(0.1, camera.distanceMeters * 1e-7);
    const projection = reversedInfinitePerspective(Math.PI / 4, width / height, nearMeters);
    const rotation = cameraRotation(camera.positionMeters, camera.targetMeters);
    const viewProjection = multiplyMat4(projection, rotation);

    const sun = states.find((state) => state.bodyId === 10);
    const earth = states.find((state) => state.bodyId === 399);
    const moon = states.find((state) => state.bodyId === 301);
    if (!sun) throw new Error("Sun state is required for physical illumination.");

    const sunLocal = subtract(sun.positionMeters, camera.positionMeters);
    const sunRadius = bodyModel(10).radiusMeters;
    const sceneData = new Float32Array(24);
    sceneData.set(viewProjection, 0);
    sceneData.set([sunLocal.x, sunLocal.y, sunLocal.z, sunRadius], 16);
    sceneData.set([exposure, 0, 0, 0], 20);
    device.queue.writeBuffer(sceneBuffer, 0, sceneData);

    const renderableStates = states.filter((state) => {
      const model = bodyModel(state.bodyId);
      const [rx, ry, rz] = model.radiiMeters;
      const shapeNeedsOrientation =
        Math.max(rx, ry, rz) - Math.min(rx, ry, rz) > 0.001;
      return !shapeNeedsOrientation || Boolean(state.orientation);
    });

    for (const state of renderableStates) {
      const resource = this.bodyResource(state.bodyId);
      const model = bodyModel(state.bodyId);
      const local = subtract(state.positionMeters, camera.positionMeters);
      const bodyData = new Float32Array(28);
      bodyData.set([local.x, local.y, local.z, model.radiusMeters], 0);
      bodyData.set([
        model.radiiMeters[0],
        model.radiiMeters[1],
        model.radiiMeters[2],
        model.diffuseReflectance,
      ], 4);
      bodyData.set([
        model.baseReflectanceRgb[0],
        model.baseReflectanceRgb[1],
        model.baseReflectanceRgb[2],
        model.emissive ? 1 : 0,
      ], 8);

      const occluder = state.bodyId === 399 ? moon : state.bodyId === 301 ? earth : undefined;
      if (occluder) {
        const occluderLocal = subtract(occluder.positionMeters, camera.positionMeters);
        bodyData.set([
          occluderLocal.x,
          occluderLocal.y,
          occluderLocal.z,
          bodyModel(occluder.bodyId).radiusMeters,
        ], 12);
      } else {
        bodyData.set([0, 0, 0, 0], 12);
      }

      const m = state.orientation?.bodyFixedToJ2000 ?? [
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ];
      bodyData.set([m[0], m[3], m[6], 0], 16);
      bodyData.set([m[1], m[4], m[7], 0], 20);
      bodyData.set([m[2], m[5], m[8], 0], 24);

      device.queue.writeBuffer(resource.uniformBuffer, 0, bodyData);
    }

    const encoder = device.createCommandEncoder({ label: "universe-frame" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, sceneBindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, "uint32");

    for (const state of renderableStates) {
      pass.setBindGroup(1, this.bodyResource(state.bodyId).bindGroup);
      pass.drawIndexed(this.indexCount);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  clear() {
    const device = this.requireDevice();
    const context = this.context;
    if (!context) return;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  dispose() {
    window.removeEventListener("resize", this.resize);
    this.depthTexture?.destroy();
    for (const resource of this.bodyResources.values()) resource.uniformBuffer.destroy();
    this.sceneBuffer?.destroy();
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.device?.destroy();
  }

  bodyResource(bodyId) {
    const existing = this.bodyResources.get(bodyId);
    if (existing) return existing;
    const device = this.requireDevice();
    const pipeline = this.pipeline;
    if (!pipeline) throw new Error("GPU pipeline is not initialized.");
    const uniformBuffer = device.createBuffer({
      label: "body-" + bodyId + "-uniforms",
      size: 112,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    const resource = { uniformBuffer, bindGroup };
    this.bodyResources.set(bodyId, resource);
    return resource;
  }

  requireDevice() {
    if (!this.device) throw new Error("WebGPU device is not initialized.");
    return this.device;
  }

  resize = () => {
    if (!this.device || !this.context || !this.format) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width === width && this.canvas.height === height && this.depthTexture) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });
    this.depthTexture?.destroy();
    this.depthTexture = this.device.createTexture({
      label: "reversed-z-depth",
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  };
}
