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
/**
 * @param {import("./types.js").NoiseGraph} g
 * @returns {string}
 */
function graphTopologyTree(g) {
  return JSON.stringify({
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
 * @param {import("./types.js").BiomeProject} bp
 * @returns {string}
 */
function biomeProjectTopologySignature(bp) {
  const t = [graphTopologyTree(bp.placementGraph)];
  for (const b of [...bp.biomes].sort((a, x) => a.id.localeCompare(x.id))) {
    t.push(b.id, graphTopologyTree(b.terrainGraph));
  }
  return t.join("#");
}

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
    })),
    biomeTopology: g.biomeProject ? biomeProjectTopologySignature(g.biomeProject) : ""
  });
}

/**
 * Fingerprint of graph runtime-editable scalar/vector values that should update uniforms or storage
 * without forcing shader regeneration when topology is unchanged.
 * @param {import("./types.js").NoiseGraph} g
 * @returns {string}
 */
/**
 * @param {import("./types.js").NoiseGraph} g
 * @returns {string}
 */
function graphParamTree(g) {
  return {
    nodes: sortedGraphNodes(g).map((n) => ({
      id: n.id,
      params: sortObject(n.params),
      pinDefaults: sortObject(n.pinDefaults)
    }))
  };
}

/**
 * @param {import("./types.js").BiomeProject} bp
 */
function biomeProjectParamSignature(bp) {
  return {
    p: graphParamTree(bp.placementGraph),
    biomes: [...bp.biomes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((b) => ({ id: b.id, t: graphParamTree(b.terrainGraph) }))
  };
}

export function graphParamSignature(g) {
  return JSON.stringify({
    ...graphParamTree(g),
    biome: g.biomeProject ? biomeProjectParamSignature(g.biomeProject) : null
  });
}

/**
 * @param {import("./types.js").BiomeProject} bp
 * @returns {string}
 */
function biomeProjectEvalSignature(bp) {
  const b = [];
  b.push(graphEvalSignatureForNested(bp.placementGraph));
  b.push(
    String(bp.globalSeed),
    bp.selectionMode,
    bp.blendWidth,
    bp.blendHardness,
    bp.placementScale,
    bp.placementSeed,
    bp.contrast,
    bp.outputMode
  );
  for (const bio of [...bp.biomes].sort((a, b) => a.id.localeCompare(b.id))) {
    b.push(
      bio.id,
      bio.name,
      bio.colorHex,
      bio.heightScale,
      bio.heightOffset,
      bio.weight,
      bio.rangeStart,
      bio.rangeEnd,
      bio.blendHardness,
      graphEvalSignatureForNested(bio.terrainGraph)
    );
  }
  return b.join("|");
}

/**
 * Same as graph eval payload but for nested terrain/placement (no further biomeProject recursion in signature).
 * @param {import("./types.js").NoiseGraph} g
 * @returns {string}
 */
function graphEvalSignatureForNested(g) {
  return JSON.stringify({
    id: g.id,
    version: g.version,
    outputNodeId: g.outputNodeId,
    topology: JSON.parse(graphTopologySignature(g)),
    runtime: JSON.parse(graphParamSignature(g))
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
    runtime: JSON.parse(graphParamSignature(g)),
    biomeProject: g.biomeProject ? biomeProjectEvalSignature(g.biomeProject) : ""
  });
}
