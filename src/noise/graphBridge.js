import { createBuiltinRegistry } from "../graph/registry.js";
import { compileGraph, evaluateCompiled } from "../graph/evaluate.js";

const registry = /* @__PURE__ */ (() => createBuiltinRegistry())();

/**
 * @returns {import("../graph/registry.js").NodeRegistry}
 */
export function getGraphRegistry() {
  return registry;
}

/**
 * World position before `uFrequency` scale (aligns with `noiseSampleP` in shader before the final `* uFrequency`)
 * @param {number} u
 * @param {number} v
 * @param {object} st
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} tSec
 * @returns {import("../graph/types.js").EvalContext}
 */
export function buildEvalContextForUv(u, v, st, viewW, viewH, tSec) {
  const aspect = viewH > 0 ? viewW / viewH : 1.0;
  const worldScale = st.worldScale;
  const wx = (u - 0.5) * 2.0 * worldScale * aspect;
  const wy = (v - 0.5) * 2.0 * worldScale;
  const zc = st.viewMode === "slice3d" ? st.sliceZ : 0.0;
  const uT = st.animate ? tSec * st.timeSpeed : 0.0;
  return {
    x: wx + st.offset.x,
    y: wy + st.offset.y,
    z: zc + uT + st.offset.z,
    time: uT,
    /** Drives the graph `seed` *input* node; noise nodes read seed from their own input pins. */
    seed: st.seed
  };
}

/**
 * Bakes scalar noise (same domain as the mesh) into a 2D float array (row-major, +U along X, +V along Y)
 * @param {import("../graph/types.js").NoiseGraph} graph
 * @param {object} st
 * @param {number} tSec
 * @param {number} w
 * @param {number} h
 * @param {number} viewW
 * @param {number} viewH
 * @param {import("../graph/registry.js").NodeRegistry} [reg]
 * @param {{ compileMs?: number, sampleMs?: number } | null} [outStats] optional: filled with timings (ms)
 * @returns {Float32Array}
 */
export function bakeGraphHeight(
  graph,
  st,
  tSec,
  w,
  h,
  viewW,
  viewH,
  reg = registry,
  outStats = null
) {
  const tCompile0 = performance.now();
  const c = compileGraph(graph, reg);
  const tCompile1 = performance.now();
  if (outStats) {
    outStats.compileMs = tCompile1 - tCompile0;
  }
  const data = new Float32Array(w * h);
  if (!c) {
    if (outStats) {
      outStats.sampleMs = 0;
    }
    return data;
  }
  const tS0 = performance.now();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      const v = (j + 0.5) / h;
      const ctx = buildEvalContextForUv(u, v, st, viewW, viewH, tSec);
      const z = evaluateCompiled(c, reg, ctx);
      data[i + j * w] = Number.isFinite(z) ? z : 0;
    }
  }
  const tS1 = performance.now();
  if (outStats) {
    outStats.sampleMs = tS1 - tS0;
  }
  return data;
}
