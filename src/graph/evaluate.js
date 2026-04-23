import { getOutputNode, linkToInput } from "./model.js";
import { hasErrors, validateGraph } from "./validate.js";

/**
 * @typedef {object} WireValue
 * @property {"scalar" | "vec2" | "vec3"} kind
 * @property {number} [s]
 * @property {{x:number,y:number}} [v2]
 * @property {{x:number,y:number,z:number}} [v3]
 */

/**
 * @param {import("./types.js").GraphNode} node
 * @param {import("./registry.js").NodeDef} def
 * @param {string} pinId
 * @returns {WireValue | undefined}
 */
function wireValueFromUnlinkedInput(node, def, pinId) {
  const pdef = def.inputs.find((p) => p.id === pinId);
  if (node.pinDefaults && Object.prototype.hasOwnProperty.call(node.pinDefaults, pinId)) {
    const raw = node.pinDefaults[pinId];
    if (pdef && pdef.kind === "Scalar" && typeof raw === "number") {
      return { kind: "scalar", s: raw };
    }
    if (pdef && pdef.kind === "Vec2" && raw && typeof raw === "object" && "x" in raw) {
      return {
        kind: "vec2",
        v2: { x: /** @type {any} */ (raw).x, y: /** @type {any} */ (raw).y ?? 0 }
      };
    }
    if (pdef && pdef.kind === "Vec3" && raw && typeof raw === "object" && "x" in raw) {
      const o = /** @type {any} */ (raw);
      return { kind: "vec3", v3: { x: o.x, y: o.y ?? 0, z: o.z ?? 0 } };
    }
  }
  if (pdef && pdef.default !== undefined) {
    if (pdef.kind === "Scalar" && typeof pdef.default === "number") {
      return { kind: "scalar", s: pdef.default };
    }
    if (pdef.kind === "Vec2" && pdef.default && typeof pdef.default === "object") {
      return {
        kind: "vec2",
        v2: { x: pdef.default.x, y: pdef.default.y ?? 0 }
      };
    }
    if (pdef.kind === "Vec3" && pdef.default && typeof pdef.default === "object" && "x" in pdef.default) {
      const o = pdef.default;
      return {
        kind: "vec3",
        v3: { x: o.x, y: o.y ?? 0, z: o.z ?? 0 }
      };
    }
  }
  return undefined;
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {import("./registry.js").NodeRegistry} registry
 * @returns {string[] | null}
 */
function topologicalOrder(graph, registry) {
  void registry;
  const inD = new Map();
  for (const n of graph.nodes) {
    inD.set(n.id, 0);
  }
  for (const l of graph.links) {
    inD.set(l.to.nodeId, (inD.get(l.to.nodeId) || 0) + 1);
  }
  const outEdges = new Map();
  for (const n of graph.nodes) {
    outEdges.set(n.id, []);
  }
  for (const l of graph.links) {
    const a = outEdges.get(l.from.nodeId);
    if (a) {
      a.push(l.to.nodeId);
    }
  }
  /** @type {string[]} */
  const q = [];
  for (const [id, d] of inD) {
    if (d === 0) {
      q.push(id);
    }
  }
  /** @type {string[]} */
  const order = [];
  let qi = 0;
  while (qi < q.length) {
    const id = q[qi++];
    if (id === undefined) {
      break;
    }
    order.push(id);
    for (const m of outEdges.get(id) || []) {
      const next = (inD.get(m) || 0) - 1;
      inD.set(m, next);
      if (next === 0) {
        q.push(m);
      }
    }
  }
  if (order.length !== graph.nodes.length) {
    return null;
  }
  return order;
}

/**
 * @typedef {import("./registry.js").NodeDef} NodeDef
 * @typedef {{ fromNodeId: string, fromPin: string }} PinLink
 * @typedef {{
 *   type: "fromLink",
 *   fromNodeId: string,
 *   fromPin: string
 * } | {
 *   type: "const",
 *   v: number
 * } | {
 *   type: "none"
 * } | {
 *   type: "nan"
 * }} OutputResolver
 */

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {import("./registry.js").NodeRegistry} registry
 * @returns {OutputResolver}
 */
function compileOutputResolver(graph, registry) {
  const outN = getOutputNode(graph, undefined);
  if (!outN) {
    return { type: "nan" };
  }
  const link = linkToInput(outN, graph.links, "value");
  if (link) {
    return { type: "fromLink", fromNodeId: link.from.nodeId, fromPin: link.from.pinId };
  }
  if (outN.pinDefaults && typeof outN.pinDefaults.value === "number") {
    return { type: "const", v: outN.pinDefaults.value };
  }
  const odef = registry.get("output");
  const pdef = odef?.inputs[0];
  if (pdef && pdef.default !== undefined && typeof pdef.default === "number") {
    return { type: "const", v: pdef.default };
  }
  return { type: "nan" };
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {import("./registry.js").NodeRegistry} registry
 * @returns {import("./types.js").CompiledGraph | null}
 */
export function compileGraph(graph, registry) {
  const issues = validateGraph(graph, registry);
  if (hasErrors(issues)) {
    return null;
  }
  const order = topologicalOrder(graph, registry);
  if (!order) {
    return null;
  }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  /** @type {Array<{
   *  node: import("./types.js").GraphNode,
   *  def: NodeDef | null,
   *  isUnknown: boolean,
   *  pinLinks: Map<string, PinLink>
   * }>} */
  const steps = [];
  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (!node) {
      continue;
    }
    if (node.isUnknown) {
      steps.push({ node, def: null, isUnknown: true, pinLinks: new Map() });
      continue;
    }
    const def = registry.get(node.typeId);
    if (!def) {
      steps.push({ node, def: null, isUnknown: false, pinLinks: new Map() });
      continue;
    }
    /** @type {Map<string, PinLink>} */
    const pinLinks = new Map();
    for (const p of def.inputs) {
      const link = linkToInput(node, graph.links, p.id);
      if (link) {
        pinLinks.set(p.id, { fromNodeId: link.from.nodeId, fromPin: link.from.pinId });
      }
    }
    steps.push({ node, def, isUnknown: false, pinLinks });
  }
  return {
    graph,
    order,
    steps,
    outResolve: compileOutputResolver(graph, registry)
  };
}

/**
 * @param {Map<string, Map<string, WireValue>>} nodeOut
 * @param {OutputResolver} outResolve
 * @returns {number}
 */
function readCompiledOutput(nodeOut, outResolve) {
  if (outResolve.type === "fromLink") {
    return wireScalar(nodeOut.get(outResolve.fromNodeId)?.get(outResolve.fromPin));
  }
  if (outResolve.type === "const") {
    return outResolve.v;
  }
  return Number.NaN;
}

/**
 * @param {import("./types.js").CompiledGraph} c
 * @param {import("./registry.js").NodeRegistry} registry
 * @param {import("./types.js").EvalContext} ctx
 * @returns {number} output scalar, or NaN if invalid
 */
export function evaluateCompiled(c, registry, ctx) {
  void registry;
  /** @type {Map<string, Map<string, WireValue>>} */
  const nodeOut = new Map();
  for (const step of c.steps) {
    const { node, def, isUnknown, pinLinks } = step;
    if (isUnknown) {
      const m = new Map();
      m.set("out", { kind: "scalar", s: 0 });
      nodeOut.set(node.id, m);
      continue;
    }
    if (!def) {
      continue;
    }
    /**
     * @param {string} pinId
     * @returns {WireValue | undefined}
     */
    const getInput = (pinId) => {
      const L = pinLinks.get(pinId);
      if (L) {
        return nodeOut.get(L.fromNodeId)?.get(L.fromPin);
      }
      return wireValueFromUnlinkedInput(node, def, pinId);
    };
    if (!def.eval) {
      const m = new Map();
      m.set("out", { kind: "scalar", s: 0 });
      nodeOut.set(node.id, m);
      continue;
    }
    const outMap = def.eval(ctx, node, getInput) || new Map();
    const m = outMap instanceof Map ? new Map(outMap) : new Map(/** @type {any} */ (Object.entries(outMap)));
    nodeOut.set(node.id, m);
  }
  return readCompiledOutput(nodeOut, c.outResolve);
}

/**
 * @param {import("./types.js").NoiseGraph} graph
 * @param {import("./registry.js").NodeRegistry} registry
 * @param {import("./types.js").EvalContext} ctx
 * @returns {number} output scalar, or NaN if invalid
 */
export function evaluateAt(graph, registry, ctx) {
  const c = compileGraph(graph, registry);
  if (!c) {
    return Number.NaN;
  }
  return evaluateCompiled(c, registry, ctx);
}

/**
 * @param {WireValue | undefined} w
 * @returns {number}
 */
function wireScalar(w) {
  if (!w || w.kind !== "scalar" || w.s === undefined) {
    return 0;
  }
  return w.s;
}
