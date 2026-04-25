import { createGraph, addNode, addLink } from "./model.js";
import { createBuiltinRegistry } from "./registry.js";
import { ASSET_VERSION } from "./types.js";
import { syncLegacyParamsToInputPins } from "./pinSync.js";
import { cloneBiomeProject, cloneNoiseGraph, ensureBiomeProject } from "./biomeProject.js";

const reg = /* @__PURE__ */ (() => createBuiltinRegistry())();

/**
 * @param {import("@xyflow/react").Node[]} nodes
 * @param {import("@xyflow/react").Edge[]} edges
 * @param {object} o
 * @param {import("./types.js").NoiseGraph | null} [o.nameSource]
 * @param {string} [o.graphName]
 * @param {import("./types.js").NoiseGraph | null} [o.idSource]
 * @param {import("./types.js").NoiseGraph | null} [o.outputFallback]
 * @param {boolean} [o.preserveOutputFallback]
 * @returns {import("./types.js").NoiseGraph}
 */
function buildGraphFromFlow(nodes, edges, o = {}) {
  const name = o.graphName || (o.nameSource && o.nameSource.name) || "Graph";
  const g = createGraph(name);
  if (o.idSource) {
    g.id = o.idSource.id;
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
  } else if (o.preserveOutputFallback && o.outputFallback) {
    g.outputNodeId = o.outputFallback.outputNodeId;
  } else {
    g.outputNodeId = o.outputFallback?.outputNodeId;
  }
  return g;
}

/**
 * @param {import("@xyflow/react").Node[]} nodes
 * @param {import("@xyflow/react").Edge[]} edges
 * @param {import("./types.js").NoiseGraph | null} [prev] full graph (for id/biome merge)
 * @param {string} [graphEditTarget] "main" | "placement" | "biome:<id>"
 * @returns {import("./types.js").NoiseGraph}
 */
export function flowToGraph(nodes, edges, prev, graphEditTarget) {
  const t = graphEditTarget || "main";
  if (t === "main") {
    const g = buildGraphFromFlow(nodes, edges, {
      nameSource: prev || undefined,
      idSource: prev || undefined,
      outputFallback: prev || null,
      preserveOutputFallback: true
    });
    if (prev && prev.biomeProject) {
      g.biomeProject = cloneBiomeProject(prev.biomeProject);
    }
    return g;
  }
  if (t === "placement") {
    const sub = buildGraphFromFlow(nodes, edges, {
      graphName: (prev && prev.biomeProject && prev.biomeProject.placementGraph && prev.biomeProject.placementGraph.name) || "Placement",
      outputFallback: prev && prev.biomeProject ? prev.biomeProject.placementGraph : null,
      preserveOutputFallback: true
    });
    if (!prev) {
      return sub;
    }
    const g = cloneNoiseGraph(prev);
    g.biomeProject = cloneBiomeProject(ensureBiomeProject(g));
    g.biomeProject.placementGraph = sub;
    return g;
  }
  if (t.startsWith("biome:")) {
    const bid = t.slice(6);
    const bPrev = prev && prev.biomeProject ? prev.biomeProject.biomes.find((b) => b.id === bid) : null;
    const sub = buildGraphFromFlow(nodes, edges, {
      graphName: (bPrev && bPrev.terrainGraph && bPrev.terrainGraph.name) || "BiomeTerrain",
      outputFallback: bPrev ? bPrev.terrainGraph : null,
      preserveOutputFallback: true
    });
    if (!prev) {
      return sub;
    }
    const g = cloneNoiseGraph(prev);
    g.biomeProject = cloneBiomeProject(ensureBiomeProject(g));
    const ix = g.biomeProject.biomes.findIndex((b) => b.id === bid);
    if (ix < 0) {
      return g;
    }
    const b0 = g.biomeProject.biomes[ix];
    g.biomeProject.biomes = [...g.biomeProject.biomes];
    g.biomeProject.biomes[ix] = { ...b0, terrainGraph: sub };
    return g;
  }
  const g = buildGraphFromFlow(nodes, edges, {
    nameSource: prev || undefined,
    idSource: prev || undefined,
    outputFallback: prev || null,
    preserveOutputFallback: true
  });
  if (prev && prev.biomeProject) {
    g.biomeProject = cloneBiomeProject(prev.biomeProject);
  }
  return g;
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {string} [graphEditTarget] "main" | "placement" | "biome:<id>"
 * @returns {{ nodes: import("@xyflow/react").Node[], edges: import("@xyflow/react").Edge[] }}
 */
export function graphToFlow(graph, graphEditTarget) {
  const t = graphEditTarget || "main";
  let sub = graph;
  if (t === "main") {
    return noiseGraphToFlow(graph);
  }
  if (!graph.biomeProject) {
    return noiseGraphToFlow(graph);
  }
  if (t === "placement") {
    sub = graph.biomeProject.placementGraph;
  } else if (t.startsWith("biome:")) {
    const id = t.slice(6);
    const b = graph.biomeProject.biomes.find((x) => x.id === id);
    sub = b ? b.terrainGraph : graph;
  }
  return noiseGraphToFlow(sub);
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @returns {{ nodes: import("@xyflow/react").Node[], edges: import("@xyflow/react").Edge[] }}
 */
function noiseGraphToFlow(graph) {
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
