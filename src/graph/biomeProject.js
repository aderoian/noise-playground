import { createGraph, addNode, addLink } from "./model.js";
import { createBuiltinRegistry } from "./registry.js";
import { ASSET_VERSION } from "./types.js";

const reg = /* @__PURE__ */ (() => createBuiltinRegistry())();

/**
 * @returns {import("./types.js").NoiseGraph}
 */
function makePlacementGraph() {
  const g = createGraph("Placement");
  g.version = ASSET_VERSION;
  const pos = addNode(g, "context_position", 40, 80, reg);
  const fbm = addNode(g, "fbm", 200, 60, reg);
  setNodeParam(g, fbm, "base", "os2");
  const remap = addNode(g, "remap", 380, 60, reg);
  const out = addNode(g, "output", 560, 80, reg);
  addLink(g, pos, "out", fbm, "position", reg);
  addLink(g, fbm, "out", remap, "v", reg);
  addLink(g, remap, "out", out, "value", reg);
  g.outputNodeId = out;
  return g;
}

/**
 * @param {import("./types.js").NoiseGraph} g
 * @param {string} id
 * @param {string} k
 * @param {string|number|boolean} v
 */
function setNodeParam(g, id, k, v) {
  const n = g.nodes.find((x) => x.id === id);
  if (n) {
    n.params = { ...n.params, [k]: v };
  }
}

/**
 * @returns {import("./types.js").NoiseGraph}
 */
function makeTerrainTemplate() {
  const g = createGraph("BiomeTerrain");
  g.version = ASSET_VERSION;
  const pos = addNode(g, "context_position", 40, 80, reg);
  const fbm = addNode(g, "fbm", 240, 60, reg);
  const out = addNode(g, "output", 420, 100, reg);
  addLink(g, pos, "out", fbm, "position", reg);
  addLink(g, fbm, "out", out, "value", reg);
  g.outputNodeId = out;
  return g;
}

/**
 * Deep clone a noise graph (nodes, links, optional biome project recursion handled by caller)
 * @param {import("./types.js").NoiseGraph} g
 * @returns {import("./types.js").NoiseGraph}
 */
export function cloneNoiseGraph(g) {
  return {
    id: g.id,
    name: g.name,
    version: g.version,
    outputNodeId: g.outputNodeId,
    nodes: g.nodes.map((n) => ({
      id: n.id,
      typeId: n.typeId,
      x: n.x,
      y: n.y,
      params: { ...n.params },
      pinDefaults: n.pinDefaults ? { ...n.pinDefaults } : {},
      isUnknown: n.isUnknown,
      ui: n.ui ? { ...n.ui } : undefined
    })),
    links: g.links.map((l) => ({
      id: l.id,
      from: { ...l.from },
      to: { ...l.to }
    })),
    biomeProject: g.biomeProject ? cloneBiomeProject(g.biomeProject) : undefined
  };
}

/**
 * @param {import("./types.js").BiomeProject} bp
 * @returns {import("./types.js").BiomeProject}
 */
export function cloneBiomeProject(bp) {
  return {
    globalSeed: bp.globalSeed,
    selectionMode: bp.selectionMode,
    blendWidth: bp.blendWidth,
    blendHardness: bp.blendHardness,
    placementScale: bp.placementScale,
    placementSeed: bp.placementSeed,
    contrast: bp.contrast,
    outputMode: bp.outputMode,
    placementGraph: cloneNoiseGraph(bp.placementGraph),
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
      terrainGraph: cloneNoiseGraph(b.terrainGraph)
    }))
  };
}

let _bi = 0;
/**
 * @returns {string}
 */
function newBiomeId() {
  return `biome_${++_bi}_${Date.now().toString(36)}`;
}

/**
 * @returns {import("./types.js").BiomeDef}
 */
export function createBiomeDef(/** @type {string} */ name, /** @type {string} */ colorHex) {
  return {
    id: newBiomeId(),
    name,
    colorHex,
    heightScale: 1,
    heightOffset: 0,
    weight: 1,
    rangeStart: 0,
    rangeEnd: 1,
    blendHardness: 1,
    terrainGraph: makeTerrainTemplate()
  };
}

/**
 * Default 3-biome project for V1
 * @returns {import("./types.js").BiomeProject}
 */
export function createDefaultBiomeProject() {
  const placementGraph = makePlacementGraph();
  const a = createBiomeDef("Desert", "#D8B56D");
  a.rangeStart = 0;
  a.rangeEnd = 0.33;
  a.weight = 0.33;
  const b = createBiomeDef("Grassland", "#5BA85B");
  b.rangeStart = 0.33;
  b.rangeEnd = 0.66;
  b.weight = 0.34;
  const c = createBiomeDef("Mountains", "#888888");
  c.rangeStart = 0.66;
  c.rangeEnd = 1;
  c.weight = 0.33;
  return {
    globalSeed: 42,
    selectionMode: "indexed",
    blendWidth: 0.08,
    blendHardness: 1,
    placementScale: 0.5,
    placementSeed: 0,
    contrast: 1,
    outputMode: "blended",
    placementGraph,
    biomes: [a, b, c]
  };
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @returns {import("./types.js").BiomeProject}
 */
export function ensureBiomeProject(graph) {
  if (graph.biomeProject && graph.biomeProject.biomes?.length) {
    return graph.biomeProject;
  }
  return createDefaultBiomeProject();
}

/**
 * Clone graph for embedding as terrain without nested biome project (avoids deep recursion)
 * @param {import("./types.js").NoiseGraph} g
 * @returns {import("./types.js").NoiseGraph}
 */
export function cloneGraphStripBiome(g) {
  const c = cloneNoiseGraph(g);
  delete c.biomeProject;
  return c;
}

/**
 * After loading a legacy v2 graph, wrap it as the first biome terrain
 * @param {import("./types.js").NoiseGraph} g
 * @returns {import("./types.js").BiomeProject}
 */
export function wrapLegacyGraphAsBiomeProject(g) {
  const bp = createDefaultBiomeProject();
  const t = cloneGraphStripBiome(g);
  t.name = (g.name || "Main") + " (terrain)";
  bp.biomes[0] = {
    id: bp.biomes[0].id,
    name: "Migrated",
    colorHex: bp.biomes[0].colorHex,
    heightScale: 1,
    heightOffset: 0,
    weight: 1,
    rangeStart: 0,
    rangeEnd: 0.33,
    blendHardness: 1,
    terrainGraph: t
  };
  return bp;
}

const MAX_BIOMES = 6;

/**
 * @param {import("./types.js").NoiseGraph} g
 * @returns {import("./types.js").NoiseGraph}
 */
export function addBiomeToGraph(g) {
  const ng = cloneNoiseGraph(g);
  const base = ensureBiomeProject(ng);
  if (base.biomes.length >= MAX_BIOMES) {
    ng.biomeProject = cloneBiomeProject(base);
    return ng;
  }
  const bp = cloneBiomeProject(base);
  const n = createBiomeDef(`Biome ${bp.biomes.length + 1}`, "#888888");
  n.rangeStart = 0.5;
  n.rangeEnd = 1.0;
  n.weight = 0.1;
  bp.biomes = [...bp.biomes, n];
  ng.biomeProject = bp;
  return ng;
}

/**
 * @param {import("./types.js").NoiseGraph} g
 * @param {string} biomeId
 * @returns {import("./types.js").NoiseGraph}
 */
export function removeBiomeFromGraph(g, biomeId) {
  const ng = cloneNoiseGraph(g);
  if (!ng.biomeProject) {
    return ng;
  }
  const bp = cloneBiomeProject(ng.biomeProject);
  if (bp.biomes.length <= 1) {
    ng.biomeProject = bp;
    return ng;
  }
  bp.biomes = bp.biomes.filter((b) => b.id !== biomeId);
  ng.biomeProject = bp;
  return ng;
}

/**
 * @param {import("./types.js").NoiseGraph} g
 * @param {number} from
 * @param {number} to
 * @returns {import("./types.js").NoiseGraph}
 */
export function moveBiomeInGraph(g, from, to) {
  const ng = cloneNoiseGraph(g);
  if (!ng.biomeProject) {
    return ng;
  }
  const bp = cloneBiomeProject(ng.biomeProject);
  const arr = [...bp.biomes];
  if (from < 0 || from >= arr.length) {
    ng.biomeProject = bp;
    return ng;
  }
  const t = Math.max(0, Math.min(arr.length - 1, to));
  const [x] = arr.splice(from, 1);
  arr.splice(t, 0, x);
  bp.biomes = arr;
  ng.biomeProject = bp;
  return ng;
}

/**
 * @param {import("./types.js").NoiseGraph} g
 * @param {string} biomeId
 * @returns {import("./types.js").NoiseGraph}
 */
export function duplicateBiomeInGraph(g, biomeId) {
  const ng = cloneNoiseGraph(g);
  if (!ng.biomeProject) {
    return ng;
  }
  const base = ensureBiomeProject(ng);
  if (base.biomes.length >= MAX_BIOMES) {
    ng.biomeProject = cloneBiomeProject(base);
    return ng;
  }
  const b0 = base.biomes.find((b) => b.id === biomeId);
  if (!b0) {
    return ng;
  }
  const bp = cloneBiomeProject(base);
  const copy = { ...b0, id: newBiomeId(), name: `${b0.name} copy` };
  copy.terrainGraph = cloneNoiseGraph(b0.terrainGraph);
  bp.biomes = [...bp.biomes, copy];
  ng.biomeProject = bp;
  return ng;
}

/**
 * @param {import("./types.js").NoiseGraph} g
 * @param {string} biomeId
 * @param {Partial<import("./types.js").BiomeDef>} patch
 * @returns {import("./types.js").NoiseGraph}
 */
export function patchBiomeDef(g, biomeId, patch) {
  const ng = cloneNoiseGraph(g);
  if (!ng.biomeProject) {
    return ng;
  }
  const bp = cloneBiomeProject(ng.biomeProject);
  const ix = bp.biomes.findIndex((b) => b.id === biomeId);
  if (ix < 0) {
    ng.biomeProject = bp;
    return ng;
  }
  const cur = bp.biomes[ix];
  bp.biomes = [...bp.biomes];
  bp.biomes[ix] = { ...cur, ...patch };
  ng.biomeProject = bp;
  return ng;
}

/**
 * @param {import("./types.js").NoiseGraph} g
 * @param {Partial<import("./types.js").BiomeProject>} patch
 * @returns {import("./types.js").NoiseGraph}
 */
export function patchBiomeProject(g, patch) {
  const ng = cloneNoiseGraph(g);
  if (!ng.biomeProject) {
    return ng;
  }
  ng.biomeProject = { ...cloneBiomeProject(ng.biomeProject), ...patch };
  return ng;
}
