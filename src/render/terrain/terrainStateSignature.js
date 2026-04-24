import { graphEvalSignature } from "../../graph/evalSignature.js";

let _graphRef = null;
let _graphRev = -1;
let _graphEvalCached = "";

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
  return _graphEvalCached;
}

/**
 * Fingerprint of all settings that should dirty every terrain chunk when changed.
 * @param {object} s
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @returns {string}
 */
export function terrainSettingsSignature(s, graph) {
  const o = s.offset;
  return [
    s.graphKey,
    s.graphRevision,
    graphEvalPart(graph, s.graphRevision),
    s.rendererViewMode,
    s.chunkRadius,
    s.chunkReloadSeq | 0,
    o.x,
    o.y,
    o.z,
    s.worldScale,
    s.frequency,
    s.amplitude,
    s.meshHeight,
    s.heightOffset,
    s.defaultChunkResolution,
    s.chunkWorldSize,
    s.lodEnabled,
    s.minLodResolution,
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
    s.renderPreset,
    s.cameraZoom,
    s.contrast,
    s.brightness,
    s.invert,
    s.colorRamp,
    s.animate,
    s.timeSpeed
  ].join("@");
}
