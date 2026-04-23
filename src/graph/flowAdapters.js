import { createGraph, addNode, addLink } from "./model.js";
import { createBuiltinRegistry } from "./registry.js";
import { ASSET_VERSION } from "./types.js";
import { syncLegacyParamsToInputPins } from "./pinSync.js";

const reg = /* @__PURE__ */ (() => createBuiltinRegistry())();

/**
 * @param {import("@xyflow/react").Node[]} nodes
 * @param {import("@xyflow/react").Edge[]} edges
 * @param {import("./types.js").NoiseGraph | null} [prev]
 * @returns {import("./types.js").NoiseGraph}
 */
export function flowToGraph(nodes, edges, prev) {
  const g = createGraph(
    (prev && prev.name) || "Graph"
  );
  if (prev) {
    g.id = prev.id;
  }
  g.version = ASSET_VERSION;
  g.outputNodeId = undefined;

  for (const n of nodes) {
    const typeId = n.data && n.data.typeId;
    if (typeof typeId !== "string") {
      continue;
    }
    addNode(
      g,
      typeId,
      n.position ? n.position.x : 0,
      n.position ? n.position.y : 0,
      reg,
      n.id
    );
    const gn = g.nodes.find((x) => x.id === n.id);
    if (gn) {
      gn.params = { ...gn.params, ...((n.data && n.data.params) || {}) };
      gn.pinDefaults = { ...gn.pinDefaults, ...((n.data && n.data.pinDefaults) || {}) };
      if (n.data && n.data.isUnknown) {
        gn.isUnknown = true;
      }
      syncLegacyParamsToInputPins(gn, reg);
    }
  }

  for (const e of edges) {
    if (!e.source || !e.target) {
      continue;
    }
    const fromPin = e.sourceHandle || "out";
    const toPin = e.targetHandle;
    if (!toPin) {
      continue;
    }
    addLink(g, e.source, fromPin, e.target, toPin, reg);
  }

  const out = g.nodes.find((n) => n.typeId === "output" && !n.isUnknown);
  if (out) {
    g.outputNodeId = out.id;
  } else {
    g.outputNodeId = prev?.outputNodeId;
  }
  return g;
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @returns {{ nodes: import("@xyflow/react").Node[], edges: import("@xyflow/react").Edge[] }}
 */
export function graphToFlow(graph) {
  const nodes = graph.nodes.map((n) => {
    const def = reg.get(n.typeId);
    return {
      id: n.id,
      type: "noise",
      position: { x: n.x, y: n.y },
      data: {
        typeId: n.typeId,
        label: def ? def.label : n.typeId,
        category: def ? def.category : "Unknown",
        params: { ...n.params },
        pinDefaults: { ...n.pinDefaults },
        isUnknown: n.isUnknown,
        inputs: def ? def.inputs : [],
        outputs: def ? def.outputs : []
      }
    };
  });
  const edges = graph.links.map((l) => ({
    id: l.id,
    source: l.from.nodeId,
    target: l.to.nodeId,
    sourceHandle: l.from.pinId,
    targetHandle: l.to.pinId
  }));
  return { nodes, edges };
}

export { reg as flowAdapterRegistry };
