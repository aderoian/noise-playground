import { ASSET_VERSION } from "./types.js";

let idCounter = 0;
function newId(prefix) {
  return `${prefix}_${++idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {string} [name]
 * @returns {import("./types.js").NoiseGraph}
 */
export function createGraph(name = "Untitled") {
  return {
    id: newId("g"),
    name,
    version: ASSET_VERSION,
    nodes: [],
    links: [],
    outputNodeId: undefined
  };
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {string} typeId
 * @param {number} x
 * @param {number} y
 * @param {import("./registry.js").NodeRegistry} registry
 * @param {string} [nodeId] optional id for deserialize
 */
export function addNode(graph, typeId, x, y, registry, nodeId) {
  const def = registry.get(typeId);
  if (!def) {
    const id = nodeId || newId("n");
    graph.nodes.push({
      id,
      typeId,
      x,
      y,
      params: {},
      pinDefaults: {},
      isUnknown: true
    });
    return id;
  }
  const params = { ...def.defaultParams };
  const pinDefaults = defaultPinDefaultsFromTypeDef(def);
  const id = nodeId || newId("n");
  const node = {
    id,
    typeId,
    x,
    y,
    params,
    pinDefaults
  };
  graph.nodes.push(/** @type {import("./types.js").GraphNode} */ (node));
  if (def.typeId === "output") {
    graph.outputNodeId = id;
  }
  return id;
}

/**
 * Pin literal defaults for a known node def (used by the graph editor and flow conversion).
 * @param {import("./types.js").NodeTypeDef} def
 * @returns {Record<string, number | { x: number, y: number, z?: number } | { x: number, y: number }>}
 */
export function defaultPinDefaultsFromTypeDef(def) {
  /** @type {Record<string, number | { x: number, y: number, z?: number } | { x: number, y: number }>} */
  const pinDefaults = {};
  for (const p of def.inputs) {
    if (p.default !== undefined) {
      if (p.kind === "Scalar" && typeof p.default === "number") {
        pinDefaults[p.id] = p.default;
      } else if (p.kind === "Vec2" && p.default && typeof p.default === "object" && "x" in p.default) {
        pinDefaults[p.id] = { x: p.default.x, y: p.default.y ?? 0 };
      } else if (p.kind === "Vec3" && p.default && typeof p.default === "object" && "x" in p.default) {
        pinDefaults[p.id] = { x: p.default.x, y: p.default.y ?? 0, z: p.default.z ?? 0 };
      }
    }
  }
  return pinDefaults;
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {string} nodeId
 * @param {import("./registry.js").NodeRegistry} registry
 */
export function removeNode(graph, nodeId, registry) {
  graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
  graph.links = graph.links.filter(
    (l) => l.from.nodeId !== nodeId && l.to.nodeId !== nodeId
  );
  if (graph.outputNodeId === nodeId) {
    const out = graph.nodes.find((n) => n.typeId === "output" && !n.isUnknown);
    graph.outputNodeId = out ? out.id : undefined;
  }
  void registry;
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {string} fromNodeId
 * @param {string} fromPinId
 * @param {string} toNodeId
 * @param {string} toPinId
 * @param {import("./registry.js").NodeRegistry} registry
 * @returns {string | null} link id or null if rejected
 */
export function addLink(graph, fromNodeId, fromPinId, toNodeId, toPinId, registry) {
  if (fromNodeId === toNodeId) {
    return null;
  }
  // One source per input: remove other links to same input pin
  graph.links = graph.links.filter(
    (l) => !(l.to.nodeId === toNodeId && l.to.pinId === toPinId)
  );
  const id = newId("l");
  graph.links.push({
    id,
    from: { nodeId: fromNodeId, pinId: fromPinId },
    to: { nodeId: toNodeId, pinId: toPinId }
  });
  void registry;
  return id;
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {string} linkId
 */
export function removeLink(graph, linkId) {
  graph.links = graph.links.filter((l) => l.id !== linkId);
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {string} nodeId
 * @param {object} params
 */
export function setNodeParams(graph, nodeId, params) {
  const n = graph.nodes.find((x) => x.id === nodeId);
  if (n) {
    n.params = { ...n.params, ...params };
  }
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {string} nodeId
 * @param {string} pinId
 * @param {number | {x:number,y?:number,z?:number}} value
 */
export function setPinDefault(graph, nodeId, pinId, value) {
  const n = graph.nodes.find((x) => x.id === nodeId);
  if (n) {
    n.pinDefaults = { ...n.pinDefaults, [pinId]: value };
  }
}

/**
 * @param {import("./types.js").GraphNode} node
 * @param {import("./types.js").GraphLink[]} links
 * @param {string} pinId
 * @returns {import("./types.js").GraphLink | undefined}
 */
export function linkToInput(node, links, pinId) {
  return links.find((l) => l.to.nodeId === node.id && l.to.pinId === pinId);
}

/**
 * @param {import("./types.js").NoiseGraph} g
 * @param {import("./types.js").GraphNode | undefined} node
 * @returns {import("./types.js").GraphNode | undefined}
 */
export function getOutputNode(g, node) {
  if (node && node.typeId === "output") {
    return node;
  }
  if (g.outputNodeId) {
    return g.nodes.find((n) => n.id === g.outputNodeId);
  }
  return g.nodes.find((n) => n.typeId === "output" && !n.isUnknown);
}
