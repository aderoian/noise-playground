export const TERRAIN_RENDER_WGSL = `
struct FrameU {
  view_proj: mat4x4<f32>,
  light_dir: vec3<f32>,
  light_ambient: f32,
  light_diffuse: f32,
  mesh_height: f32,
  height_offset: f32,
  color_mode: u32,
  debug_flags: u32,
  edge_thickness: f32,
  pad0: vec3<f32>,
};

struct ChunkU {
  origin_x: f32,
  origin_y: f32,
  world_size: f32,
  segments: u32,
  debug_rgb: vec3<f32>,
  lod_level: u32,
  dirty_flag: u32,
  pad1: vec3<u32>,
};

@group(0) @binding(0) var<uniform> g_frame: FrameU;
@group(1) @binding(0) var<uniform> g_chunk: ChunkU;
@group(1) @binding(1) var<storage, read> g_heights: array<f32>;

struct VsIn {
  @location(0) uv: vec2<f32>,
};

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) h_raw: f32,
  @location(1) normal_w: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) debug_rgb: vec3<f32>,
  @location(4) dirty_flag: f32,
};

fn sample_idx(ix: i32, iy: i32, sample_w: i32) -> i32 {
  let x = clamp(ix, 0, sample_w - 1);
  let y = clamp(iy, 0, sample_w - 1);
  return y * sample_w + x;
}

fn load_height(ix: i32, iy: i32, sample_w: i32) -> f32 {
  return g_heights[u32(sample_idx(ix, iy, sample_w))];
}

fn display_scalar_from_noise(v: f32) -> f32 {
  return clamp(v * 0.5 + 0.5, 0.0, 1.0);
}

fn ramp_color(t: f32) -> vec3<f32> {
  let x = clamp(t, 0.0, 1.0);
  let water = vec3<f32>(0.08, 0.18, 0.35);
  let grass = vec3<f32>(0.16, 0.44, 0.18);
  let dirt = vec3<f32>(0.48, 0.38, 0.22);
  let rock = vec3<f32>(0.62, 0.62, 0.64);
  let snow = vec3<f32>(0.95, 0.96, 0.98);
  if (x < 0.3) {
    return mix(water, grass, x / 0.3);
  }
  if (x < 0.55) {
    return mix(grass, dirt, (x - 0.3) / 0.25);
  }
  if (x < 0.82) {
    return mix(dirt, rock, (x - 0.55) / 0.27);
  }
  return mix(rock, snow, (x - 0.82) / 0.18);
}

@vertex
fn vs_main(in: VsIn) -> VsOut {
  let sample_w = i32(g_chunk.segments) + 1;
  let steps = max(f32(g_chunk.segments), 1.0);
  let fx = clamp(in.uv.x, 0.0, 1.0) * steps;
  let fy = clamp(in.uv.y, 0.0, 1.0) * steps;
  let ix = i32(round(fx));
  let iy = i32(round(fy));
  let h = load_height(ix, iy, sample_w);
  let cell = g_chunk.world_size / steps;
  let hx1 = load_height(ix + 1, iy, sample_w);
  let hx0 = load_height(ix - 1, iy, sample_w);
  let hy1 = load_height(ix, iy + 1, sample_w);
  let hy0 = load_height(ix, iy - 1, sample_w);
  let dhx = (hx1 - hx0) / max(cell * 2.0, 1e-5);
  let dhy = (hy1 - hy0) / max(cell * 2.0, 1e-5);
  let n = normalize(vec3<f32>(-dhx, -dhy, 1.0));
  let wx = g_chunk.origin_x + in.uv.x * g_chunk.world_size;
  let wy = g_chunk.origin_y + in.uv.y * g_chunk.world_size;
  let world = vec4<f32>(wx, wy, h, 1.0);
  var out: VsOut;
  out.position = g_frame.view_proj * world;
  out.h_raw = select(0.0, (h - g_frame.height_offset) / max(g_frame.mesh_height, 1e-5), g_frame.mesh_height > 1e-5);
  out.normal_w = n;
  out.uv = in.uv;
  out.debug_rgb = g_chunk.debug_rgb;
  out.dirty_flag = f32(g_chunk.dirty_flag);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let n_w = normalize(in.normal_w);
  let L = normalize(g_frame.light_dir);
  let diff = g_frame.light_ambient + g_frame.light_diffuse * max(dot(n_w, L), 0.0);
  var albedo = ramp_color(display_scalar_from_noise(in.h_raw));
  if (g_frame.color_mode == 1u) {
    albedo = in.debug_rgb;
  }
  if ((g_frame.debug_flags & 2u) != 0u && in.dirty_flag > 0.5) {
    albedo = vec3<f32>(1.0, 0.25, 0.15);
  }
  if ((g_frame.debug_flags & 1u) != 0u) {
    let edge = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
    if (edge < g_frame.edge_thickness) {
      albedo = vec3<f32>(1.0, 0.82, 0.1);
    }
  }
  return vec4<f32>(albedo * diff, 1.0);
}
`;
