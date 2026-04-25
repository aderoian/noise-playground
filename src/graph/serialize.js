import { ASSET_VERSION } from "./types.js";
import { addNode, createGraph } from "./model.js";
import { migrate } from "./migrate.js";
import { createBuiltinRegistry } from "./registry.js";
import { syncLegacyParamsToInputPins } from "./pinSync.js";
import { wrapLegacyGraphAsBiomeProject } from "./biomeProject.js";

const REG = /* @__PURE__ */ (() => createBuiltinRegistry())();

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @returns {object}
 */
function graphToSaveObject(graph) {
  return {
    id: graph.id,
    name: graph.name,
    version: graph.version,
    outputNodeId: graph.outputNodeId,
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      typeId: n.typeId,
      x: n.x,
      y: n.y,
      params: n.params,
      pinDefaults: n.pinDefaults,
      isUnknown: n.isUnknown,
      ui: n.ui
    })),
    links: graph.links,
    biomeProject: graph.biomeProject ? biomeProjectToSaveObject(graph.biomeProject) : undefined
  };
}

/**
 * @param {import("./types.js").BiomeProject} bp
 */
function biomeProjectToSaveObject(bp) {
  return {
    globalSeed: bp.globalSeed,
    selectionMode: bp.selectionMode,
    blendWidth: bp.blendWidth,
    blendHardness: bp.blendHardness,
    placementScale: bp.placementScale,
    placementSeed: bp.placementSeed,
    contrast: bp.contrast,
    outputMode: bp.outputMode,
    placementGraph: graphToSaveObject(bp.placementGraph),
    biomes: bp.biomes.map((b) => ({
      id: b.id,
      name: b.name,
      colorHex: b.colorHex,
      heightScale: b.heightScale,
      heightOffset: b.heightOffset,
      weight: b.weight,
      rangeStart: b.rangeStart,
      rangeEnd: b.rangeEnd,
      blendHardness: b.blendHardness,
      terrainGraph: graphToSaveObject(b.terrainGraph)
    }))
  };
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @returns {string}
 */
export function saveGraphToJson(graph) {
  return JSON.stringify(graphToSaveObject(graph), null, 2);
}

/**
 * @param {any} data
 * @param {import("./registry.js").NodeRegistry} registry
 * @param {boolean} [nested] If true, skip legacy biome wrap
 * @returns {import("./types.js").NoiseGraph}
 */
function graphFromData(data, registry, nested = false) {
  const g = createGraph(typeof data.name === "string" ? data.name : "Untitled");
  g.id = typeof data.id === "string" ? data.id : g.id;
  g.version = ASSET_VERSION;
  g.outputNodeId = undefined;

  if (data.outputNodeId && typeof data.outputNodeId === "string") {
    g.outputNodeId = data.outputNodeId;
  }

  const nodeList = Array.isArray(data.nodes) ? data.nodes : [];
  for (const n of nodeList) {
    if (!n || typeof n.id !== "string" || typeof n.typeId !== "string") {
      continue;
    }
    addNode(g, n.typeId, n.x ?? 0, n.y ?? 0, registry, n.id);
    const node = g.nodes.find((x) => x.id === n.id);
    if (node) {
      node.params = { ...node.params, ...(n.params || {}) };
      node.pinDefaults = { ...node.pinDefaults, ...(n.pinDefaults || {}) };
      if (n.isUnknown) {
        node.isUnknown = true;
      }
      if (n.ui) {
        node.ui = n.ui;
      }
      syncLegacyParamsToInputPins(node, registry);
    }
  }

  const linkList = Array.isArray(data.links) ? data.links : [];
  g.links = [];
  for (const l of linkList) {
    if (!l || typeof l.id !== "string" || !l.from || !l.to) {
      continue;
    }
    g.links = g.links.filter(
      (x) => !(x.to.nodeId === l.to.nodeId && x.to.pinId === l.to.pinId)
    );
    g.links.push({
      id: l.id,
      from: { nodeId: l.from.nodeId, pinId: l.from.pinId },
      to: { nodeId: l.to.nodeId, pinId: l.to.pinId }
    });
  }

  if (!g.outputNodeId) {
    const o = g.nodes.find((n) => n.typeId === "output");
    if (o) {
      g.outputNodeId = o.id;
    }
  }

  if (data.biomeProject && typeof data.biomeProject === "object" && !nested) {
    g.biomeProject = biomeProjectFromData(data.biomeProject, registry);
  }
  return g;
}

/**
 * @param {any} rawBp
 * @param {import("./registry.js").NodeRegistry} registry
 * @returns {import("./types.js").BiomeProject}
 */
function biomeProjectFromData(rawBp, registry) {
  const placementGraph = graphFromData(rawBp.placementGraph, registry, true);
  const biomes = Array.isArray(rawBp.biomes)
    ? rawBp.biomes.map((/** @type {any} */ b) => ({
        id: String(b.id || ""),
        name: String(b.name || "Biome"),
        colorHex: String(b.colorHex || "#888888"),
        heightScale: Number(b.heightScale) || 1,
        heightOffset: Number(b.heightOffset) || 0,
        weight: Number(b.weight) || 1,
        rangeStart: Number(b.rangeStart) || 0,
        rangeEnd: Number(b.rangeEnd) || 1,
        blendHardness: Number(b.blendHardness) || 1,
        terrainGraph: graphFromData(b.terrainGraph, registry, true)
      }))
    : [];
  return {
    globalSeed: Number(rawBp.globalSeed) || 0,
    selectionMode: rawBp.selectionMode === "weighted" ? "weighted" : "indexed",
    blendWidth: Number(rawBp.blendWidth) || 0.1,
    blendHardness: Number(rawBp.blendHardness) || 1,
    placementScale: Number(rawBp.placementScale) || 1,
    placementSeed: Number(rawBp.placementSeed) || 0,
    contrast: Number(rawBp.contrast) || 1,
    outputMode: String(rawBp.outputMode || "blended"),
    placementGraph,
    biomes
  };
}

export function loadGraphFromJson(json, registry = REG) {
  const raw = /** @type {any} */ (JSON.parse(json));
  const warnings = [];
  const { data, fromVersion, warnings: w } = migrate(raw);
  warnings.push(...w);
  if (!data || typeof data !== "object") {
    return {
      graph: createGraph("Recovered"),
      warnings: [...warnings, "Invalid graph data, created empty graph"]
    };
  }
  const g = graphFromData(data, registry, false);

  if (fromVersion < 3 && !data.biomeProject) {
    g.biomeProject = wrapLegacyGraphAsBiomeProject(g);
    warnings.push("Wrapped legacy graph as first biome terrain");
  }

  if (fromVersion < ASSET_VERSION) {
    warnings.push(`Migrated from version ${fromVersion} to ${ASSET_VERSION}`);
  }

  if (!g.outputNodeId) {
    const o = g.nodes.find((n) => n.typeId === "output");
    if (o) {
      g.outputNodeId = o.id;
    }
  }

  return { graph: g, warnings };
}
