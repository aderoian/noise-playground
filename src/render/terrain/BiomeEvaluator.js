import { compileGraph, evaluateCompiled } from "../../graph/evaluate.js";
import { buildEvalContextForWorldXY } from "../../noise/graphBridge.js";
import { getGraphRegistry } from "../../noise/graphBridge.js";
import { computeBiomeWeights, hexToRgb01 } from "./biomeWeights.js";

const reg = getGraphRegistry();

/** @type {{ graphRevision: number, placement: import("../../graph/evaluate.js").CompiledGraph | null, terrains: (import("../../graph/evaluate.js").CompiledGraph | null)[] }} */
let compileCache = {
  graphRevision: -1,
  placement: null,
  terrains: []
};

/**
 * @param {import("../../graph/types.js").NoiseGraph | null} g
 * @param {import("../../graph/types.js").BiomeProject} bp
 * @param {object} st
 * @param {import("../../graph/registry.js").NodeRegistry} [r]
 */
function ensureCompiled(g, bp, st, r = reg) {
  const rev = st.graphRevision | 0;
  if (!g || !bp || !st.useGraph) {
    compileCache = { graphRevision: -1, placement: null, terrains: [] };
    return;
  }
  if (compileCache.graphRevision === rev && compileCache.terrains.length === bp.biomes.length) {
    return;
  }
  compileCache = {
    graphRevision: rev,
    placement: compileGraph(bp.placementGraph, r),
    terrains: bp.biomes.map((b) => compileGraph(b.terrainGraph, r))
  };
}

/**
 * @param {number} t01
 * @param {number} contrast
 * @returns {number}
 */
function applyContrast(t01, contrast) {
  const t = Math.max(0, Math.min(1, t01));
  const c = Math.max(0.1, Math.min(8, contrast));
  // push toward 0.5 when c<1, away when c>1
  const d = t - 0.5;
  return Math.max(0, Math.min(1, 0.5 + d * c));
}

/**
 * @param {import("../../graph/types.js").EvalContext} base
 * @param {import("../../graph/types.js").BiomeProject} bp
 * @param {string} which placement | terrain
 * @returns {import("../../graph/types.js").EvalContext}
 */
function offsetSeed(base, bp, which) {
  const extra = which === "placement" ? (bp.placementSeed | 0) : 0;
  return {
    ...base,
    x: base.x * bp.placementScale,
    y: base.y * bp.placementScale,
    seed: (base.seed | 0) + extra + (bp.globalSeed | 0) * 0.0001
  };
}

/**
 * @param {number} worldX
 * @param {number} worldY
 * @param {object} st
 * @param {number} tSec
 * @param {import("../../graph/types.js").BiomeProject} bp
 * @returns {number} placement 0..1
 */
function samplePlacementU(worldX, worldY, st, tSec, bp) {
  const base = buildEvalContextForWorldXY(worldX, worldY, st, tSec);
  const ctx = offsetSeed(base, bp, "placement");
  const c = compileCache.placement;
  if (!c) {
    return 0.5;
  }
  const raw = evaluateCompiled(c, reg, ctx);
  const n = (Number.isFinite(raw) ? raw : 0) * 0.5 + 0.5;
  return applyContrast(n, bp.contrast);
}

/**
 * @param {number} worldX
 * @param {number} worldY
 * @param {object} st
 * @param {number} tSec
 * @param {import("../../graph/types.js").BiomeProject} bp
 * @param {number} idx
 * @returns {number} raw height before global amp
 */
function sampleBiomeHeightRaw(worldX, worldY, st, tSec, bp, idx) {
  const b = bp.biomes[idx];
  if (!b) {
    return 0;
  }
  const base = buildEvalContextForWorldXY(worldX, worldY, st, tSec);
  const c = compileCache.terrains[idx];
  if (!c) {
    return 0;
  }
  const raw = evaluateCompiled(c, reg, base);
  const r = Number.isFinite(raw) ? raw : 0;
  return r * (b.heightScale || 1) + (b.heightOffset || 0);
}

/**
 * @param {number} worldX
 * @param {number} worldY
 * @param {object} s
 * @param {number} tSec
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {import("../../graph/types.js").BiomeProject} bp
 * @param {import("../../graph/types.js").BiomeDef} b
 * @param {number} idx
 * @param {import("../../graph/types.js").TerrainSample} [reuse]
 * @returns {import("../../graph/types.js").TerrainSample}
 */
function sampleOneBiomeTerrain(
  worldX,
  worldY,
  s,
  tSec,
  graph,
  bp,
  b,
  idx,
  reuse
) {
  const base = buildEvalContextForWorldXY(worldX, worldY, s, tSec);
  const c = compileCache.terrains[idx];
  if (!c) {
    return fillTerrain(0, 0, 0, 0, -1, new Float32Array(0), 0, 0, reuse);
  }
  const raw = evaluateCompiled(c, reg, base);
  const r = Number.isFinite(raw) ? raw : 0;
  const h = (r * (b.heightScale || 1) + (b.heightOffset || 0)) * s.amplitude * s.meshHeight + s.heightOffset;
  const { r: R, g: G, b: B } = hexToRgb01(b.colorHex);
  const n = bp.biomes.length;
  const w = new Float32Array(n);
  w[idx] = 1;
  return fillTerrain(h, R, G, B, idx, w, 0, 0, reuse);
}

/**
 * @param {number} h
 * @param {number} R
 * @param {number} G
 * @param {number} B
 * @param {number} biomeId
 * @param {Float32Array} weights
 * @param {number} placementU
 * @param {number} placementRaw
 * @param {import("../../graph/types.js").TerrainSample} [out]
 * @returns {import("../../graph/types.js").TerrainSample}
 */
function fillTerrain(h, R, G, B, biomeId, weights, placementU, placementRaw, out) {
  const t = out || { biomeWeights: new Float32Array(0) };
  t.height = h;
  t.colorR = R;
  t.colorG = G;
  t.colorB = B;
  t.biomeId = biomeId;
  if (t.biomeWeights && t.biomeWeights.length === weights.length) {
    t.biomeWeights.set(weights);
  } else {
    t.biomeWeights = Float32Array.from(weights);
  }
  t.placementU = placementU;
  t.placementRaw = placementRaw;
  return t;
}

/**
 * @param {number} worldX
 * @param {number} worldY
 * @param {object} s
 * @param {number} tSec
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {import("../../graph/types.js").BiomeProject} bp
 * @param {import("../../graph/types.js").TerrainSample} [out]
 * @returns {import("../../graph/types.js").TerrainSample}
 */
export function sampleBiomeBlended(
  worldX,
  worldY,
  s,
  tSec,
  graph,
  bp,
  out
) {
  ensureCompiled(graph, bp, s);
  const base = buildEvalContextForWorldXY(worldX, worldY, s, tSec);
  const pctx = offsetSeed(base, bp, "placement");
  const cPl = compileCache.placement;
  const rawP = cPl ? evaluateCompiled(cPl, reg, pctx) : 0;
  const u = cPl
    ? applyContrast((Number.isFinite(rawP) ? rawP : 0) * 0.5 + 0.5, bp.contrast)
    : 0.5;
  const weights = computeBiomeWeights(u, bp);
  const n = bp.biomes.length;
  if (n === 0) {
    return fillTerrain(0, 0.3, 0.3, 0.35, -1, new Float32Array(0), u, (Number.isFinite(rawP) ? rawP : 0), out);
  }
  let hAcc = 0;
  let rAcc = 0;
  let gAcc = 0;
  let bAcc = 0;
  for (let i = 0; i < n; i++) {
    const w = weights[i] || 0;
    if (w < 1e-7) {
      continue;
    }
    const b = bp.biomes[i];
    const hr = sampleBiomeHeightRaw(worldX, worldY, s, tSec, bp, i);
    hAcc += w * hr;
    const { r: R, g: G, b: B } = hexToRgb01(b.colorHex);
    rAcc += w * R;
    gAcc += w * G;
    bAcc += w * B;
  }
  const hFinal = hAcc * s.amplitude * s.meshHeight + s.heightOffset;
  let dom = 0;
  let wmax = weights[0] || 0;
  for (let i = 1; i < n; i++) {
    if (weights[i] > wmax) {
      wmax = weights[i];
      dom = i;
    }
  }
  return fillTerrain(hFinal, rAcc, gAcc, bAcc, dom, weights, u, (Number.isFinite(rawP) ? rawP : 0), out);
}

/**
 * @param {number} worldX
 * @param {number} worldY
 * @param {object} s
 * @param {number} tSec
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {import("../../graph/types.js").BiomeProject} [bpIn]
 * @param {import("../../graph/types.js").TerrainSample} [out]
 * @returns {import("../../graph/types.js").TerrainSample}
 */
export function sampleBiomeProjectTerrain(
  worldX,
  worldY,
  s,
  tSec,
  graph,
  bpIn,
  out
) {
  const bp = bpIn;
  if (!graph || !bp || !bp.biomes?.length) {
    return fillTerrain(0, 0.2, 0.25, 0.3, -1, new Float32Array(0), 0, 0, out);
  }
  if (s.terrainVizMode === "placement") {
    ensureCompiled(graph, bp, s);
    const u = samplePlacementU(worldX, worldY, s, tSec, bp);
    return fillTerrain(u, u, 1 - u, 0.2, -1, new Float32Array(0), u, 0, out);
  }
  if (s.terrainVizMode === "biomeId") {
    ensureCompiled(graph, bp, s);
    const u = samplePlacementU(worldX, worldY, s, tSec, bp);
    const w = computeBiomeWeights(u, bp);
    let dom = 0;
    for (let i = 1; i < w.length; i++) {
      if (w[i] > w[dom]) {
        dom = i;
      }
    }
    const hue = (dom / Math.max(1, bp.biomes.length - 0.0001)) * 0.9;
    return fillTerrain(
      dom * 0.2,
      0.2 + 0.8 * hue,
      0.4,
      0.6 - 0.3 * hue,
      dom,
      w,
      u,
      0,
      out
    );
  }
  if (s.terrainVizMode === "weight" && s.biomePreviewIndex < bp.biomes.length) {
    ensureCompiled(graph, bp, s);
    const u = samplePlacementU(worldX, worldY, s, tSec, bp);
    const w = computeBiomeWeights(u, bp);
    const k = s.biomePreviewIndex | 0;
    const ww = w[k] ?? 0;
    return fillTerrain(ww, ww, 1.0 - Math.abs(0.5 - ww) * 2, 0.3, k, w, u, 0, out);
  }
  if (s.terrainVizMode === "biomePreview" && s.biomePreviewIndex < bp.biomes.length) {
    ensureCompiled(graph, bp, s);
    const b = bp.biomes[s.biomePreviewIndex | 0];
    return sampleOneBiomeTerrain(
      worldX,
      worldY,
      s,
      tSec,
      graph,
      bp,
      b,
      s.biomePreviewIndex | 0,
      out
    );
  }
  if (s.terrainVizMode === "height") {
    const t = sampleBiomeBlended(worldX, worldY, s, tSec, graph, bp, out);
    const span = Math.max(1e-5, s.amplitude * s.meshHeight);
    const n = (t.height - s.heightOffset) / span;
    const g = Math.max(0, Math.min(1, n * 0.5 + 0.5));
    t.colorR = g;
    t.colorG = g;
    t.colorB = g;
    return t;
  }
  if (s.terrainVizMode === "color" || s.terrainVizMode === "blend" || s.terrainVizMode === "default") {
    return sampleBiomeBlended(worldX, worldY, s, tSec, graph, bp, out);
  }
  return sampleBiomeBlended(worldX, worldY, s, tSec, graph, bp, out);
}

export { ensureCompiled, samplePlacementU };
