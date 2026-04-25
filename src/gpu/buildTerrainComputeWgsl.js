import { buildHeightShaderWgsl } from "./graphCompilerWgsl.js";

/**
 * @param {import("../graph/types.js").NoiseGraph} graph
 * @param {import("../graph/registry.js").NodeRegistry} registry
 */
export function buildTerrainComputeWgsl(graph, registry) {
  const compiled = buildHeightShaderWgsl(graph, registry);
  if (!compiled.ok) {
    return {
      ok: false,
      fullWgsl: "",
      paramCount: compiled.paramCount,
      errors: compiled.errors,
      paramSlots: compiled.paramSlots
    };
  }
  const fullWgsl = `${compiled.fullWgsl}
struct ChunkU {
  origin_x: f32,
  origin_y: f32,
  world_size: f32,
  segments: u32,
};
@group(1) @binding(0) var<uniform> g_chunk: ChunkU;
@group(1) @binding(1) var<storage, read_write> g_heights: array<f32>;

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
  g_heights[idx] = eval_graph_height(wx, wy);
}
`;
  return {
    ok: true,
    fullWgsl,
    paramCount: compiled.paramCount,
    errors: compiled.errors,
    paramSlots: compiled.paramSlots
  };
}
