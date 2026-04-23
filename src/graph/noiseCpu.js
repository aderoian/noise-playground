import { makeNoise2D, makeNoise3D } from "open-simplex-noise";

/** @type {Map<number, (x: number, y: number) => number>} */
const _simplex2DCache = new Map();
/** @type {Map<number, (x: number, y: number, z: number) => number>} */
const _simplex3DCache = new Map();

/** @param {number} n */
function fract(n) {
  return n - Math.floor(n);
}

/** @param {number} t */
function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** @param {number} x */
function hash1(x) {
  const n = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return fract(n);
}

/**
 * White noise [-1, 1] approximately
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} seed
 */
export function whiteNoise(x, y, z, seed) {
  const h = hash1(x * 19.2 + y * 47.11 + z * 13.7 + seed * 0.001);
  return h * 2 - 1;
}

/**
 * Value noise 2D in plane, z shifts phase
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} seed
 */
export function valueNoise2D(x, y, z, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const zs = z * 0.01 + seed * 0.001;
  const a = hash1(xi + yi * 57.0 + zs);
  const b = hash1(xi + 1 + yi * 57.0 + zs);
  const c = hash1(xi + (yi + 1) * 57.0 + zs);
  const d = hash1(xi + 1 + (yi + 1) * 57.0 + zs);
  const l1 = a + (b - a) * u;
  const l2 = c + (d - c) * u;
  const m = l1 + (l2 - l1) * v;
  return m * 2 - 1;
}

function grad2(ix, iy, seed) {
  const a = hash1(ix * 12.9898 + iy * 78.233 + seed);
  const ang = a * Math.PI * 2;
  return { gx: Math.cos(ang), gy: Math.sin(ang) };
}

/**
 * Perlin-like gradient noise 2D
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} seed
 */
export function perlinNoise2D(x, y, z, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const g00 = grad2(xi, yi, seed + z * 0.01);
  const g10 = grad2(xi + 1, yi, seed + z * 0.01);
  const g01 = grad2(xi, yi + 1, seed + z * 0.01);
  const g11 = grad2(xi + 1, yi + 1, seed + z * 0.01);
  const n00 = g00.gx * xf + g00.gy * yf;
  const n10 = g10.gx * (xf - 1) + g10.gy * yf;
  const n01 = g01.gx * xf + g01.gy * (yf - 1);
  const n11 = g11.gx * (xf - 1) + g11.gy * (yf - 1);
  const ix0 = n00 + u * (n10 - n00);
  const ix1 = n01 + u * (n11 - n01);
  return ix0 + v * (ix1 - ix0);
}

/**
 * @param {number} seed
 * @returns {(x: number, y: number) => number}
 */
export function makeSimplex2D(seed) {
  const k = seed | 0;
  let fn = _simplex2DCache.get(k);
  if (!fn) {
    fn = makeNoise2D(k);
    _simplex2DCache.set(k, fn);
  }
  return fn;
}

/**
 * @param {number} seed
 * @returns {(x: number, y: number, z: number) => number}
 */
export function makeSimplex3D(seed) {
  const k = seed | 0;
  let fn = _simplex3DCache.get(k);
  if (!fn) {
    fn = makeNoise3D(k);
    _simplex3DCache.set(k, fn);
  }
  return fn;
}

/**
 * Worley / cellular F1, F2, F2-F1 in 2D
 * @param {number} x
 * @param {number} y
 * @param {number} jitter
 * @param {number} metric 0 euclid 1 manhattan 2 chebyshev
 * @param {number} ret 0 f1 1 f2 2 f2-f1
 */
export function worley2D(x, y, jitter, metric, ret) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 1e9;
  let f2 = 1e9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const rx = hash1(cx * 7.13 + cy * 3.41) - 0.5;
      const ry = hash1(cx * 11.7 + cy * 9.23) - 0.5;
      const px = cx + jitter * rx;
      const py = cy + jitter * ry;
      let d;
      const wx = x - px;
      const wy = y - py;
      if (metric === 1) {
        d = Math.abs(wx) + Math.abs(wy);
      } else if (metric === 2) {
        d = Math.max(Math.abs(wx), Math.abs(wy));
      } else {
        d = Math.hypot(wx, wy);
      }
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  if (ret === 1) {
    return f2;
  }
  if (ret === 2) {
    return f2 - f1;
  }
  return f1;
}

/**
 * @param {string} kind value|perlin|simplex2|os2|white|worley
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {number} seed
 * @param {{ jitter?: number, cellMetric?: number, cellReturn?: number }} [cell]
 */
export function sampleBase(kind, px, py, pz, seed, cell) {
  const j = cell?.jitter ?? 0.5;
  const cm = cell?.cellMetric ?? 0;
  const cr = cell?.cellReturn ?? 0;
  switch (kind) {
    case "white":
      return whiteNoise(px, py, pz, seed);
    case "value":
      return valueNoise2D(px, py, pz, seed);
    case "perlin":
      return perlinNoise2D(px, py, pz, seed);
    case "simplex2": {
      const n = makeSimplex2D(seed);
      return n(px, py);
    }
    case "os2": {
      const n = makeSimplex2D(seed + 999);
      return n(px * 1.1, py * 1.1);
    }
    case "worley":
      return worley2D(px, py, j, cm, cr);
    default:
      return makeSimplex2D(seed)(px, py);
  }
}

/**
 * @param {string} kind
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {number} seed
 * @param {object} o
 * @param {"none"|"fbm"|"billow"|"ridged"|"turbulence"} o.fractal
 * @param {number} o.octaves
 * @param {number} o.lacunarity
 * @param {number} o.gain
 * @param {{ jitter?: number, cellMetric?: number, cellReturn?: number }} [o.cell]
 */
export function sampleFractal(kind, px, py, pz, seed, o) {
  const { fractal, octaves, lacunarity, gain, cell } = o;
  const base = () => sampleBase(kind, px, py, pz, seed, cell);
  if (fractal === "none") {
    return base();
  }
  let sum = 0;
  let norm = 0;
  let f = 1;
  let a = 1;
  const ocount = Math.max(1, Math.min(8, Math.floor(octaves)));
  for (let i = 0; i < ocount; i++) {
    const nx = px * f;
    const ny = py * f;
    const nz = pz * f;
    let n = sampleBase(kind, nx, ny, nz, seed + i * 31, cell);
    if (fractal === "billow") {
      n = Math.abs(n);
    } else if (fractal === "turbulence") {
      n = Math.abs(n);
    } else if (fractal === "ridged") {
      n = 1 - Math.abs(n);
      n = n * n;
    }
    sum += a * n;
    norm += a;
    f *= lacunarity;
    a *= gain;
  }
  let v = norm > 1e-6 ? sum / norm : 0;
  if (fractal === "turbulence") {
    v = v; // already used abs per octave
  }
  return v;
}
