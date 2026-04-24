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
