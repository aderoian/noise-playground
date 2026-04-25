import { Color, PerspectiveCamera, Vector3 } from "three";
import { buildBiomeTerrainComputeWgsl, fillBiomeUniformBuffer, padThreeBiomes } from "../../gpu/buildBiomeTerrainComputeWgsl.js";
import { buildTerrainComputeWgsl } from "../../gpu/buildTerrainComputeWgsl.js";
import { fillGraphParamBufferFromSlots } from "../../gpu/graphCompilerWgsl.js";
import { TERRAIN_RENDER_WGSL } from "../../gpu/terrainRenderWgsl.js";
import { getRenderPresetLook, seedToOffset } from "../../noise/defaults.js";
import { getGraphRegistry } from "../../noise/graphBridge.js";
import { validateAndNormalize } from "../../noise/state.js";
import { resolveLodLevel, resolveMeshSegmentsForRing } from "./LODResolver.js";
import {
  applyCameraFromViewMode,
  getCenterChunkCoord,
  getViewCenterChunkFloat,
  getViewCenterWorldXY
} from "./ViewController.js";
import {
  terrainChunkContentSignature,
  terrainGraphCompileSignature
} from "./terrainStateSignature.js";

const COMPUTE_GLOBAL_FLOATS = 12;
const COMPUTE_GLOBAL_BYTES = COMPUTE_GLOBAL_FLOATS * 4;
const COMPUTE_PARAM_BYTES = 384 * 4;
const COMPUTE_BIOME_UNIFORM_BYTES = 8 * 16;
const COMPUTE_CHUNK_BYTES = 32;
const RENDER_FRAME_BYTES = 112;
const RENDER_CHUNK_BYTES = 48;
const DEBUG_BORDER_FLAG = 1;
const DEBUG_DIRTY_FLAG = 2;

const LOD_DBG_PALETTE = Array.from({ length: 32 }, (_, i) => {
  const c = new Color().setHSL((i * 0.618033988749895) % 1, 0.62, 0.52);
  return new Vector3(c.r, c.g, c.b);
});

/**
 * @param {number} level
 * @returns {import("three").Vector3}
 */
function lodColorForLevel(level) {
  const idx = Math.max(0, level | 0) % LOD_DBG_PALETTE.length;
  return LOD_DBG_PALETTE[idx];
}

export function isWebGpuTerrainSupported() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

function createFlatComputeWgsl() {
  return `
struct GlobalU {
  ctx_time: f32,
  ctx_seed: f32,
  amp_mesh: f32,
  height_off: f32,
  off_x: f32,
  off_y: f32,
  off_z: f32,
  slice_z: f32,
  animate: f32,
  time_speed: f32,
  pad0: f32,
  pad1: f32,
};
struct ParamsU {
  values: array<f32, 384>,
};
struct ChunkU {
  origin_x: f32,
  origin_y: f32,
  world_size: f32,
  segments: u32,
};
@group(0) @binding(0) var<uniform> g_global: GlobalU;
@group(0) @binding(1) var<uniform> g_params: ParamsU;
@group(1) @binding(0) var<uniform> g_chunk: ChunkU;
@group(1) @binding(1) var<storage, read_write> g_terrain: array<vec4<f32>>;

fn eval_graph_height(world_x: f32, world_y: f32) -> f32 {
  let wx = world_x + g_global.off_x;
  let wy = world_y + g_global.off_y;
  let wave = sin(wx * 0.35 + g_global.ctx_seed * 0.01) * cos(wy * 0.35 - g_global.ctx_seed * 0.01);
  return wave * 0.05;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let sample_w = g_chunk.segments + 1u;
  if (gid.x >= sample_w || gid.y >= sample_w) {
    return;
  }
  let denom = max(f32(g_chunk.segments), 1.0);
  let wx = g_chunk.origin_x + (f32(gid.x) / denom) * g_chunk.world_size;
  let wy = g_chunk.origin_y + (f32(gid.y) / denom) * g_chunk.world_size;
  let idx = gid.y * sample_w + gid.x;
  g_terrain[idx] = vec4f(0.0, 0.0, 0.0, eval_graph_height(wx, wy));
}
`;
}

function makeBuffer(device, size, usage, label) {
  return device.createBuffer({ size, usage, label });
}

function createGridTemplateData(segments) {
  const s = Math.max(2, segments | 0);
  const w = s + 1;
  const uv = new Float32Array(w * w * 2);
  let uvi = 0;
  for (let j = 0; j < w; j++) {
    const v = j / s;
    for (let i = 0; i < w; i++) {
      uv[uvi++] = i / s;
      uv[uvi++] = v;
    }
  }
  const triCount = 2 * s * s;
  const indices = new Uint32Array(triCount * 3);
  let ii = 0;
  for (let j = 0; j < s; j++) {
    for (let i = 0; i < s; i++) {
      const a = i + j * w;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      indices[ii++] = a;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = d;
    }
  }
  return { uv, indices, triangleCount: triCount };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {() => any} getState
 * @param {() => any} [getGraph]
 */
export function createGpuRendererController(canvas, getState, getGraph) {
  const getNoiseGraph = typeof getGraph === "function" ? getGraph : () => getState().noiseGraph;
  const registry = getGraphRegistry();
  const camera = new PerspectiveCamera(48, 1, 0.05, 500);
  const viewInfo = {
    backend: "webgpu-init",
    compileStatus: "initializing",
    segments: 0,
    triangleCount: 0,
    activeChunkCount: 0,
    dirtyChunkCount: 0,
    centerChunk: "—",
    cameraLabel: "—",
    viewMode: "—",
    flyPos: "—",
    graphHash: "",
    shaderPreview: "",
    compileErrors: "",
    gpuGenMs: 0
  };

  /** @type {GPUDevice | null} */
  let device = null;
  /** @type {GPUCanvasContext | null} */
  let context = null;
  /** @type {GPUTexture | null} */
  let depthTexture = null;
  let presentationFormat = "bgra8unorm";
  let lastCanvasW = 0;
  let lastCanvasH = 0;
  let initError = "";

  /** @type {GPUBuffer | null} */
  let globalUniformBuffer = null;
  /** @type {GPUBuffer | null} */
  let paramUniformBuffer = null;
  /** @type {GPUBuffer | null} */
  let paramBiome0Buffer = null;
  /** @type {GPUBuffer | null} */
  let paramBiome1Buffer = null;
  /** @type {GPUBuffer | null} */
  let paramBiome2Buffer = null;
  /** @type {GPUBuffer | null} */
  let biomeUniformBuffer = null;
  /** @type {GPUBuffer | null} */
  let computeChunkUniformBuffer = null;
  /** @type {GPUBuffer | null} */
  let renderFrameUniformBuffer = null;
  /** @type {GPUBuffer | null} */
  let renderChunkUniformBuffer = null;
  /** @type {GPURenderPipeline | null} */
  let renderPipeline = null;
  /** @type {GPUBindGroup | null} */
  let renderFrameBindGroup = null;
  /** @type {GPUBindGroupLayout | null} */
  let renderChunkBindGroupLayout = null;
  /** @type {Float32Array} */
  const paramScratch = new Float32Array(COMPUTE_PARAM_BYTES / 4);
  const biomeScratch = new Float32Array(32);

  /** @type {Map<string, any>} */
  const compileCache = new Map();
  /** @type {Map<number, { vertexBuffer: GPUBuffer, indexBuffer: GPUBuffer, indexCount: number, triangleCount: number }>} */
  const gridCache = new Map();
  /** @type {Map<number, GPUBuffer[]>} */
  const heightBufferPool = new Map();
  /** @type {Map<string, any>} */
  const chunkMap = new Map();

  /** @type {any} */
  let activeRuntime = null;
  let lastCompileSig = "";
  let pendingCompileSig = "";
  let pendingCompileDueAt = 0;
  let compilePromise = null;
  let lastChunkContentSig = "";
  let lastParamHash = "";
  let lastGpuTimingMs = 0;

  const initPromise = initWebGpu();

  async function initWebGpu() {
    if (!isWebGpuTerrainSupported()) {
      initError = "WebGPU is not available in this browser.";
      viewInfo.backend = "webgpu-unavailable";
      viewInfo.compileStatus = "unsupported";
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      initError = "No WebGPU adapter available.";
      viewInfo.backend = "webgpu-unavailable";
      viewInfo.compileStatus = "unsupported";
      return;
    }
    device = await adapter.requestDevice();
    context = /** @type {GPUCanvasContext | null} */ (canvas.getContext("webgpu"));
    if (!context) {
      initError = "Failed to acquire a WebGPU canvas context.";
      viewInfo.backend = "webgpu-failed";
      viewInfo.compileStatus = "failed";
      return;
    }
    presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    globalUniformBuffer = makeBuffer(device, COMPUTE_GLOBAL_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "global-uniform");
    paramUniformBuffer = makeBuffer(device, COMPUTE_PARAM_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "graph-param-uniform");
    paramBiome0Buffer = makeBuffer(device, COMPUTE_PARAM_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "graph-param-b0");
    paramBiome1Buffer = makeBuffer(device, COMPUTE_PARAM_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "graph-param-b1");
    paramBiome2Buffer = makeBuffer(device, COMPUTE_PARAM_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "graph-param-b2");
    biomeUniformBuffer = makeBuffer(device, COMPUTE_BIOME_UNIFORM_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "biome-uniform");
    computeChunkUniformBuffer = makeBuffer(device, COMPUTE_CHUNK_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "compute-chunk-uniform");
    renderFrameUniformBuffer = makeBuffer(device, RENDER_FRAME_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "render-frame-uniform");
    renderChunkUniformBuffer = makeBuffer(device, RENDER_CHUNK_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "render-chunk-uniform");
    await createRenderPipeline();
    resizeSurface();
    viewInfo.backend = "webgpu";
    viewInfo.compileStatus = "ready";
  }

  async function createRenderPipeline() {
    if (!device) {
      return;
    }
    const renderModule = device.createShaderModule({ code: TERRAIN_RENDER_WGSL, label: "terrain-render" });
    const info = await renderModule.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((m) => m.message).join("\n"));
    }
    renderPipeline = device.createRenderPipeline({
      label: "terrain-render-pipeline",
      layout: "auto",
      vertex: {
        module: renderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }]
          }
        ]
      },
      fragment: {
        module: renderModule,
        entryPoint: "fs_main",
        targets: [{ format: presentationFormat }]
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
        frontFace: "ccw"
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less"
      }
    });
    renderFrameBindGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: /** @type {GPUBuffer} */ (renderFrameUniformBuffer) } }]
    });
    renderChunkBindGroupLayout = renderPipeline.getBindGroupLayout(1);
  }

  function resizeSurface() {
    if (!device || !context) {
      return;
    }
    const w = Math.max(1, Math.floor(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
    const h = Math.max(1, Math.floor(canvas.clientHeight * Math.min(2, window.devicePixelRatio || 1)));
    if (w === lastCanvasW && h === lastCanvasH) {
      return;
    }
    lastCanvasW = w;
    lastCanvasH = h;
    canvas.width = w;
    canvas.height = h;
    context.configure({
      device,
      format: presentationFormat,
      alphaMode: "opaque"
    });
    if (depthTexture) {
      depthTexture.destroy();
    }
    depthTexture = device.createTexture({
      size: { width: w, height: h },
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      label: "terrain-depth"
    });
    camera.aspect = h > 0 ? w / h : 1;
    camera.updateProjectionMatrix();
  }

  function getGridTemplate(segments) {
    if (!device) {
      return null;
    }
    const key = Math.max(2, segments | 0);
    const hit = gridCache.get(key);
    if (hit) {
      return hit;
    }
    const data = createGridTemplateData(key);
    const vertexBuffer = makeBuffer(device, data.uv.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, `grid-uv-${key}`);
    const indexBuffer = makeBuffer(device, data.indices.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, `grid-idx-${key}`);
    device.queue.writeBuffer(vertexBuffer, 0, data.uv);
    device.queue.writeBuffer(indexBuffer, 0, data.indices);
    const out = {
      vertexBuffer,
      indexBuffer,
      indexCount: data.indices.length,
      triangleCount: data.triangleCount
    };
    gridCache.set(key, out);
    return out;
  }

  function acquireHeightBuffer(sampleCount) {
    if (!device) {
      return null;
    }
    const pool = heightBufferPool.get(sampleCount);
    if (pool && pool.length > 0) {
      return pool.pop() || null;
    }
    return makeBuffer(
      device,
      sampleCount * 16,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      `height-buffer-${sampleCount}`
    );
  }

  function releaseHeightBuffer(sampleCount, buffer) {
    if (!buffer) {
      return;
    }
    let pool = heightBufferPool.get(sampleCount);
    if (!pool) {
      pool = [];
      heightBufferPool.set(sampleCount, pool);
    }
    pool.push(buffer);
  }

  function removeChunk(k) {
    const ch = chunkMap.get(k);
    if (!ch) {
      return;
    }
    releaseHeightBuffer(ch.sampleCount, ch.heightBuffer);
    chunkMap.delete(k);
  }

  function syncRing(st) {
    /** @type {Set<string>} */
    const want = new Set();
    let fxc = 0;
    let fyc = 0;
    if (st.rendererViewMode === "chunk") {
      const n = st.chunkViewSize | 0;
      const side = n === 1 || n === 3 || n === 5 ? n : 3;
      const half = (side - 1) >> 1;
      for (let j = -half; j <= half; j++) {
        for (let i = -half; i <= half; i++) {
          want.add(`${i},${j}`);
        }
      }
    } else {
      const c = getCenterChunkCoord(st);
      const fc = getViewCenterChunkFloat(st);
      fxc = fc.fxc;
      fyc = fc.fyc;
      const r = st.chunkRadius | 0;
      if (r <= 0) {
        want.add(`${c.cx},${c.cy}`);
      } else {
        const r2 = r * r;
        const i0 = Math.floor(fxc - r) - 1;
        const i1 = Math.ceil(fxc + r) + 1;
        const j0 = Math.floor(fyc - r) - 1;
        const j1 = Math.ceil(fyc + r) + 1;
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const dxc = i + 0.5 - fxc;
            const dyc = j + 0.5 - fyc;
            if (dxc * dxc + dyc * dyc > r2) {
              continue;
            }
            want.add(`${i},${j}`);
          }
        }
      }
    }
    for (const k of Array.from(chunkMap.keys())) {
      if (!want.has(k)) {
        removeChunk(k);
      }
    }
    for (const k of want) {
      if (chunkMap.has(k)) {
        continue;
      }
      const [cx, cy] = k.split(",").map((n) => parseInt(n, 10) || 0);
      const dist = st.rendererViewMode === "chunk" ? 0 : Math.max(0, Math.floor(Math.hypot(cx + 0.5 - fxc, cy + 0.5 - fyc) + 1e-9));
      const segments = resolveMeshSegmentsForRing(st, dist);
      const lodLevel = resolveLodLevel(st, dist);
      const sampleCount = (segments + 1) * (segments + 1);
      const heightBuffer = acquireHeightBuffer(sampleCount);
      const ch = {
        cx,
        cy,
        dist,
        segments,
        lodLevel,
        dirty: true,
        debugRgb: lodColorForLevel(lodLevel).clone(),
        triangleCount: 2 * segments * segments,
        sampleCount,
        heightBuffer,
        renderBindGroup: null,
        computeBindGroup: null
      };
      chunkMap.set(k, ch);
    }
  }

  function updateLodOnChunks(st) {
    if (st.rendererViewMode === "chunk") {
      const segs = resolveMeshSegmentsForRing(st, 0);
      for (const ch of chunkMap.values()) {
        ch.lodLevel = 0;
        ch.debugRgb = lodColorForLevel(0);
        if (ch.segments !== segs) {
          releaseHeightBuffer(ch.sampleCount, ch.heightBuffer);
          ch.segments = segs;
          ch.sampleCount = (segs + 1) * (segs + 1);
          ch.heightBuffer = acquireHeightBuffer(ch.sampleCount);
          ch.renderBindGroup = null;
          ch.computeBindGroup = null;
          ch.triangleCount = 2 * segs * segs;
          ch.dirty = true;
        }
      }
      return;
    }
    const { fxc, fyc } = getViewCenterChunkFloat(st);
    for (const ch of chunkMap.values()) {
      const d = Math.max(0, Math.floor(Math.hypot(ch.cx + 0.5 - fxc, ch.cy + 0.5 - fyc) + 1e-9));
      const segments = resolveMeshSegmentsForRing(st, d);
      const lodLevel = resolveLodLevel(st, d);
      ch.debugRgb = lodColorForLevel(lodLevel);
      ch.dist = d;
      ch.lodLevel = lodLevel;
      if (ch.segments !== segments) {
        releaseHeightBuffer(ch.sampleCount, ch.heightBuffer);
        ch.segments = segments;
        ch.sampleCount = (segments + 1) * (segments + 1);
        ch.heightBuffer = acquireHeightBuffer(ch.sampleCount);
        ch.renderBindGroup = null;
        ch.computeBindGroup = null;
        ch.triangleCount = 2 * segments * segments;
        ch.dirty = true;
      }
    }
  }

  function markAllChunksDirty() {
    for (const ch of chunkMap.values()) {
      ch.dirty = true;
    }
  }

  function updateComputeGlobals(st, tSec) {
    if (!device || !globalUniformBuffer) {
      return;
    }
    const so = seedToOffset(st.seed);
    const data = new Float32Array(COMPUTE_GLOBAL_FLOATS);
    data[0] = tSec;
    data[1] = st.seed;
    data[2] = st.meshHeight;
    data[3] = st.heightOffset;
    data[4] = st.offset.x + so.x;
    data[5] = st.offset.y + so.y;
    data[6] = st.offset.z + so.z;
    data[7] = st.sliceZ;
    data[8] = st.animate ? 1 : 0;
    data[9] = st.timeSpeed;
    device.queue.writeBuffer(globalUniformBuffer, 0, data);
  }

  function updateComputeParams(st, graph) {
    if (!device || !paramUniformBuffer || !activeRuntime || !graph || !st.useGraph) {
      return;
    }
    if (activeRuntime.isBiome && graph.biomeProject && paramBiome0Buffer && paramBiome1Buffer && paramBiome2Buffer && biomeUniformBuffer) {
      const bp = graph.biomeProject;
      paramScratch.fill(0);
      fillGraphParamBufferFromSlots(paramScratch, bp.placementGraph, registry, activeRuntime.paramSlotsPl || []);
      device.queue.writeBuffer(paramUniformBuffer, 0, paramScratch);
      const tri = padThreeBiomes(bp.biomes);
      const slots = activeRuntime.paramSlotsBiomes || [];
      /** @type {GPUBuffer[]} */
      const bufs = [paramBiome0Buffer, paramBiome1Buffer, paramBiome2Buffer];
      for (let i = 0; i < 3; i++) {
        paramScratch.fill(0);
        fillGraphParamBufferFromSlots(paramScratch, tri[i].terrainGraph, registry, slots[i] || []);
        device.queue.writeBuffer(bufs[i], 0, paramScratch);
      }
      fillBiomeUniformBuffer(biomeScratch, bp);
      device.queue.writeBuffer(biomeUniformBuffer, 0, biomeScratch);
    } else {
      paramScratch.fill(0);
      fillGraphParamBufferFromSlots(paramScratch, graph, registry, activeRuntime.paramSlots || []);
      device.queue.writeBuffer(paramUniformBuffer, 0, paramScratch);
    }
    lastParamHash = st.graphParamHash || "";
  }

  function updateRenderFrameUniform(st) {
    if (!device || !renderFrameUniformBuffer) {
      return;
    }
    const look = getRenderPresetLook(st.renderPreset);
    camera.updateMatrixWorld(true);
    const viewProj = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).elements;
    const buf = new ArrayBuffer(RENDER_FRAME_BYTES);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);
    f32.set(viewProj, 0);
    f32[16] = look.lightDir[0];
    f32[17] = look.lightDir[1];
    f32[18] = look.lightDir[2];
    f32[19] = look.lightAmbient;
    f32[20] = look.lightDiffuse;
    f32[21] = st.meshHeight;
    f32[22] = st.heightOffset;
    u32[23] = st.debugColorByLod ? 1 : 0;
    let debugFlags = 0;
    if (st.debugShowChunkBorders) {
      debugFlags |= DEBUG_BORDER_FLAG;
    }
    if (st.debugShowDirtyChunks) {
      debugFlags |= DEBUG_DIRTY_FLAG;
    }
    u32[24] = debugFlags;
    f32[25] = 0.02;
    device.queue.writeBuffer(renderFrameUniformBuffer, 0, buf);
  }

  function writeComputeChunkUniform(st, ch) {
    if (!device || !computeChunkUniformBuffer) {
      return;
    }
    const buf = new ArrayBuffer(COMPUTE_CHUNK_BYTES);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);
    f32[0] = ch.cx * st.chunkWorldSize;
    f32[1] = ch.cy * st.chunkWorldSize;
    f32[2] = st.chunkWorldSize;
    u32[3] = ch.segments >>> 0;
    device.queue.writeBuffer(computeChunkUniformBuffer, 0, buf);
  }

  function writeRenderChunkUniform(st, ch, dirtyFlag) {
    if (!device || !renderChunkUniformBuffer) {
      return;
    }
    const buf = new ArrayBuffer(RENDER_CHUNK_BYTES);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);
    f32[0] = ch.cx * st.chunkWorldSize;
    f32[1] = ch.cy * st.chunkWorldSize;
    f32[2] = st.chunkWorldSize;
    u32[3] = ch.segments >>> 0;
    f32[4] = ch.debugRgb.x;
    f32[5] = ch.debugRgb.y;
    f32[6] = ch.debugRgb.z;
    u32[7] = ch.lodLevel >>> 0;
    u32[8] = dirtyFlag ? 1 : 0;
    device.queue.writeBuffer(renderChunkUniformBuffer, 0, buf);
  }

  function ensureChunkBindGroups(ch) {
    if (!device || !renderChunkBindGroupLayout || !renderChunkUniformBuffer || !computeChunkUniformBuffer || !activeRuntime) {
      return;
    }
    if (!ch.heightBuffer) {
      ch.heightBuffer = acquireHeightBuffer(ch.sampleCount);
      ch.renderBindGroup = null;
      ch.computeBindGroup = null;
    }
    if (!ch.heightBuffer) {
      return;
    }
    if (!ch.renderBindGroup) {
      ch.renderBindGroup = device.createBindGroup({
        layout: renderChunkBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: renderChunkUniformBuffer } },
          { binding: 1, resource: { buffer: ch.heightBuffer } }
        ]
      });
    }
    if (!ch.computeBindGroup || ch.computeBindGroupKey !== activeRuntime.key) {
      ch.computeBindGroup = device.createBindGroup({
        layout: activeRuntime.computePipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: computeChunkUniformBuffer } },
          { binding: 1, resource: { buffer: ch.heightBuffer } }
        ]
      });
      ch.computeBindGroupKey = activeRuntime.key;
    }
  }

  async function compileRuntime(key, st, graph) {
    if (!device || !globalUniformBuffer || !paramUniformBuffer || !paramBiome0Buffer || !paramBiome1Buffer || !paramBiome2Buffer || !biomeUniformBuffer) {
      return false;
    }
    if (compileCache.has(key)) {
      activeRuntime = compileCache.get(key);
      viewInfo.graphHash = key;
      viewInfo.shaderPreview = activeRuntime.shaderSource.split("\n").slice(0, 24).join("\n");
      viewInfo.compileStatus = "cache-hit";
      markAllChunksDirty();
      return true;
    }
    viewInfo.compileStatus = "compiling";
    const wantBiome =
      !!(st && st.useBiomes) &&
      graph &&
      graph.biomeProject &&
      graph.biomeProject.placementGraph &&
      graph.biomeProject.biomes &&
      graph.biomeProject.biomes.length > 0;
    let built;
    let isBiome = false;
    if (st?.useGraph && wantBiome) {
      const bTry = buildBiomeTerrainComputeWgsl(graph.biomeProject, registry);
      if (bTry.ok) {
        built = bTry;
        isBiome = true;
      } else if (graph) {
        built = buildTerrainComputeWgsl(graph, registry);
        if (!built.ok) {
          viewInfo.compileErrors = (bTry.errors || [])
            .concat(built.errors || [])
            .map((e) => e.message)
            .join(" | ");
          viewInfo.compileStatus = "compile-error";
          return false;
        }
        isBiome = false;
      } else {
        built = { ok: false, fullWgsl: "", errors: bTry.errors || [] };
        viewInfo.compileErrors = built.errors.map((e) => e.message).join(" | ");
        viewInfo.compileStatus = "compile-error";
        return false;
      }
    } else if (st?.useGraph && graph) {
      built = buildTerrainComputeWgsl(graph, registry);
    } else {
      built = { ok: true, fullWgsl: createFlatComputeWgsl(), paramCount: 0, errors: [], paramSlots: [] };
    }
    if (!built.ok) {
      viewInfo.compileErrors = built.errors.map((e) => e.message).join(" | ");
      viewInfo.compileStatus = "compile-error";
      return false;
    }
    const module = device.createShaderModule({ code: built.fullWgsl, label: `terrain-compute-${key}` });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");
    if (errors.length > 0) {
      viewInfo.compileErrors = errors.map((m) => m.message).join(" | ");
      viewInfo.compileStatus = "compile-error";
      return false;
    }
    const computePipeline = device.createComputePipeline({
      label: `terrain-compute-pipeline-${key}`,
      layout: "auto",
      compute: { module, entryPoint: "main" }
    });
    /** @type {GPUBindGroup} */
    let computeBindGroup0;
    if (isBiome) {
      computeBindGroup0 = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: globalUniformBuffer } },
          { binding: 1, resource: { buffer: paramUniformBuffer } },
          { binding: 2, resource: { buffer: paramBiome0Buffer } },
          { binding: 3, resource: { buffer: paramBiome1Buffer } },
          { binding: 4, resource: { buffer: paramBiome2Buffer } },
          { binding: 5, resource: { buffer: biomeUniformBuffer } }
        ]
      });
    } else {
      computeBindGroup0 = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: globalUniformBuffer } },
          { binding: 1, resource: { buffer: paramUniformBuffer } }
        ]
      });
    }
    activeRuntime = {
      key,
      isBiome,
      shaderSource: built.fullWgsl,
      paramSlots: isBiome ? [] : built.paramSlots || [],
      paramSlotsPl: isBiome ? built.paramSlotsPl : undefined,
      paramSlotsBiomes: isBiome ? built.paramSlotsBiomes : undefined,
      computePipeline,
      computeBindGroup0
    };
    compileCache.set(key, activeRuntime);
    viewInfo.graphHash = key;
    viewInfo.shaderPreview = built.fullWgsl.split("\n").slice(0, 24).join("\n");
    viewInfo.compileErrors = "";
    viewInfo.compileStatus = "ready";
    markAllChunksDirty();
    return true;
  }

  function queueCompile(st, graph) {
    const key = st.useGraph && graph ? terrainGraphCompileSignature(st, graph) : "flat";
    if (key === lastCompileSig || key === pendingCompileSig) {
      return;
    }
    pendingCompileSig = key;
    pendingCompileDueAt = performance.now() + (activeRuntime ? st.graphCompileDebounceMs | 0 : 0);
  }

  function maybeStartCompile(st, graph) {
    if (!device || compilePromise || !pendingCompileSig || performance.now() < pendingCompileDueAt) {
      return;
    }
    const key = pendingCompileSig;
    pendingCompileSig = "";
    compilePromise = compileRuntime(key, st, st.useGraph ? graph : null)
      .then((ok) => {
        if (ok) {
          lastCompileSig = key;
        }
      })
      .finally(() => {
        compilePromise = null;
      });
  }

  function drawFrame(st, dirtyBudget) {
    if (!device || !context || !depthTexture || !renderPipeline || !renderFrameBindGroup || !activeRuntime) {
      return;
    }
    const dirtyChunks = [...chunkMap.values()].filter((ch) => ch.dirty).sort((a, b) => a.dist - b.dist);
    const encoder = device.createCommandEncoder({ label: "terrain-frame" });
    const t0 = performance.now();
    if (dirtyChunks.length > 0) {
      const pass = encoder.beginComputePass({ label: "terrain-heights" });
      pass.setPipeline(activeRuntime.computePipeline);
      pass.setBindGroup(0, activeRuntime.computeBindGroup0);
      let rebuilt = 0;
      for (const ch of dirtyChunks) {
        if (rebuilt >= dirtyBudget) {
          break;
        }
        ensureChunkBindGroups(ch);
        if (!ch.computeBindGroup) {
          continue;
        }
        writeComputeChunkUniform(st, ch);
        pass.setBindGroup(1, ch.computeBindGroup);
        const sampleW = ch.segments + 1;
        pass.dispatchWorkgroups(Math.ceil(sampleW / 8), Math.ceil(sampleW / 8));
        ch.dirty = false;
        rebuilt += 1;
      }
      pass.end();
    }
    const colorView = context.getCurrentTexture().createView();
    const renderPass = encoder.beginRenderPass({
      label: "terrain-render",
      colorAttachments: [
        {
          view: colorView,
          clearValue: { r: 0.09, g: 0.11, b: 0.14, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store"
      }
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderFrameBindGroup);
    for (const ch of chunkMap.values()) {
      ensureChunkBindGroups(ch);
      const grid = getGridTemplate(ch.segments);
      if (!grid || !ch.renderBindGroup) {
        continue;
      }
      writeRenderChunkUniform(st, ch, ch.dirty);
      renderPass.setBindGroup(1, ch.renderBindGroup);
      renderPass.setVertexBuffer(0, grid.vertexBuffer);
      renderPass.setIndexBuffer(grid.indexBuffer, "uint32");
      renderPass.drawIndexed(grid.indexCount, 1, 0, 0, 0);
    }
    renderPass.end();
    device.queue.submit([encoder.finish()]);
    lastGpuTimingMs = performance.now() - t0;
  }

  function renderFrame() {
    const st = { ...getState() };
    validateAndNormalize(st);
    const graph = getNoiseGraph();
    if (initError) {
      viewInfo.backend = "webgpu-failed";
      viewInfo.compileStatus = initError;
      return;
    }
    resizeSurface();
    applyCameraFromViewMode(camera, st);
    queueCompile(st, graph);
    maybeStartCompile(st, graph);
    syncRing(st);
    updateLodOnChunks(st);

    const chunkContentSig = terrainChunkContentSignature(st, graph);
    if (chunkContentSig !== lastChunkContentSig) {
      lastChunkContentSig = chunkContentSig;
      markAllChunksDirty();
    }

    if (activeRuntime) {
      const tSec = performance.now() * 0.001;
      updateComputeGlobals(st, tSec);
      if ((st.graphParamHash || "") !== lastParamHash || st.graphLastEditKind === "topology") {
        updateComputeParams(st, graph);
      }
      updateRenderFrameUniform(st);
      drawFrame(st, Math.max(1, Math.min(32, st.maxChunkRebuildsPerFrame | 0)));
    }

    const c0 = getCenterChunkCoord(st);
    const vc = getViewCenterWorldXY(st);
    let tris = 0;
    let dirtyCount = 0;
    for (const ch of chunkMap.values()) {
      tris += ch.triangleCount;
      if (ch.dirty) {
        dirtyCount += 1;
      }
    }
    viewInfo.segments = st.defaultChunkResolution | 0;
    viewInfo.triangleCount = tris;
    viewInfo.activeChunkCount = chunkMap.size;
    viewInfo.dirtyChunkCount = dirtyCount;
    viewInfo.centerChunk = st.rendererViewMode === "chunk" ? "0,0" : `${c0.cx},${c0.cy}`;
    viewInfo.viewMode = st.rendererViewMode;
    viewInfo.flyPos = st.flyCamera
      ? `(${st.flyCamera.x.toFixed(1)},${st.flyCamera.y.toFixed(1)},${st.flyCamera.z.toFixed(1)})`
      : "—";
    viewInfo.cameraLabel = `view (${vc.x.toFixed(1)},${vc.y.toFixed(1)}) mode=${st.rendererViewMode}`;
    viewInfo.gpuGenMs = lastGpuTimingMs;
    if (!viewInfo.graphHash) {
      viewInfo.graphHash = st.graphTopologyHash || "flat";
    }
  }

  return {
    renderFrame,
    getLastBakeStats: () => null,
    viewInfo,
    dispose() {
      initPromise.catch(() => {});
      for (const ch of chunkMap.values()) {
        releaseHeightBuffer(ch.sampleCount, ch.heightBuffer);
      }
      chunkMap.clear();
      for (const pool of heightBufferPool.values()) {
        for (const buf of pool) {
          buf.destroy();
        }
      }
      for (const grid of gridCache.values()) {
        grid.vertexBuffer.destroy();
        grid.indexBuffer.destroy();
      }
      if (depthTexture) {
        depthTexture.destroy();
      }
      globalUniformBuffer?.destroy();
      paramUniformBuffer?.destroy();
      paramBiome0Buffer?.destroy();
      paramBiome1Buffer?.destroy();
      paramBiome2Buffer?.destroy();
      biomeUniformBuffer?.destroy();
      computeChunkUniformBuffer?.destroy();
      renderFrameUniformBuffer?.destroy();
      renderChunkUniformBuffer?.destroy();
    }
  };
}
