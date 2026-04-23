import { linkToInput, getOutputNode } from "./model.js";

/**
 * @param {import("./types").PinKind} a
 * @param {import("./types").PinKind} b
 */
function compatiblePinKinds(a, b) {
  return a === b;
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {import("./registry.js").NodeRegistry} registry
 * @returns {import("./types.js").ValidationIssue[]}
 */
export function validateGraph(graph, registry) {
  /** @type {import("./types.js").ValidationIssue[]} */
  const issues = [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const n of graph.nodes) {
    if (n.isUnknown) {
      issues.push({
        level: "error",
        code: "unknown_node",
        message: `Unknown node type: ${n.typeId}`,
        nodeId: n.id
      });
      continue;
    }
    if (!registry.has(n.typeId)) {
      issues.push({
        level: "error",
        code: "unknown_node",
        message: `Unregistered type: ${n.typeId}`,
        nodeId: n.id
      });
    }
  }

  for (const l of graph.links) {
    const a = nodeById.get(l.from.nodeId);
    const b = nodeById.get(l.to.nodeId);
    if (!a || !b) {
      issues.push({
        level: "error",
        code: "broken_link",
        message: "Link references missing node",
        linkId: l.id
      });
      continue;
    }
    if (a.isUnknown || b.isUnknown) {
      continue;
    }
    const defA = registry.get(a.typeId);
    const defB = registry.get(b.typeId);
    if (!defA || !defB) {
      continue;
    }
    const outP = defA.outputs.find((p) => p.id === l.from.pinId);
    const inP = defB.inputs.find((p) => p.id === l.to.pinId);
    if (!outP || !inP) {
      issues.push({
        level: "error",
        code: "invalid_pin",
        message: "Link connects nonexistent pins",
        linkId: l.id,
        nodeId: b.id
      });
      continue;
    }
    if (!compatiblePinKinds(/** @type {any} */ (outP.kind), /** @type {any} */ (inP.kind))) {
      issues.push({
        level: "error",
        code: "type_mismatch",
        message: `Type mismatch: ${outP.kind} -> ${inP.kind}`,
        linkId: l.id
      });
    }
  }

  // Multiple sources per input: prevented by addLink, but check anyway
  const inKey = new Map();
  for (const l of graph.links) {
    const k = `${l.to.nodeId}:${l.to.pinId}`;
    if (inKey.has(k)) {
      issues.push({
        level: "error",
        code: "multi_source",
        message: "Multiple links to the same input pin",
        linkId: l.id
      });
    } else {
      inKey.set(k, l.id);
    }
  }

  // Required inputs: scalar without default must be linked; vec optional if default in def
  for (const n of graph.nodes) {
    if (n.isUnknown) {
      continue;
    }
    const def = registry.get(n.typeId);
    if (!def) {
      continue;
    }
    for (const pin of def.inputs) {
      const hasDef =
        n.pinDefaults &&
        Object.prototype.hasOwnProperty.call(n.pinDefaults, pin.id);
      const link = linkToInput(n, graph.links, pin.id);
      if (link) {
        continue;
      }
      if (hasDef) {
        continue;
      }
      if (pin.default !== undefined) {
        continue;
      }
      issues.push({
        level: "error",
        code: "missing_input",
        message: `Input "${pin.name}" requires a link or default`,
        nodeId: n.id
      });
    }
  }

  // Cycle: link from S to T's input => S before T, edge S -> T
  const outEdges = new Map();
  for (const n of graph.nodes) {
    outEdges.set(n.id, []);
  }
  for (const l of graph.links) {
    if (!nodeById.has(l.from.nodeId) || !nodeById.get(l.to.nodeId)) {
      continue;
    }
    const list = outEdges.get(l.from.nodeId);
    if (list) {
      list.push(l.to.nodeId);
    }
  }
  const visiting = new Set();
  const done = new Set();
  /**
   * @param {string} id
   * @returns {boolean} true if cycle
   */
  function dfs(id) {
    if (done.has(id)) {
      return false;
    }
    if (visiting.has(id)) {
      return true;
    }
    visiting.add(id);
    for (const next of outEdges.get(id) || []) {
      if (dfs(next)) {
        return true;
      }
    }
    visiting.delete(id);
    done.add(id);
    return false;
  }
  for (const n of graph.nodes) {
    if (dfs(n.id)) {
      issues.push({ level: "error", code: "cycle", message: "Graph contains a cycle" });
      break;
    }
  }

  const outNodes = graph.nodes.filter(
    (n) => n.typeId === "output" && !n.isUnknown
  );
  if (outNodes.length > 1) {
    issues.push({
      level: "error",
      code: "multiple_outputs",
      message: "Only one Output node is allowed"
    });
  }

  // Output node
  const outNode = getOutputNode(graph, undefined);
  if (!outNode) {
    issues.push({ level: "error", code: "no_output", message: "Add an Output node" });
  } else {
    if (!outNode.isUnknown) {
      const odef = registry.get("output");
      if (odef) {
        const link = linkToInput(outNode, graph.links, "value");
        const hasDef =
          outNode.pinDefaults && Object.prototype.hasOwnProperty.call(outNode.pinDefaults, "value");
        const pin = odef.inputs[0];
        if (!link && !hasDef && pin && pin.default === undefined) {
          issues.push({
            level: "error",
            code: "output_unwired",
            message: "Connect the Output node's Value input",
            nodeId: outNode.id
          });
        }
      }
    }
  }

  if (graph.outputNodeId && !nodeById.get(graph.outputNodeId)) {
    issues.push({ level: "warning", code: "stale_output_ref", message: "Output node id is stale" });
  }

  return issues;
}

/**
 * @param {import("./types.js").ValidationIssue[]} issues
 */
export function hasErrors(issues) {
  return issues.some((i) => i.level === "error");
}
