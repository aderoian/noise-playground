import { ASSET_VERSION } from "./types.js";
import { addNode, createGraph } from "./model.js";
import { migrate } from "./migrate.js";
import { createBuiltinRegistry } from "./registry.js";
import { syncLegacyParamsToInputPins } from "./pinSync.js";

const REG = /* @__PURE__ */ (() => createBuiltinRegistry())();

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @returns {string}
 */
export function saveGraphToJson(graph) {
  return JSON.stringify(
    {
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
      links: graph.links
    },
    null,
    2
  );
}

/**
 * @param {string} json
 * @param {import("./registry.js").NodeRegistry} [registry]
 * @returns {{ graph: import("./types.js").NoiseGraph, warnings: string[] }}
 */
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
  const g = createGraph(
    typeof data.name === "string" ? data.name : "Untitled"
  );
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
  void registry;

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
