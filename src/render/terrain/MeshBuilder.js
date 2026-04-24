import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from "three";
import { getGraphRegistry } from "../../noise/graphBridge.js";
import { sampleTerrainHeight } from "./NoiseGraphEvaluator.js";

const reg = getGraphRegistry();

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} wx0
 * @param {number} wy0
 * @param {number} worldSize
 * @param {number} segments
 * @param {object} st
 * @param {number} tSec
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {{ hRaw: boolean } | undefined} opts
 * @returns {{ geometry: import("three").BufferGeometry, indexCount: number, vertexCount: number, triangleCount: number }}
 */
export function buildChunkTerrainGeometry(cx, cy, worldSize, segments, st, tSec, graph, opts) {
  const s = Math.max(2, segments | 0);
  const steps = s;
  const w = steps + 1;
  // chunk origin: corner (min x, min y) for integer chunk (cx, cy) at world grid
  const minX = cx * worldSize;
  const minY = cy * worldSize;
  const heights = new Float32Array(w * w);
  const hRaws = new Float32Array(w * w);
  const meshH = st.meshHeight > 1e-6 ? st.meshHeight : 1e-6;
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const wx = minX + (i / steps) * worldSize;
      const wy = minY + (j / steps) * worldSize;
      const z = sampleTerrainHeight(wx, wy, st, tSec, graph, reg);
      const idx = i + j * w;
      heights[idx] = z;
      hRaws[idx] = (z - (st.heightOffset || 0)) / meshH;
    }
  }
  const nVert = w * w;
  const pos = new Float32Array(nVert * 3);
  const hAttr = new Float32Array(nVert);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const idx = i + j * w;
      const base = idx * 3;
      const wx = minX + (i / steps) * worldSize;
      const wy = minY + (j / steps) * worldSize;
      const hz = heights[idx];
      pos[base] = wx;
      pos[base + 1] = wy;
      pos[base + 2] = hz;
      hAttr[idx] = hRaws[idx];
    }
  }
  const nTri = 2 * steps * steps;
  const indices = new Uint32Array(nTri * 3);
  let tt = 0;
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < steps; i++) {
      const a = i + j * w;
      const b1 = a + 1;
      const c0 = a + w;
      const d = c0 + 1;
      indices[tt++] = a;
      indices[tt++] = b1;
      indices[tt++] = c0;
      indices[tt++] = c0;
      indices[tt++] = b1;
      indices[tt++] = d;
    }
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(pos, 3));
  if (opts?.hRaw !== false) {
    geom.setAttribute("hRaw", new Float32BufferAttribute(hAttr, 1));
  }
  geom.setIndex(new Uint32BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return {
    geometry: geom,
    indexCount: indices.length,
    vertexCount: nVert,
    triangleCount: nTri
  };
}
