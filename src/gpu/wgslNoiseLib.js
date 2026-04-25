/**
 * Shared WGSL noise helpers (ported from `src/graph/noiseCpu.js` logic).
 * Prepended once per generated shader module.
 */
export const WGSL_NOISE_LIB = `
fn np_fract(x: f32) -> f32 { return x - floor(x); }

fn np_smoothstep_f32(t: f32) -> f32 {
  let x = clamp(t, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

fn np_hash1(x: f32) -> f32 {
  return np_fract(sin(x * 127.1 + 311.7) * 43758.5453);
}

fn np_white(px: f32, py: f32, pz: f32, seed: f32) -> f32 {
  let h = np_hash1(px * 19.2 + py * 47.11 + pz * 13.7 + seed * 0.001);
  return h * 2.0 - 1.0;
}

fn np_value(px: f32, py: f32, pz: f32, seed: f32) -> f32 {
  let xi = i32(floor(px));
  let yi = i32(floor(py));
  let xf = px - f32(xi);
  let yf = py - f32(yi);
  let u = np_smoothstep_f32(xf);
  let v = np_smoothstep_f32(yf);
  let zs = pz * 0.01 + seed * 0.001;
  let a = np_hash1(f32(xi) + f32(yi) * 57.0 + zs);
  let b = np_hash1(f32(xi + 1) + f32(yi) * 57.0 + zs);
  let c = np_hash1(f32(xi) + f32(yi + 1) * 57.0 + zs);
  let d = np_hash1(f32(xi + 1) + f32(yi + 1) * 57.0 + zs);
  let l1 = a + (b - a) * u;
  let l2 = c + (d - c) * u;
  let m = l1 + (l2 - l1) * v;
  return m * 2.0 - 1.0;
}

fn np_grad2(ix: i32, iy: i32, seed: f32) -> vec2f {
  let a = np_hash1(f32(ix) * 12.9898 + f32(iy) * 78.233 + seed);
  let ang = a * 6.28318530718;
  return vec2f(cos(ang), sin(ang));
}

fn np_perlin(px: f32, py: f32, pz: f32, seed: f32) -> f32 {
  let xi = i32(floor(px));
  let yi = i32(floor(py));
  let xf = px - f32(xi);
  let yf = py - f32(yi);
  let u = np_smoothstep_f32(xf);
  let v = np_smoothstep_f32(yf);
  let g00 = np_grad2(xi, yi, seed + pz * 0.01);
  let g10 = np_grad2(xi + 1, yi, seed + pz * 0.01);
  let g01 = np_grad2(xi, yi + 1, seed + pz * 0.01);
  let g11 = np_grad2(xi + 1, yi + 1, seed + pz * 0.01);
  let n00 = g00.x * xf + g00.y * yf;
  let n10 = g10.x * (xf - 1.0) + g10.y * yf;
  let n01 = g01.x * xf + g01.y * (yf - 1.0);
  let n11 = g11.x * (xf - 1.0) + g11.y * (yf - 1.0);
  let ix0 = n00 + u * (n10 - n00);
  let ix1 = n01 + u * (n11 - n01);
  return ix0 + v * (ix1 - ix0);
}

fn np_simplex2(px: f32, py: f32, seed: f32) -> f32 {
  return np_perlin(px + seed * 0.00017, py - seed * 0.00013, seed * 0.0001, seed);
}

fn np_os2(px: f32, py: f32, seed: f32) -> f32 {
  return np_simplex2(px * 1.1, py * 1.1, seed + 999.0);
}

fn np_worley(px: f32, py: f32, jitter: f32, metric: i32, ret: i32) -> f32 {
  let xi = i32(floor(px));
  let yi = i32(floor(py));
  var f1 = 1e9;
  var f2 = 1e9;
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      let cx = xi + dx;
      let cy = yi + dy;
      let rx = np_hash1(f32(cx) * 7.13 + f32(cy) * 3.41) - 0.5;
      let ry = np_hash1(f32(cx) * 11.7 + f32(cy) * 9.23) - 0.5;
      let pxf = f32(cx) + jitter * rx;
      let pyf = f32(cy) + jitter * ry;
      let wx = px - pxf;
      let wy = py - pyf;
      var d: f32;
      if (metric == 1) {
        d = abs(wx) + abs(wy);
      } else if (metric == 2) {
        d = max(abs(wx), abs(wy));
      } else {
        d = sqrt(wx * wx + wy * wy);
      }
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  if (ret == 1) { return f2; }
  if (ret == 2) { return f2 - f1; }
  return f1;
}

fn np_base(kind: i32, px: f32, py: f32, pz: f32, seed: f32, jitter: f32, cm: i32, cr: i32) -> f32 {
  if (kind == 0) { return np_white(px, py, pz, seed); }
  if (kind == 1) { return np_value(px, py, pz, seed); }
  if (kind == 2) { return np_perlin(px, py, pz, seed); }
  if (kind == 3) { return np_simplex2(px, py, seed); }
  if (kind == 4) { return np_os2(px, py, seed); }
  return np_worley(px, py, jitter, cm, cr);
}

fn np_fractal(
  fractal: i32,
  kind: i32,
  px: f32,
  py: f32,
  pz: f32,
  seed: f32,
  octaves: i32,
  lac: f32,
  gain: f32,
  jitter: f32,
  cm: i32,
  cr: i32
) -> f32 {
  var sum = 0.0;
  var norm = 0.0;
  var f = 1.0;
  var a = 1.0;
  let ocount = clamp(octaves, 1, 8);
  for (var i: i32 = 0; i < ocount; i = i + 1) {
    let nx = px * f;
    let ny = py * f;
    let nz = pz * f;
    var n = np_base(kind, nx, ny, nz, seed + f32(i) * 31.0, jitter, cm, cr);
    if (fractal == 2 || fractal == 4) {
      n = abs(n);
    } else if (fractal == 3) {
      n = 1.0 - abs(n);
      n = n * n;
    }
    sum += a * n;
    norm += a;
    f *= lac;
    a *= gain;
  }
  if (norm < 1e-6) { return 0.0; }
  return sum / norm;
}
`;
