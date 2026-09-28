import { magnitude, subtract } from "../core/Vec3d.js";
import type { CelestialState } from "../astronomy/types.js";
import type { CameraState } from "./OrbitCamera.js";
import { EARTH_REFERENCE_ATMOSPHERE } from "./AtmosphereModel.js";
import { bodyModel } from "./BodyModels.js";
import { cameraRotation, multiplyMat4, reversedInfinitePerspective } from "./math.js";
import { createUnitSphereMesh } from "./sphereMesh.js";

const HDR_FORMAT: GPUTextureFormat = "rgba16float";

const BODY_SHADER = /* wgsl */ `
struct SceneUniforms {
  viewProjection: mat4x4<f32>,
  sunPositionRadius: vec4<f32>,
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
  if (emissive) {
    return vec4<f32>(20.0, 20.0, 20.0, 1.0);
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
  return vec4<f32>(reflected, 1.0);
}
`;

const ATMOSPHERE_SHADER = /* wgsl */ `
struct AtmosphereUniforms {
  viewProjection: mat4x4<f32>,
  earthCenterUnused: vec4<f32>,
  innerRadiiTop: vec4<f32>,
  outerRadiiG: vec4<f32>,
  sunPositionUnused: vec4<f32>,
  rayleighBetaScaleHeight: vec4<f32>,
  mieScatteringScaleHeight: vec4<f32>,
  mieExtinctionPadding: vec4<f32>,
  rotationColumn0: vec4<f32>,
  rotationColumn1: vec4<f32>,
  rotationColumn2: vec4<f32>,
}

@group(0) @binding(0) var<uniform> atmosphere: AtmosphereUniforms;

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
}

fn bodyToJ2000() -> mat3x3<f32> {
  return mat3x3<f32>(
    atmosphere.rotationColumn0.xyz,
    atmosphere.rotationColumn1.xyz,
    atmosphere.rotationColumn2.xyz
  );
}

@vertex
fn vertexMain(@location(0) unitPosition: vec3<f32>) -> VertexOutput {
  let worldPosition =
    atmosphere.earthCenterUnused.xyz +
    bodyToJ2000() * (unitPosition * atmosphere.outerRadiiG.xyz);

  var output: VertexOutput;
  output.clipPosition = atmosphere.viewProjection * vec4<f32>(worldPosition, 1.0);
  output.worldPosition = worldPosition;
  return output;
}

fn rayEllipsoid(
  origin: vec3<f32>,
  direction: vec3<f32>,
  radii: vec3<f32>
) -> vec2<f32> {
  let o = origin / radii;
  let d = direction / radii;
  let a = dot(d, d);
  let b = dot(o, d);
  let c = dot(o, o) - 1.0;
  let discriminant = b * b - a * c;
  if (discriminant < 0.0) {
    return vec2<f32>(-1.0, -1.0);
  }
  let root = sqrt(discriminant);
  return vec2<f32>((-b - root) / a, (-b + root) / a);
}

fn radialSurfaceRadius(direction: vec3<f32>, radii: vec3<f32>) -> f32 {
  let n = normalize(direction);
  let scaled = n / radii;
  return inverseSqrt(dot(scaled, scaled));
}

fn densityAt(bodyFixedPosition: vec3<f32>) -> vec2<f32> {
  let radius = length(bodyFixedPosition);
  if (radius <= 0.0) {
    return vec2<f32>(1.0, 1.0);
  }
  let surfaceRadius = radialSurfaceRadius(
    bodyFixedPosition,
    atmosphere.innerRadiiTop.xyz
  );
  let altitude = max(radius - surfaceRadius, 0.0);
  return vec2<f32>(
    exp(-altitude / atmosphere.rayleighBetaScaleHeight.w),
    exp(-altitude / atmosphere.mieScatteringScaleHeight.w)
  );
}

fn opticalDepthToSun(
  sampleBody: vec3<f32>,
  sunDirectionBody: vec3<f32>
) -> vec2<f32> {
  let groundHit = rayEllipsoid(
    sampleBody,
    sunDirectionBody,
    atmosphere.innerRadiiTop.xyz
  );
  if (groundHit.y > 0.0 && groundHit.x > 1.0) {
    return vec2<f32>(1e30, 1e30);
  }

  let atmosphereHit = rayEllipsoid(
    sampleBody,
    sunDirectionBody,
    atmosphere.outerRadiiG.xyz
  );
  let endDistance = atmosphereHit.y;
  if (endDistance <= 0.0) {
    return vec2<f32>(0.0, 0.0);
  }

  let stepLength = endDistance / 8.0;
  var opticalDepth = vec2<f32>(0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let t = (f32(i) + 0.5) * stepLength;
    opticalDepth += densityAt(sampleBody + sunDirectionBody * t) * stepLength;
  }
  return opticalDepth;
}

fn rayleighPhase(mu: f32) -> f32 {
  return (3.0 / (16.0 * 3.141592653589793)) * (1.0 + mu * mu);
}

fn miePhase(mu: f32, g: f32) -> f32 {
  let gg = g * g;
  let denominator = pow(max(1.0 + gg - 2.0 * g * mu, 1e-4), 1.5);
  return (1.0 - gg) / (4.0 * 3.141592653589793 * denominator);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let bodyToWorld = bodyToJ2000();
  let worldToBody = transpose(bodyToWorld);

  // Camera is the origin of camera-relative coordinates.
  let cameraBody = worldToBody * (-atmosphere.earthCenterUnused.xyz);
  let rayDirectionWorld = normalize(input.worldPosition);
  let rayDirectionBody = normalize(worldToBody * rayDirectionWorld);

  let atmosphereHit = rayEllipsoid(
    cameraBody,
    rayDirectionBody,
    atmosphere.outerRadiiG.xyz
  );
  if (atmosphereHit.y <= 0.0) {
    discard;
  }

  let startDistance = max(atmosphereHit.x, 0.0);
  var endDistance = atmosphereHit.y;

  let groundHit = rayEllipsoid(
    cameraBody,
    rayDirectionBody,
    atmosphere.innerRadiiTop.xyz
  );
  if (groundHit.x > startDistance && groundHit.x < endDistance) {
    endDistance = groundHit.x;
  }

  if (endDistance <= startDistance) {
    discard;
  }

  let sunBody = worldToBody *
    (atmosphere.sunPositionUnused.xyz - atmosphere.earthCenterUnused.xyz);

  let betaRayleigh = atmosphere.rayleighBetaScaleHeight.xyz;
  let betaMieScattering = atmosphere.mieScatteringScaleHeight.xyz;
  let betaMieExtinction = atmosphere.mieExtinctionPadding.xyz;
  let g = atmosphere.outerRadiiG.w;

  let stepLength = (endDistance - startDistance) / 16.0;
  var viewOpticalDepth = vec2<f32>(0.0);
  var scattering = vec3<f32>(0.0);

  for (var i = 0; i < 16; i = i + 1) {
    let t = startDistance + (f32(i) + 0.5) * stepLength;
    let sampleBody = cameraBody + rayDirectionBody * t;
    let density = densityAt(sampleBody);
    viewOpticalDepth += density * stepLength;

    let sunDirectionBody = normalize(sunBody - sampleBody);
    let sunOpticalDepth = opticalDepthToSun(sampleBody, sunDirectionBody);
    if (sunOpticalDepth.x > 1e20) {
      continue;
    }

    let totalRayleighDepth = viewOpticalDepth.x + sunOpticalDepth.x;
    let totalMieDepth = viewOpticalDepth.y + sunOpticalDepth.y;
    let transmittance = exp(
      -(betaRayleigh * totalRayleighDepth +
        betaMieExtinction * totalMieDepth)
    );

    let mu = dot(rayDirectionBody, sunDirectionBody);
    let source =
      betaRayleigh * density.x * rayleighPhase(mu) +
      betaMieScattering * density.y * miePhase(mu, g);
    scattering += transmittance * source * stepLength;
  }

  let viewTransmittance = exp(
    -(betaRayleigh * viewOpticalDepth.x +
      betaMieExtinction * viewOpticalDepth.y)
  );
  let luminanceTransmittance =
    dot(viewTransmittance, vec3<f32>(0.2126, 0.7152, 0.0722));
  let alpha = clamp(1.0 - luminanceTransmittance, 0.0, 1.0);

  return vec4<f32>(scattering, alpha);
}
`;

const DISPLAY_SHADER = /* wgsl */ `
struct DisplayUniforms {
  exposure: f32,
  padding0: f32,
  padding1: f32,
  padding2: f32,
}

@group(0) @binding(0) var hdrTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> display: DisplayUniforms;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(position.xy);
  let linear = max(textureLoad(hdrTexture, pixel, 0).rgb, vec3<f32>(0.0));
  let mapped = vec3<f32>(1.0) - exp(-linear * display.exposure);
  let srgbApprox = pow(mapped, vec3<f32>(1.0 / 2.2));
  return vec4<f32>(srgbApprox, 1.0);
}
`;

interface BodyGpuResource {
  readonly uniformBuffer: GPUBuffer;
  readonly bindGroup: GPUBindGroup;
}

export class WebGpuRenderer {
  private readonly canvas: HTMLCanvasElement;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat | null = null;

  private bodyPipeline: GPURenderPipeline | null = null;
  private bodySceneBuffer: GPUBuffer | null = null;
  private bodySceneBindGroup: GPUBindGroup | null = null;
  private bodyResources = new Map<number, BodyGpuResource>();

  private atmospherePipeline: GPURenderPipeline | null = null;
  private atmosphereBuffer: GPUBuffer | null = null;
  private atmosphereBindGroup: GPUBindGroup | null = null;

  private displayPipeline: GPURenderPipeline | null = null;
  private displayBuffer: GPUBuffer | null = null;
  private displayBindGroup: GPUBindGroup | null = null;

  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private indexCount = 0;

  private depthTexture: GPUTexture | null = null;
  private hdrTexture: GPUTexture | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async initialize(): Promise<void> {
    if (!navigator.gpu) throw new Error("WebGPU is not available in this browser.");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter is available.");

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu");
    if (!this.context) throw new Error("Unable to create a WebGPU canvas context.");
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.initializeBodyPipeline();
    this.initializeAtmospherePipeline();
    this.initializeDisplayPipeline();

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

  render(states: readonly CelestialState[], camera: CameraState, exposure = 2.4): void {
    const device = this.requireDevice();
    this.resize();

    const context = this.context;
    const bodyPipeline = this.bodyPipeline;
    const bodySceneBuffer = this.bodySceneBuffer;
    const bodySceneBindGroup = this.bodySceneBindGroup;
    const vertexBuffer = this.vertexBuffer;
    const indexBuffer = this.indexBuffer;
    const depthTexture = this.depthTexture;
    const hdrTexture = this.hdrTexture;
    const displayPipeline = this.displayPipeline;
    const displayBindGroup = this.displayBindGroup;

    if (
      !context ||
      !bodyPipeline ||
      !bodySceneBuffer ||
      !bodySceneBindGroup ||
      !vertexBuffer ||
      !indexBuffer ||
      !depthTexture ||
      !hdrTexture ||
      !displayPipeline ||
      !displayBindGroup
    ) {
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
    const bodySceneData = new Float32Array(20);
    bodySceneData.set(viewProjection, 0);
    bodySceneData.set([sunLocal.x, sunLocal.y, sunLocal.z, sunRadius], 16);
    device.queue.writeBuffer(bodySceneBuffer, 0, bodySceneData);

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

    const hdrView = hdrTexture.createView();
    const depthView = depthTexture.createView();
    const encoder = device.createCommandEncoder({ label: "universe-frame" });

    const bodyPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: hdrView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    bodyPass.setPipeline(bodyPipeline);
    bodyPass.setBindGroup(0, bodySceneBindGroup);
    bodyPass.setVertexBuffer(0, vertexBuffer);
    bodyPass.setIndexBuffer(indexBuffer, "uint32");
    for (const state of renderableStates) {
      bodyPass.setBindGroup(1, this.bodyResource(state.bodyId).bindGroup);
      bodyPass.drawIndexed(this.indexCount);
    }
    bodyPass.end();

    if (earth?.orientation && this.cameraIsOutsideEarthAtmosphere(earth, camera)) {
      this.writeAtmosphereUniforms(earth, sun, camera, viewProjection);
      const atmospherePipeline = this.atmospherePipeline;
      const atmosphereBindGroup = this.atmosphereBindGroup;
      if (atmospherePipeline && atmosphereBindGroup) {
        const atmospherePass = encoder.beginRenderPass({
          colorAttachments: [{
            view: hdrView,
            loadOp: "load",
            storeOp: "store",
          }],
          depthStencilAttachment: {
            view: depthView,
            depthLoadOp: "load",
            depthStoreOp: "store",
          },
        });
        atmospherePass.setPipeline(atmospherePipeline);
        atmospherePass.setBindGroup(0, atmosphereBindGroup);
        atmospherePass.setVertexBuffer(0, vertexBuffer);
        atmospherePass.setIndexBuffer(indexBuffer, "uint32");
        atmospherePass.drawIndexed(this.indexCount);
        atmospherePass.end();
      }
    }

    if (this.displayBuffer) {
      device.queue.writeBuffer(this.displayBuffer, 0, new Float32Array([exposure, 0, 0, 0]));
    }

    const displayPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    displayPass.setPipeline(displayPipeline);
    displayPass.setBindGroup(0, displayBindGroup);
    displayPass.draw(3);
    displayPass.end();

    device.queue.submit([encoder.finish()]);
  }

  clear(): void {
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

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.depthTexture?.destroy();
    this.hdrTexture?.destroy();
    for (const resource of this.bodyResources.values()) resource.uniformBuffer.destroy();
    this.bodySceneBuffer?.destroy();
    this.atmosphereBuffer?.destroy();
    this.displayBuffer?.destroy();
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.device?.destroy();
  }

  private initializeBodyPipeline(): void {
    const device = this.requireDevice();
    const module = device.createShaderModule({ label: "physical-body-shader", code: BODY_SHADER });
    this.bodyPipeline = device.createRenderPipeline({
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
        targets: [{ format: HDR_FORMAT }],
      },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "greater",
      },
    });

    this.bodySceneBuffer = device.createBuffer({
      label: "body-scene-uniforms",
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bodySceneBindGroup = device.createBindGroup({
      layout: this.bodyPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.bodySceneBuffer } }],
    });
  }

  private initializeAtmospherePipeline(): void {
    const device = this.requireDevice();
    const module = device.createShaderModule({
      label: "earth-atmosphere-single-scattering-shader",
      code: ATMOSPHERE_SHADER,
    });

    this.atmospherePipeline = device.createRenderPipeline({
      label: "earth-atmosphere-single-scattering-pipeline",
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
        targets: [{
          format: HDR_FORMAT,
          blend: {
            color: {
              operation: "add",
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
            },
            alpha: {
              operation: "add",
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
            },
          },
        }],
      },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: false,
        depthCompare: "greater",
      },
    });

    this.atmosphereBuffer = device.createBuffer({
      label: "earth-atmosphere-uniforms",
      size: 224,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.atmosphereBindGroup = device.createBindGroup({
      layout: this.atmospherePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.atmosphereBuffer } }],
    });
  }

  private initializeDisplayPipeline(): void {
    const device = this.requireDevice();
    if (!this.format) throw new Error("Canvas format is unavailable.");
    const module = device.createShaderModule({ label: "display-response-shader", code: DISPLAY_SHADER });
    this.displayPipeline = device.createRenderPipeline({
      label: "display-response-pipeline",
      layout: "auto",
      vertex: { module, entryPoint: "vertexMain" },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.displayBuffer = device.createBuffer({
      label: "display-response-uniforms",
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private writeAtmosphereUniforms(
    earth: CelestialState,
    sun: CelestialState,
    camera: CameraState,
    viewProjection: Float32Array,
  ): void {
    const device = this.requireDevice();
    const buffer = this.atmosphereBuffer;
    if (!buffer || !earth.orientation) return;

    const model = EARTH_REFERENCE_ATMOSPHERE;
    const earthLocal = subtract(earth.positionMeters, camera.positionMeters);
    const sunLocal = subtract(sun.positionMeters, camera.positionMeters);
    const m = earth.orientation.bodyFixedToJ2000;
    const inner = bodyModel(399).radiiMeters;

    const data = new Float32Array(56);
    data.set(viewProjection, 0);
    data.set([earthLocal.x, earthLocal.y, earthLocal.z, 0], 16);
    data.set([inner[0], inner[1], inner[2], model.topAltitudeMeters], 20);
    data.set([
      model.outerRadiiMeters[0],
      model.outerRadiiMeters[1],
      model.outerRadiiMeters[2],
      model.mieG,
    ], 24);
    data.set([sunLocal.x, sunLocal.y, sunLocal.z, 0], 28);
    data.set([
      model.rayleighScatteringPerMeterRgb[0],
      model.rayleighScatteringPerMeterRgb[1],
      model.rayleighScatteringPerMeterRgb[2],
      model.rayleighScaleHeightMeters,
    ], 32);
    data.set([
      model.mieScatteringPerMeterRgb[0],
      model.mieScatteringPerMeterRgb[1],
      model.mieScatteringPerMeterRgb[2],
      model.mieScaleHeightMeters,
    ], 36);
    data.set([
      model.mieExtinctionPerMeterRgb[0],
      model.mieExtinctionPerMeterRgb[1],
      model.mieExtinctionPerMeterRgb[2],
      0,
    ], 40);
    data.set([m[0], m[3], m[6], 0], 44);
    data.set([m[1], m[4], m[7], 0], 48);
    data.set([m[2], m[5], m[8], 0], 52);

    device.queue.writeBuffer(buffer, 0, data);
  }

  private cameraIsOutsideEarthAtmosphere(
    earth: CelestialState,
    camera: CameraState,
  ): boolean {
    const distance = magnitude(subtract(camera.positionMeters, earth.positionMeters));
    const outer = EARTH_REFERENCE_ATMOSPHERE.outerRadiiMeters;
    return distance > Math.max(outer[0], outer[1], outer[2]);
  }

  private bodyResource(bodyId: number): BodyGpuResource {
    const existing = this.bodyResources.get(bodyId);
    if (existing) return existing;
    const device = this.requireDevice();
    const pipeline = this.bodyPipeline;
    if (!pipeline) throw new Error("GPU body pipeline is not initialized.");
    const uniformBuffer = device.createBuffer({
      label: `body-${bodyId}-uniforms`,
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

  private requireDevice(): GPUDevice {
    if (!this.device) throw new Error("WebGPU device is not initialized.");
    return this.device;
  }

  private readonly resize = (): void => {
    if (!this.device || !this.context || !this.format) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (
      this.canvas.width === width &&
      this.canvas.height === height &&
      this.depthTexture &&
      this.hdrTexture
    ) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });

    this.depthTexture?.destroy();
    this.hdrTexture?.destroy();

    this.depthTexture = this.device.createTexture({
      label: "reversed-z-depth",
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.hdrTexture = this.device.createTexture({
      label: "linear-hdr-scene",
      size: [width, height],
      format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    if (!this.displayPipeline || !this.displayBuffer) {
      throw new Error("Display pipeline is not initialized.");
    }
    this.displayBindGroup = this.device.createBindGroup({
      layout: this.displayPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.hdrTexture.createView() },
        { binding: 1, resource: { buffer: this.displayBuffer } },
      ],
    });
  };
}
