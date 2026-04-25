import { compileGraph, evaluateCompiled } from "../../graph/evaluate.js";
import { buildEvalContextForWorldXY } from "../../noise/graphBridge.js";
import { getGraphRegistry } from "../../noise/graphBridge.js";
import { sampleProceduralHeightRaw } from "./proceduralWorldHeight.js";
import { sampleBiomeProjectTerrain, ensureCompiled } from "./BiomeEvaluator.js";

const defaultReg = getGraphRegistry();

/** @type {{ graphRevision: number, compiled: import("../../graph/evaluate.js").CompiledGraph | null, reg: import("../../graph/registry.js").NodeRegistry }} */
const compileCache = {
  graphRevision: -1,
  compiled: null,
  reg: defaultReg
};

/** @type {import("../../graph/types.js").TerrainSample} */
const _terrainScratch = {
  height: 0,
  colorR: 0,
  colorG: 0,
  colorB: 0,
  biomeId: -1,
  biomeWeights: new Float32Array(0),
  placementU: 0,
  placementRaw: 0
};

/**
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {object} st
 * @param {import("../../graph/registry.js").NodeRegistry} [reg]
 * @returns {import("../../graph/evaluate.js").CompiledGraph | null}
 */
function getOrCompileGraph(graph, st, reg = defaultReg) {
  if (!st.useGraph || !graph) {
    compileCache.compiled = null;
    compileCache.graphRevision = -1;
    return null;
  }
  const rev = st.graphRevision | 0;
  if (compileCache.graphRevision !== rev) {
    compileCache.compiled = compileGraph(graph, reg);
    compileCache.graphRevision = rev;
    compileCache.reg = reg;
  }
  return compileCache.compiled;
}

/**
 * @param {number} worldX
 * @param {number} worldY
 * @param {object} s
 * @param {number} tSec
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {import("../../graph/registry.js").NodeRegistry} [reg]
 * @param {import("../../graph/types.js").TerrainSample} [out]
 * @returns {import("../../graph/types.js").TerrainSample}
 */
export function sampleTerrain(
  worldX,
  worldY,
  s,
  tSec,
  graph,
  reg = defaultReg,
  out
) {
  const o = out || _terrainScratch;
  if (s.useGraph && graph && s.useBiomes && graph.biomeProject) {
    ensureCompiled(graph, graph.biomeProject, s, reg);
    return sampleBiomeProjectTerrain(worldX, worldY, s, tSec, graph, graph.biomeProject, o);
  }
  if (s.useGraph && graph) {
    getOrCompileGraph(graph, s, reg);
    const c = compileCache.compiled;
    if (c) {
      const ctx = buildEvalContextForWorldXY(worldX, worldY, s, tSec);
      const z = evaluateCompiled(c, reg, ctx);
      const h = (Number.isFinite(z) ? z : 0) * s.amplitude * s.meshHeight + s.heightOffset;
      o.height = h;
      const g = 0.5; // albedo: shader uses height ramp in classic mode; gray placeholder
      o.colorR = g;
      o.colorG = g;
      o.colorB = g;
      o.biomeId = -1;
      o.biomeWeights = new Float32Array(0);
      o.placementU = 0;
      o.placementRaw = 0;
      return o;
    }
  }
  const raw = sampleProceduralHeightRaw(worldX, worldY, s, tSec);
  const h = raw * s.meshHeight + s.heightOffset;
  o.height = h;
  o.colorR = 0.4;
  o.colorG = 0.5;
  o.colorB = 0.45;
  o.biomeId = -1;
  o.biomeWeights = new Float32Array(0);
  o.placementU = 0;
  o.placementRaw = 0;
  return o;
}

/**
 * @param {number} worldX
 * @param {number} worldY
 * @param {object} s
 * @param {number} tSec
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {import("../../graph/registry.js").NodeRegistry} [reg]
 */
export function sampleTerrainHeight(
  worldX,
  worldY,
  s,
  tSec,
  graph,
  reg = defaultReg
) {
  return sampleTerrain(worldX, worldY, s, tSec, graph, reg, _terrainScratch).height;
}
