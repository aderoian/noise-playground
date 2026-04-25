const COMPILE_TIME_PARAM_KEYS = {
  swizzle: ["component"],
  fbm: ["base"],
  billow: ["base"],
  ridged: ["base"],
  turbulence: ["base"]
};

/**
 * @param {Record<string, unknown> | undefined} obj
 * @returns {Record<string, unknown>}
 */
function sortObject(obj) {
  if (!obj || typeof obj !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  );
}

/**
 * @param {import("./types.js").GraphNode} n
 * @returns {Record<string, unknown>}
 */
function compileTimeParamsForNode(n) {
  const keys = COMPILE_TIME_PARAM_KEYS[n.typeId] || [];
  return Object.fromEntries(
    keys
      .filter((key) => Object.prototype.hasOwnProperty.call(n.params || {}, key))
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, n.params[key]])
  );
}

/**
 * @param {import("./types.js").NoiseGraph} g
 */
function sortedGraphNodes(g) {
  return [...g.nodes].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * @param {import("./types.js").NoiseGraph} g
 */
function sortedGraphLinks(g) {
  return [...g.links].sort((a, b) => {
    const ak = `${a.from.nodeId}:${a.from.pinId}->${a.to.nodeId}:${a.to.pinId}:${a.id}`;
    const bk = `${b.from.nodeId}:${b.from.pinId}->${b.to.nodeId}:${b.to.pinId}:${b.id}`;
    return ak.localeCompare(bk);
  });
}

/**
 * Fingerprint of graph topology + compile-time settings that affect generated shader code.
 * Excludes editor layout and runtime scalar parameter values.
 * @param {import("./types.js").NoiseGraph} g
 * @returns {string}
 */
export function graphTopologySignature(g) {
  return JSON.stringify({
    id: g.id,
    version: g.version,
    outputNodeId: g.outputNodeId,
    nodes: sortedGraphNodes(g).map((n) => ({
      id: n.id,
      typeId: n.typeId,
      compileParams: compileTimeParamsForNode(n),
      isUnknown: n.isUnknown
    })),
    links: sortedGraphLinks(g).map((l) => ({
      id: l.id,
      from: l.from,
      to: l.to
    }))
  });
}

/**
 * Fingerprint of graph runtime-editable scalar/vector values that should update uniforms or storage
 * without forcing shader regeneration when topology is unchanged.
 * @param {import("./types.js").NoiseGraph} g
 * @returns {string}
 */
export function graphParamSignature(g) {
  return JSON.stringify({
    nodes: sortedGraphNodes(g).map((n) => ({
      id: n.id,
      params: sortObject(n.params),
      pinDefaults: sortObject(n.pinDefaults)
    }))
  });
}

/**
 * Fingerprint of graph content that affects CPU/GPU eval output (excludes node positions in editor).
 * @param {import("./types.js").NoiseGraph} g
 * @returns {string}
 */
export function graphEvalSignature(g) {
  return JSON.stringify({
    id: g.id,
    version: g.version,
    outputNodeId: g.outputNodeId,
    topology: JSON.parse(graphTopologySignature(g)),
    runtime: JSON.parse(graphParamSignature(g))
  });
}
