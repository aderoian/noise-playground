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
    nodes: g.nodes.map((n) => ({
      id: n.id,
      typeId: n.typeId,
      params: n.params,
      pinDefaults: n.pinDefaults,
      isUnknown: n.isUnknown
    })),
    links: g.links.map((l) => ({
      id: l.id,
      from: l.from,
      to: l.to
    }))
  });
}
