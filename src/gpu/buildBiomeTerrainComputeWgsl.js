import { buildHeightFunctionWgsl } from "./graphCompilerWgsl.js";
import { WGSL_NOISE_LIB } from "./wgslNoiseLib.js";
import { hexToRgb01 } from "../render/terrain/biomeWeights.js";

export const MAX_GPU_BIOMES = 3;

/** @type {import("../graph/types.js").BiomeDef[]} */
export function padThreeBiomes(/** @type {import("../graph/types.js").BiomeDef[]} */ bs) {
  if (bs.length === 0) {
    return bs;
  }
  const o = bs.slice();
  while (o.length < MAX_GPU_BIOMES) {
    o.push(o[o.length - 1]);
  }
  return o.slice(0, MAX_GPU_BIOMES);
}

/**
 * @param {import("../graph/types.js").BiomeProject} bp
 * @param {import("../graph/registry.js").NodeRegistry} registry
 */
export function buildBiomeTerrainComputeWgsl(bp, registry) {
  if (!bp || !bp.placementGraph || !bp.biomes?.length) {
    return {
      ok: false,
      fullWgsl: "",
      paramSlotsPl: [],
      paramSlotsBiomes: [],
      errors: [{ message: "Invalid biome project" }]
    };
  }
  if (bp.biomes.length > MAX_GPU_BIOMES) {
    return {
      ok: false,
      fullWgsl: "",
      paramSlotsPl: [],
      paramSlotsBiomes: [],
      errors: [{ message: `Max ${MAX_GPU_BIOMES} biomes for WebGPU` }]
    };
  }
  const triBiomes = padThreeBiomes(bp.biomes);
  const pl = buildHeightFunctionWgsl(bp.placementGraph, registry, {
    fnName: "eval_pl",
    paramName: "g_params_pl",
    returnMeshScaled: false,
    placementMode: true
  });
  if (!pl.ok) {
    return { ok: false, fullWgsl: "", paramSlotsPl: [], paramSlotsBiomes: [], errors: pl.errors };
  }
  /** @type {import("./graphCompilerWgsl.js").ParamSlot[][]} */
  const biomeSlots = [];
  /** @type {string[]} */
  const terrFns = [];
  for (let i = 0; i < MAX_GPU_BIOMES; i++) {
    const t = buildHeightFunctionWgsl(triBiomes[i].terrainGraph, registry, {
      fnName: `eval_b${i}`,
      paramName: `g_params_b${i}`,
      returnMeshScaled: false,
      placementMode: false
    });
    if (!t.ok) {
      return { ok: false, fullWgsl: "", paramSlotsPl: [], paramSlotsBiomes: [], errors: t.errors };
    }
    terrFns.push(t.wgsl);
    biomeSlots.push(t.paramSlots);
  }
  const head = `struct GlobalU {
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
@group(0) @binding(0) var<uniform> g_global: GlobalU;
@group(0) @binding(1) var<uniform> g_params_pl: ParamsU;
@group(0) @binding(2) var<uniform> g_params_b0: ParamsU;
@group(0) @binding(3) var<uniform> g_params_b1: ParamsU;
@group(0) @binding(4) var<uniform> g_params_b2: ParamsU;
struct BiomeU {
  d: array<vec4<f32>, 8>,
}
@group(0) @binding(5) var<uniform> g_biome: BiomeU;
`;
  const util = `
fn bget(bi: u32) -> f32 {
  let v = g_biome.d[bi / 4u];
  let r = bi & 3u;
  if (r == 0u) { return v.x; }
  if (r == 1u) { return v.y; }
  if (r == 2u) { return v.z; }
  return v.w;
}
fn bscale() -> f32 { return bget(0u); }
fn bseed() -> f32 { return bget(1u); }
fn bcontrast() -> f32 { return bget(3u); }
fn bblendw() -> f32 { return bget(4u); }
fn bindexed() -> f32 { return bget(6u); }
fn bn() -> u32 { return u32(bget(7u)); }
fn c0() -> vec3<f32> { return vec3f(bget(8u), bget(9u), bget(10u)); }
fn c1() -> vec3<f32> { return vec3f(bget(11u), bget(12u), bget(13u)); }
fn c2() -> vec3<f32> { return vec3f(bget(14u), bget(15u), bget(16u)); }
fn r0() -> vec2<f32> { return vec2f(bget(17u), bget(18u)); }
fn r1() -> vec2<f32> { return vec2f(bget(19u), bget(20u)); }
fn r2() -> vec2<f32> { return vec2f(bget(21u), bget(22u)); }
fn wgt() -> vec3<f32> { return vec3f(bget(23u), bget(24u), bget(25u)); }
fn hs0() -> f32 { return bget(26u); }
fn ho0() -> f32 { return bget(27u); }
fn hs1() -> f32 { return bget(28u); }
fn ho1() -> f32 { return bget(29u); }
fn hs2() -> f32 { return bget(30u); }
fn ho2() -> f32 { return bget(31u); }
fn apply_contrast(t: f32) -> f32 {
  let c = clamp(bcontrast(), 0.1, 8.0);
  let d = t - 0.5;
  return clamp(0.0, 1.0, 0.5 + d * c);
}
fn w_soft(u: f32, lo: f32, hi: f32, half_bw: f32) -> f32 {
  let bw = max(1e-4, half_bw);
  let a0 = lo - bw;
  let a1 = lo + bw;
  let b0 = hi - bw;
  let b1 = hi + bw;
  if (u <= a0 || u >= b1) { return 0.0; }
  if (u >= a1 && u <= b0) { return 1.0; }
  if (u < a1) {
    let x = clamp(0.0, 1.0, (u - a0) / max(1e-5, a1 - a0));
    return x * x * (3.0 - 2.0 * x);
  }
  let x2 = clamp(0.0, 1.0, (u - b0) / max(1e-5, b1 - b0));
  return 1.0 - x2 * x2 * (3.0 - 2.0 * x2);
}
fn biome_weights(tu: f32) -> vec3<f32> {
  let h = max(0.0, bblendw()) * 0.5;
  var w0 = 0.0;
  var w1 = 0.0;
  var w2 = 0.0;
  if (bindexed() > 0.5) {
    w0 = w_soft(tu, r0().x, r0().y, h);
    w1 = w_soft(tu, r1().x, r1().y, h);
    w2 = w_soft(tu, r2().x, r2().y, h);
  } else {
    let s = max(1e-5, wgt().x + wgt().y + wgt().z);
    let e0 = 0.0;
    let e1 = wgt().x / s;
    let e2 = e1 + wgt().y / s;
    w0 = w_soft(tu, e0, e1, h);
    w1 = w_soft(tu, e1, e2, h);
    w2 = w_soft(tu, e2, 1.0, h);
  }
  let su = w0 + w1 + w2;
  if (su < 1e-5) { return vec3f(0.0, 0.0, 1.0); }
  return vec3f(w0, w1, w2) / su;
}
`;
  const heightHelpers = `
fn eval_b_height(i: u32, wx: f32, wy: f32) -> f32 {
  if (i == 0u) { return eval_b0(wx, wy) * hs0() + ho0(); }
  if (i == 1u) { return eval_b1(wx, wy) * hs1() + ho1(); }
  return eval_b2(wx, wy) * hs2() + ho2();
}
fn eval_biome_combined(world_x: f32, world_y: f32) -> vec4<f32> {
  let pr = eval_pl(world_x, world_y);
  let u = apply_contrast(pr * 0.5 + 0.5);
  if (bn() <= 1u) {
    let h0 = eval_b0(world_x, world_y) * hs0() + ho0();
    let hf = h0 * g_global.amp_mesh + g_global.height_off;
    let cc = c0();
    return vec4f(cc.x, cc.y, cc.z, hf);
  }
  let ww = biome_weights(u);
  let hacc = ww.x * eval_b_height(0u, world_x, world_y) + ww.y * eval_b_height(1u, world_x, world_y) + ww.z * eval_b_height(2u, world_x, world_y);
  let col = ww.x * c0() + ww.y * c1() + ww.z * c2();
  let hf = hacc * g_global.amp_mesh + g_global.height_off;
  return vec4f(col.x, col.y, col.z, hf);
}
`;
  const fullWgsl = `${WGSL_NOISE_LIB}
${head}
${util}
${pl.wgsl}
${terrFns.join("\n")}
${heightHelpers}
struct ChunkU {
  origin_x: f32,
  origin_y: f32,
  world_size: f32,
  segments: u32,
};
@group(1) @binding(0) var<uniform> g_chunk: ChunkU;
@group(1) @binding(1) var<storage, read_write> g_terrain: array<vec4<f32>>;

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
  g_terrain[idx] = eval_biome_combined(wx, wy);
}
`;
  return {
    ok: true,
    fullWgsl,
    paramSlotsPl: pl.paramSlots,
    paramSlotsBiomes: biomeSlots,
    errors: [],
    biomeCount: bp.biomes.length
  };
}

/**
 * @param {Float32Array} dst length >= 32
 * @param {import("../graph/types.js").BiomeProject} bp
 */
export function fillBiomeUniformBuffer(dst, bp) {
  const b = bp.biomes;
  const c0 = hexToRgb01(b[0].colorHex);
  const c1 = b[1] ? hexToRgb01(b[1].colorHex) : c0;
  const c2 = b[2] ? hexToRgb01(b[2].colorHex) : c0;
  /** @type {number[]} */
  const a = [
    bp.placementScale,
    bp.placementSeed,
    bp.globalSeed,
    bp.contrast,
    bp.blendWidth,
    bp.blendHardness,
    bp.selectionMode === "indexed" ? 1 : 0,
    b.length,
    c0.r,
    c0.g,
    c0.b,
    c1.r,
    c1.g,
    c1.b,
    c2.r,
    c2.g,
    c2.b,
    b[0].rangeStart,
    b[0].rangeEnd,
    b[1] ? b[1].rangeStart : 0,
    b[1] ? b[1].rangeEnd : 1,
    b[2] ? b[2].rangeStart : 0,
    b[2] ? b[2].rangeEnd : 1,
    b[0].weight,
    b[1] ? b[1].weight : 0,
    b[2] ? b[2].weight : 0,
    b[0].heightScale,
    b[0].heightOffset,
    b[1] ? b[1].heightScale : 1,
    b[1] ? b[1].heightOffset : 0,
    b[2] ? b[2].heightScale : 1,
    b[2] ? b[2].heightOffset : 0
  ];
  for (let i = 0; i < 32; i++) {
    dst[i] = a[i] ?? 0;
  }
}
