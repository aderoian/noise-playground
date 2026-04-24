import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from "three";
import { getGraphRegistry } from "../../noise/graphBridge.js";
import { sampleTerrainHeight } from "./NoiseGraphEvaluator.js";

const reg = getGraphRegistry();

/**
 * Smooth normals for a regular height grid (faster than BufferGeometry.computeVertexNormals for dense meshes).
 * @param {Float32Array} heights
 * @param {number} w steps + 1
 * @param {number} steps
 * @param {number} cell world stride per grid step
 * @returns {Float32Array} length w*w*3
 */
function heightfieldGridNormals(heights, w, steps, cell) {
  const out = new Float32Array(w * w * 3);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const idx = i + j * w;
      const hC = heights[idx];
      let dhx;
      if (i === 0) {
        dhx = (heights[i + 1 + j * w] - hC) / cell;
      } else if (i === steps) {
        dhx = (hC - heights[i - 1 + j * w]) / cell;
      } else {
        dhx = (heights[i + 1 + j * w] - heights[i - 1 + j * w]) / (2 * cell);
      }
      let dhy;
      if (j === 0) {
        dhy = (heights[i + (j + 1) * w] - hC) / cell;
      } else if (j === steps) {
        dhy = (hC - heights[i + (j - 1) * w]) / cell;
      } else {
        dhy = (heights[i + (j + 1) * w] - heights[i + (j - 1) * w]) / (2 * cell);
      }
      let nx = -dhx;
      let ny = -dhy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-12) {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      const b = idx * 3;
      out[b] = nx;
      out[b + 1] = ny;
      out[b + 2] = nz;
    }
  }
  return out;
}

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
  const cell = worldSize / steps;
  const norms = heightfieldGridNormals(heights, w, steps, cell);
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(pos, 3));
  geom.setAttribute("normal", new Float32BufferAttribute(norms, 3));
  if (opts?.hRaw !== false) {
    geom.setAttribute("hRaw", new Float32BufferAttribute(hAttr, 1));
  }
  geom.setIndex(new Uint32BufferAttribute(indices, 1));
  return {
    geometry: geom,
    indexCount: indices.length,
    vertexCount: nVert,
    triangleCount: nTri
  };
}
