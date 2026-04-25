import {
  graphEvalSignature,
  graphParamSignature,
  graphTopologySignature
} from "../../graph/evalSignature.js";

let _graphRef = null;
let _graphRev = -1;
let _graphEvalCached = "";
let _graphTopoCached = "";
let _graphParamCached = "";

/**
 * @param {import("../../graph/types.js").NoiseGraph | null | undefined} graph
 * @param {number} graphRevision
 * @returns {string}
 */
function graphEvalPart(graph, graphRevision) {
  if (!graph) {
    return "";
  }
  const rev = graphRevision | 0;
  if (graph === _graphRef && rev === _graphRev) {
    return _graphEvalCached;
  }
  _graphRef = graph;
  _graphRev = rev;
  _graphEvalCached = graphEvalSignature(graph);
  _graphTopoCached = graphTopologySignature(graph);
  _graphParamCached = graphParamSignature(graph);
  return _graphEvalCached;
}

/**
 * @param {import("../../graph/types.js").NoiseGraph | null | undefined} graph
 * @param {number} graphRevision
 * @returns {string}
 */
function graphTopologyPart(graph, graphRevision) {
  if (!graph) {
    return "";
  }
  graphEvalPart(graph, graphRevision);
  return _graphTopoCached;
}

/**
 * @param {import("../../graph/types.js").NoiseGraph | null | undefined} graph
 * @param {number} graphRevision
 * @returns {string}
 */
function graphParamPart(graph, graphRevision) {
  if (!graph) {
    return "";
  }
  graphEvalPart(graph, graphRevision);
  return _graphParamCached;
}

/**
 * @param {object} s
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {{ includeOffset: boolean, includeCameraZoom: boolean }} o
 * @returns {string}
 */
function terrainSignatureCore(s, graph, o) {
  const off = s.offset;
  /** @type {(string|number|boolean)[]} */
  const parts = [
    s.graphKey,
    s.graphRevision,
    graphEvalPart(graph, s.graphRevision),
    s.useBiomes ? 1 : 0,
    s.terrainVizMode || "default",
    s.rendererViewMode,
    s.chunkViewSize | 0,
    s.chunkRadius,
    s.chunkReloadSeq | 0
  ];
  if (o.includeOffset) {
    parts.push(off.x, off.y, off.z);
  }
  parts.push(
    s.worldScale,
    s.frequency,
    s.amplitude,
    s.meshHeight,
    s.heightOffset,
    s.defaultChunkResolution,
    s.chunkWorldSize,
    s.lodEnabled,
    s.minLodResolution,
    s.lodLayerCount,
    s.viewMode,
    s.sliceZ,
    s.seed,
    s.baseKind,
    s.orientation,
    s.fractal,
    s.octaves,
    s.lacunarity,
    s.gain,
    s.useGraph,
    s.jitter,
    s.cellMetric,
    s.cellReturn,
    s.rigidExp,
    s.rigidWeight,
    s.renderPreset
  );
  if (o.includeCameraZoom) {
    parts.push(s.cameraZoom);
  }
  parts.push(
    s.contrast,
    s.brightness,
    s.invert,
    s.colorRamp,
    s.animate,
    s.timeSpeed
  );
  return parts.join("@");
}

/**
 * Fingerprint of all settings that should dirty every terrain chunk when changed.
 * @param {object} s
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @returns {string}
 */
export function terrainSettingsSignature(s, graph) {
  return terrainSignatureCore(s, graph, { includeOffset: true, includeCameraZoom: true });
}

/**
 * CPU mesh bake only: excludes pan offset and camera zoom so zoom / unrelated UI
 * does not force full graph rebakes. Offset is tracked separately in RendererController.
 * @param {object} s
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @returns {string}
 */
export function terrainMeshBakeSignature(s, graph) {
  return terrainSignatureCore(s, graph, { includeOffset: false, includeCameraZoom: false });
}

/**
 * Fingerprint of graph topology only, used to cache generated WGSL and pipelines.
 * @param {object} s
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @returns {string}
 */
export function terrainGraphCompileSignature(s, graph) {
  return [
    s.useGraph ? 1 : 0,
    s.useBiomes ? 1 : 0,
    s.graphKey | 0,
    s.graphTopologyRevision | 0,
    s.graphTopologyHash || graphTopologyPart(graph, s.graphRevision)
  ].join("@");
}

/**
 * Fingerprint of data that changes chunk height contents without requiring shader regeneration.
 * Includes graph runtime params, noise uniforms, offsets, view slicing, and runtime chunk settings.
 * @param {object} s
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @returns {string}
 */
export function terrainChunkContentSignature(s, graph) {
  const off = s.offset;
  return [
    s.useGraph ? 1 : 0,
    s.useBiomes ? 1 : 0,
    s.terrainVizMode || "default",
    s.graphKey | 0,
    s.graphRevision | 0,
    s.graphParamRevision | 0,
    s.graphParamHash || graphParamPart(graph, s.graphRevision),
    off.x,
    off.y,
    off.z,
    s.sliceZ,
    s.animate ? 1 : 0,
    s.timeSpeed,
    s.seed,
    s.amplitude,
    s.meshHeight,
    s.heightOffset,
    s.defaultChunkResolution | 0,
    s.chunkWorldSize,
    s.lodEnabled ? 1 : 0,
    s.minLodResolution | 0,
    s.lodLayerCount | 0,
    s.chunkRadius | 0,
    s.chunkReloadSeq | 0
  ].join("@");
}
