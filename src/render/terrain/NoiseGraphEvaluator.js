import { compileGraph, evaluateCompiled } from "../../graph/evaluate.js";
import { buildEvalContextForWorldXY } from "../../noise/graphBridge.js";
import { getGraphRegistry } from "../../noise/graphBridge.js";
import { sampleProceduralHeightRaw } from "./proceduralWorldHeight.js";

const defaultReg = getGraphRegistry();

/** @type {{ graphRevision: number, compiled: import("../../graph/evaluate.js").CompiledGraph | null, reg: import("../../graph/registry.js").NodeRegistry }} */
const compileCache = {
  graphRevision: -1,
  compiled: null,
  reg: defaultReg
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
 */
export function sampleTerrainHeight(
  worldX,
  worldY,
  s,
  tSec,
  graph,
  reg = defaultReg
) {
  const c = getOrCompileGraph(graph, s, reg);
  if (c) {
    const ctx = buildEvalContextForWorldXY(worldX, worldY, s, tSec);
    const z = evaluateCompiled(c, reg, ctx);
    return (Number.isFinite(z) ? z : 0) * s.amplitude * s.meshHeight + s.heightOffset;
  }
  const raw = sampleProceduralHeightRaw(worldX, worldY, s, tSec);
  return raw * s.meshHeight + s.heightOffset;
}
