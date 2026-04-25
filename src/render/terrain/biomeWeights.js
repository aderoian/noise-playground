/**
 * @param {number} t
 * @param {number} e0
 * @param {number} e1
 * @returns {number}
 */
function smoothstep(t, e0, e1) {
  if (e1 === e0) {
    return 0;
  }
  const x = Math.max(0, Math.min(1, (t - e0) / (e1 - e0)));
  return x * x * (3 - 2 * x);
}

/**
 * @param {number} u
 * @param {number} lo
 * @param {number} hi
 * @param {number} halfBlend
 * @returns {number}
 */
function softIntervalWeight(u, lo, hi, halfBlend) {
  const bw = Math.max(1e-8, halfBlend);
  const a0 = lo - bw;
  const a1 = lo + bw;
  const b0 = hi - bw;
  const b1 = hi + bw;
  if (u <= a0 || u >= b1) {
    return 0;
  }
  if (u >= a1 && u <= b0) {
    return 1;
  }
  if (u < a1) {
    return smoothstep(u, a0, a1);
  }
  return 1 - smoothstep(u, b0, b1);
}

/**
 * @param {number} u
 * @param {import("../../graph/types.js").BiomeProject} bp
 * @returns {Float32Array}
 */
export function computeBiomeWeights(u, bp) {
  const n = bp.biomes.length;
  const w = new Float32Array(n);
  if (n === 0) {
    return w;
  }
  const uu = Math.max(0, Math.min(1, u));
  const halfBlend = Math.max(0, Math.min(0.49, (bp.blendWidth || 0) * 0.5));
  const hardness = Math.max(0.1, Math.min(8, bp.blendHardness || 1));

  if (bp.selectionMode === "weighted") {
    const weights = bp.biomes.map((b) => Math.max(1e-8, b.weight));
    const s = weights.reduce((a, b) => a + b, 0);
    let c = 0;
    const edges = [0];
    for (const wi of weights) {
      c += wi / s;
      edges.push(c);
    }
    for (let i = 0; i < n; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      let m = softIntervalWeight(uu, lo, hi, halfBlend);
      m = Math.pow(m, 1 / hardness);
      w[i] = m;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const b = bp.biomes[i];
      const lo = Math.max(0, Math.min(1, b.rangeStart));
      const hi = Math.max(0, Math.min(1, b.rangeEnd));
      if (hi < lo) {
        w[i] = 0;
        continue;
      }
      const hb = halfBlend * (0.3 + 0.7 * (1 / (b.blendHardness || 1)));
      let m = softIntervalWeight(uu, lo, hi, Math.max(1e-6, hb));
      m = Math.pow(m, 1 / hardness);
      w[i] = m;
    }
  }

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += w[i];
  }
  if (sum < 1e-12) {
    const idx = Math.min(n - 1, Math.max(0, Math.floor(uu * n)));
    w.fill(0);
    w[idx] = 1;
  } else {
    for (let i = 0; i < n; i++) {
      w[i] /= sum;
    }
  }
  return w;
}

/**
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb01(hex) {
  const s = String(hex || "#888888").replace(/^#/, "");
  if (s.length < 3) {
    return { r: 0.5, g: 0.5, b: 0.5 };
  }
  if (s.length === 3) {
    return {
      r: parseInt(s[0] + s[0], 16) / 255,
      g: parseInt(s[1] + s[1], 16) / 255,
      b: parseInt(s[2] + s[2], 16) / 255
    };
  }
  const p = s.slice(0, 6);
  const n = parseInt(p, 16);
  if (!Number.isFinite(n)) {
    return { r: 0.5, g: 0.5, b: 0.5 };
  }
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
