/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number} Chebyshev / square-ring distance in chunk units
 */
export function chebyshevChunkDistance(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Band width for layer i (0 = near camera) scales as (i+1)^exp so outer rings are wider.
 * @type {number}
 */
const LOD_LAYER_WEIGHT_EXP = 1.5;

/**
 * Inclusive max integer ring distance for levels 0..N-2; level N-1 is d > last cap (up to R).
 *
 * @param {number} R chunk radius (integer >= 0)
 * @param {number} N layer count >= 1
 * @returns {number[]}
 */
function buildInclusiveMaxRings(R, N) {
  if (N <= 1 || R <= 0) {
    return [];
  }
  const w = /** @type {number[]} */ ([]);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const wi = Math.pow(i + 1, LOD_LAYER_WEIGHT_EXP);
    w.push(wi);
    sum += wi;
  }
  const caps = /** @type {number[]} */ ([]);
  let acc = 0;
  for (let L = 0; L < N - 1; L++) {
    acc += (R * w[L]) / sum;
    let cap = Math.min(R, Math.floor(acc + 1e-9));
    if (caps.length > 0 && cap <= caps[caps.length - 1]) {
      cap = Math.min(R, caps[caps.length - 1] + 1);
    }
    caps.push(cap);
  }
  return caps;
}

/**
 * @param {object} st
 * @param {number} distRing Floor of Euclidean distance in chunk space (see RendererController).
 * @returns {number} level in [0, N-1], higher = farther / coarser
 */
export function resolveLodLevel(st, distRing) {
  if (st.rendererViewMode === "chunk") {
    return 0;
  }
  if (!st.lodEnabled) {
    return 0;
  }
  const d = Math.max(0, distRing | 0);
  const R = Math.max(0, st.chunkRadius | 0);
  const N = Math.max(1, st.lodLayerCount | 0);
  if (N <= 1 || R <= 0) {
    return 0;
  }
  const caps = buildInclusiveMaxRings(R, N);
  for (let L = 0; L < caps.length; L++) {
    if (d <= caps[L]) {
      return L;
    }
  }
  return N - 1;
}

/**
 * @param {object} st
 * @param {number} distRing Same as resolveLodLevel.
 * @returns {number} mesh segments (edge count) for a chunk
 */
export function resolveMeshSegmentsForRing(st, distRing) {
  const defS = st.defaultChunkResolution | 0;
  const minS = st.minLodResolution | 0;
  if (st.rendererViewMode === "chunk") {
    /** Chunk snapshot: cap resolution — full defaultChunkResolution is very heavy for CPU graph bakes. */
    const cap = 96;
    return Math.max(2, Math.min(defS, cap));
  }
  if (!st.lodEnabled) {
    return Math.max(2, defS);
  }
  const level = resolveLodLevel(st, distRing);
  const factor = Math.pow(2, -level);
  let r = Math.max(2, Math.floor(defS * factor + 1e-9));
  r = Math.max(minS, Math.min(defS, r));
  return r;
}
