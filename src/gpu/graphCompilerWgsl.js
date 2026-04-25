import { getOutputNode, linkToInput } from "../graph/model.js";
import { hasErrors, validateGraph } from "../graph/validate.js";
import { WGSL_NOISE_LIB } from "./wgslNoiseLib.js";

const MAX_PARAMS = 384;

/**
 * @param {string} nodeId
 * @returns {string}
 */
function sanitizeNodeId(nodeId) {
  const s = String(nodeId || "node").replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^[0-9]/.test(s)) {
    return `n_${s}`;
  }
  return s || "node";
}

/**
 * @param {import("../graph/types.js").NoiseGraph} graph
 * @param {import("../graph/registry.js").NodeRegistry} registry
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
  for (const arr of outEdges.values()) {
    arr.sort((a, b) => a.localeCompare(b));
  }
  /** @type {string[]} */
  const q = [];
  for (const [id, d] of [...inD.entries()].sort(([a], [b]) => a.localeCompare(b))) {
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
 * @param {import("../graph/types.js").GraphNode} node
 * @param {import("../graph/registry.js").NodeDef} def
 * @param {string} pinId
 */
function scalarDefault(node, def, pinId) {
  if (node.pinDefaults && Object.prototype.hasOwnProperty.call(node.pinDefaults, pinId)) {
    const raw = node.pinDefaults[pinId];
    const pdef = def.inputs.find((p) => p.id === pinId);
    if (pdef && pdef.kind === "Scalar" && typeof raw === "number") {
      return raw;
    }
  }
  const pdef = def.inputs.find((p) => p.id === pinId);
  if (pdef && typeof pdef.default === "number") {
    return pdef.default;
  }
  return 0;
}

/**
 * @param {import("../graph/types.js").GraphNode} node
 * @param {import("../graph/registry.js").NodeDef} def
 * @param {string} pinId
 */
function vec3Default(node, def, pinId) {
  if (node.pinDefaults && Object.prototype.hasOwnProperty.call(node.pinDefaults, pinId)) {
    const raw = node.pinDefaults[pinId];
    if (raw && typeof raw === "object" && "x" in raw) {
      const o = /** @type {any} */ (raw);
      return { x: o.x, y: o.y ?? 0, z: o.z ?? 0 };
    }
  }
  const pdef = def.inputs.find((p) => p.id === pinId);
  if (pdef && pdef.default && typeof pdef.default === "object" && "x" in pdef.default) {
    const o = pdef.default;
    return { x: o.x, y: o.y ?? 0, z: o.z ?? 0 };
  }
  return { x: 0, y: 0, z: 0 };
}

/**
 * @param {string} base
 */
function baseKindIndex(base) {
  const b = String(base || "os2");
  if (b === "value") {
    return 1;
  }
  if (b === "perlin") {
    return 2;
  }
  if (b === "simplex2") {
    return 3;
  }
  if (b === "os2") {
    return 4;
  }
  if (b === "white") {
    return 0;
  }
  if (b === "worley") {
    return 5;
  }
  return 4;
}

/**
 * @param {string} typeId
 */
function fractalMode(typeId) {
  if (typeId === "fbm") {
    return 1;
  }
  if (typeId === "billow") {
    return 2;
  }
  if (typeId === "ridged") {
    return 3;
  }
  if (typeId === "turbulence") {
    return 4;
  }
  return 0;
}

/**
 * @typedef {{ kind: "scalarPin" | "vec3Pin"; nodeId: string; pinId: string; axis?: "x" | "y" | "z" } | { kind: "param"; nodeId: string; key: string }} ParamSlot
 */

/**
 * @param {import("../graph/types.js").NoiseGraph} graph
 * @param {import("../graph/registry.js").NodeRegistry} registry
 * @returns {{
 *   ok: boolean,
 *   wgslBody: string,
 *   paramCount: number,
 *   paramSlots: ParamSlot[],
 *   errors: { code: string, message: string, nodeId?: string }[],
 *   outputExpr: string
 * }}
 */
export function compileGraphHeightBody(graph, registry) {
  /** @type {{ code: string, message: string, nodeId?: string }[]} */
  const errors = [];
  const issues = validateGraph(graph, registry);
  if (hasErrors(issues)) {
    for (const it of issues) {
      if (it.level === "error") {
        errors.push({ code: it.code, message: it.message, nodeId: it.nodeId });
      }
    }
    return { ok: false, wgslBody: "", paramCount: 0, paramSlots: [], errors, outputExpr: "0.0" };
  }
  const order = topologicalOrder(graph, registry);
  if (!order) {
    errors.push({ code: "cycle", message: "Graph has cycles" });
    return { ok: false, wgslBody: "", paramCount: 0, paramSlots: [], errors, outputExpr: "0.0" };
  }
  const outN = getOutputNode(graph, undefined);
  if (!outN) {
    errors.push({ code: "missing_output", message: "Missing output node" });
    return { ok: false, wgslBody: "", paramCount: 0, paramSlots: [], errors, outputExpr: "0.0" };
  }

  /** @type {Map<string, Map<string, { kind: "f32" | "vec3", expr: string }>>} */
  const pinVals = new Map();
  /** @type {ParamSlot[]} */
  const paramSlots = [];
  let paramCount = 0;

  /**
   * @param {ParamSlot} slot
   */
  function addParamSlot(slot) {
    if (paramCount >= MAX_PARAMS) {
      errors.push({
        code: "too_many_params",
        message: "Too many scalar uniforms (max " + MAX_PARAMS + ")",
        nodeId: slot.nodeId
      });
      return 0;
    }
    paramSlots.push(slot);
    return paramCount++;
  }

  /**
   * @param {import("../graph/types.js").GraphNode} node
   * @param {import("../graph/registry.js").NodeDef} def
   * @param {string} pinId
   * @param {Map<string, { fromNodeId: string, fromPin: string }>} pinLinks
   * @param {"f32"|"vec3"} kind
   */
  function readPin(node, def, pinId, pinLinks, kind) {
    const L = pinLinks.get(pinId);
    if (L) {
      const m = pinVals.get(L.fromNodeId);
      const v = m?.get(L.fromPin);
      if (!v) {
        return kind === "f32" ? "0.0" : "vec3f(0.0)";
      }
      if (kind === "f32" && v.kind !== "f32") {
        return "0.0";
      }
      if (kind === "vec3" && v.kind !== "vec3") {
        return "vec3f(0.0)";
      }
      return v.expr;
    }
    if (kind === "f32") {
      const idx = addParamSlot({ kind: "scalarPin", nodeId: node.id, pinId });
      return `g_params.values[${idx}]`;
    }
    const ix = addParamSlot({ kind: "vec3Pin", nodeId: node.id, pinId, axis: "x" });
    const iy = addParamSlot({ kind: "vec3Pin", nodeId: node.id, pinId, axis: "y" });
    const iz = addParamSlot({ kind: "vec3Pin", nodeId: node.id, pinId, axis: "z" });
    return `vec3f(g_params.values[${ix}], g_params.values[${iy}], g_params.values[${iz}])`;
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  /** @type {string[]} */
  const lines = [];

  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (!node) {
      continue;
    }
    const outMap = new Map();
    pinVals.set(node.id, outMap);

    if (node.isUnknown) {
      outMap.set("out", { kind: "f32", expr: "0.0" });
      continue;
    }
    const def = registry.get(node.typeId);
    if (!def) {
      outMap.set("out", { kind: "f32", expr: "0.0" });
      continue;
    }

    /** @type {Map<string, { fromNodeId: string, fromPin: string }>} */
    const pinLinks = new Map();
    for (const p of def.inputs) {
      const link = linkToInput(node, graph.links, p.id);
      if (link) {
        pinLinks.set(p.id, { fromNodeId: link.from.nodeId, fromPin: link.from.pinId });
      }
    }

    const tid = node.typeId;

    if (tid === "pos_x") {
      outMap.set("out", { kind: "f32", expr: "ctx_x" });
    } else if (tid === "pos_y") {
      outMap.set("out", { kind: "f32", expr: "ctx_y" });
    } else if (tid === "pos_z") {
      outMap.set("out", { kind: "f32", expr: "ctx_z" });
    } else if (tid === "context_position") {
      outMap.set("out", { kind: "vec3", expr: "vec3f(ctx_x, ctx_y, ctx_z)" });
    } else if (tid === "time") {
      outMap.set("out", { kind: "f32", expr: "ctx_time" });
    } else if (tid === "seed") {
      outMap.set("out", { kind: "f32", expr: "ctx_seed" });
    } else if (tid === "constant") {
      const idx = addParamSlot({ kind: "param", nodeId: node.id, key: "value" });
      outMap.set("out", { kind: "f32", expr: `g_params.values[${idx}]` });
    } else if (tid === "compose_vec3") {
      const x = readPin(node, def, "x", pinLinks, "f32");
      const y = readPin(node, def, "y", pinLinks, "f32");
      const z = readPin(node, def, "z", pinLinks, "f32");
      outMap.set("out", { kind: "vec3", expr: `vec3f(${x}, ${y}, ${z})` });
    } else if (tid === "swizzle") {
      const v = readPin(node, def, "v", pinLinks, "vec3");
      const c = Math.max(0, Math.min(2, Math.floor(Number(node.params.component) || 0)));
      const comp = c === 0 ? "x" : c === 1 ? "y" : "z";
      outMap.set("out", { kind: "f32", expr: `${v}.${comp}` });
    } else if (
      tid === "noise_white" ||
      tid === "noise_value" ||
      tid === "noise_perlin" ||
      tid === "noise_simplex" ||
      tid === "noise_os2" ||
      tid === "noise_worley"
    ) {
      const kind =
        tid === "noise_white"
          ? 0
          : tid === "noise_value"
            ? 1
            : tid === "noise_perlin"
              ? 2
              : tid === "noise_simplex"
                ? 3
                : tid === "noise_os2"
                  ? 4
                  : 5;
      const p = readPin(node, def, "position", pinLinks, "vec3");
      const fq = readPin(node, def, "frequency", pinLinks, "f32");
      const amp = readPin(node, def, "amplitude", pinLinks, "f32");
      const sd = readPin(node, def, "seed", pinLinks, "f32");
      const j = readPin(node, def, "jitter", pinLinks, "f32");
      const cm = readPin(node, def, "cellMetric", pinLinks, "f32");
      const cr = readPin(node, def, "cellReturn", pinLinks, "f32");
      const norm = readPin(node, def, "normalize", pinLinks, "f32");
      const varN = `n_${sanitizeNodeId(node.id)}`;
      lines.push(`let ${varN}_p = ${p} * max(${fq}, 1e-6);`);
      lines.push(
        `var ${varN}_v = np_base(${kind}, ${varN}_p.x, ${varN}_p.y, ${varN}_p.z, ${sd}, ${j}, i32(floor(${cm})), i32(floor(${cr})));`
      );
      lines.push(`if (${norm} > 0.5) { ${varN}_v = ${varN}_v * 0.5 + 0.5; }`);
      outMap.set("out", { kind: "f32", expr: `${varN}_v * ${amp}` });
    } else if (tid === "fbm" || tid === "billow" || tid === "ridged" || tid === "turbulence") {
      const p = readPin(node, def, "position", pinLinks, "vec3");
      const fq = readPin(node, def, "frequency", pinLinks, "f32");
      const amp = readPin(node, def, "amplitude", pinLinks, "f32");
      const sd = readPin(node, def, "seed", pinLinks, "f32");
      const oct = readPin(node, def, "octaves", pinLinks, "f32");
      const lac = readPin(node, def, "lacunarity", pinLinks, "f32");
      const gn = readPin(node, def, "gain", pinLinks, "f32");
      const j = readPin(node, def, "jitter", pinLinks, "f32");
      const cm = readPin(node, def, "cellMetric", pinLinks, "f32");
      const cr = readPin(node, def, "cellReturn", pinLinks, "f32");
      const bIdx = baseKindIndex(String(node.params.base));
      const fmode = fractalMode(tid);
      const varN = `n_${sanitizeNodeId(node.id)}`;
      lines.push(`let ${varN}_p = ${p} * max(${fq}, 1e-6);`);
      lines.push(
        `let ${varN}_v = np_fractal(${fmode}, ${bIdx}, ${varN}_p.x, ${varN}_p.y, ${varN}_p.z, ${sd}, i32(clamp(floor(${oct}), 1.0, 8.0)), ${lac}, ${gn}, ${j}, i32(floor(${cm})), i32(floor(${cr})));`
      );
      outMap.set("out", { kind: "f32", expr: `${varN}_v * ${amp}` });
    } else if (tid === "domain_warp") {
      const p = readPin(node, def, "position", pinLinks, "vec3");
      const st = readPin(node, def, "strength", pinLinks, "f32");
      const fq = readPin(node, def, "frequency", pinLinks, "f32");
      const sd = readPin(node, def, "seed", pinLinks, "f32");
      const oct = readPin(node, def, "octaves", pinLinks, "f32");
      const varN = `w_${sanitizeNodeId(node.id)}`;
      lines.push(`let ${varN}_p = ${p};`);
      lines.push(`let ${varN}_oct = i32(clamp(floor(${oct}), 1.0, 12.0));`);
      lines.push(`let ${varN}_sc = 1.0 + (f32(${varN}_oct) - 1.0) * 0.08;`);
      lines.push(`let ${varN}_ox = np_os2(${varN}_p.x * ${fq} * 0.3, ${varN}_p.y * ${fq} * 0.3, ${sd});`);
      lines.push(`let ${varN}_oy = np_os2(${varN}_p.y * ${fq} * 0.37 + 11.0, ${varN}_p.z * ${fq} * 0.29, ${sd});`);
      lines.push(`let ${varN}_oz = np_os2(${varN}_p.x * ${fq} * 0.41, ${varN}_p.z * ${fq} * 0.33 + 3.0, ${sd});`);
      lines.push(`let ${varN}_w = ${st} * ${varN}_sc;`);
      outMap.set("out", {
        kind: "vec3",
        expr: `vec3f(${varN}_p.x + ${varN}_ox * ${varN}_w, ${varN}_p.y + ${varN}_oy * ${varN}_w, ${varN}_p.z + ${varN}_oz * ${varN}_w)`
      });
    } else if (tid === "scale_position") {
      const p = readPin(node, def, "position", pinLinks, "vec3");
      const sc = readPin(node, def, "scale", pinLinks, "f32");
      outMap.set("out", { kind: "vec3", expr: `${p} * max(${sc}, 1e-6)` });
    } else if (tid === "translate_position") {
      const p = readPin(node, def, "position", pinLinks, "vec3");
      const o = readPin(node, def, "offset", pinLinks, "vec3");
      outMap.set("out", { kind: "vec3", expr: `${p} + ${o}` });
    } else if (tid === "rotate2d") {
      const p = readPin(node, def, "position", pinLinks, "vec3");
      const a = readPin(node, def, "angle", pinLinks, "f32");
      const varN = `rot_${sanitizeNodeId(node.id)}`;
      lines.push(`let ${varN}_c = cos(${a});`);
      lines.push(`let ${varN}_s = sin(${a});`);
      outMap.set("out", {
        kind: "vec3",
        expr: `vec3f(${p}.x * ${varN}_c - ${p}.y * ${varN}_s, ${p}.x * ${varN}_s + ${p}.y * ${varN}_c, ${p}.z)`
      });
    } else if (tid === "add") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `(${a} + ${b})` });
    } else if (tid === "sub") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `(${a} - ${b})` });
    } else if (tid === "mul") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `(${a} * ${b})` });
    } else if (tid === "div") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `select(0.0, ${a} / ${b}, abs(${b}) > 1e-20)` });
    } else if (tid === "min") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `min(${a}, ${b})` });
    } else if (tid === "max") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `max(${a}, ${b})` });
    } else if (tid === "pow") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `pow(${a}, ${b})` });
    } else if (tid === "abs") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `abs(${a})` });
    } else if (tid === "neg") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `(-${a})` });
    } else if (tid === "sqrt") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `select(0.0, sqrt(${a}), ${a} >= 0.0)` });
    } else if (tid === "saturate") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `clamp(${a}, 0.0, 1.0)` });
    } else if (tid === "oneminus") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `(1.0 - ${a})` });
    } else if (tid === "clamp") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const lo = readPin(node, def, "lo", pinLinks, "f32");
      const hi = readPin(node, def, "hi", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `clamp(${a}, ${lo}, ${hi})` });
    } else if (tid === "lerp") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      const t = readPin(node, def, "t", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `mix(${a}, ${b}, ${t})` });
    } else if (tid === "smoothstep") {
      const e0 = readPin(node, def, "e0", pinLinks, "f32");
      const e1 = readPin(node, def, "e1", pinLinks, "f32");
      const x = readPin(node, def, "x", pinLinks, "f32");
      const varN = `ss_${sanitizeNodeId(node.id)}`;
      lines.push(`var ${varN}_t = select(0.0, clamp((${x} - ${e0}) / (${e1} - ${e0}), 0.0, 1.0), abs(${e1} - ${e0}) > 1e-20);`);
      lines.push(`let ${varN}_s = ${varN}_t * ${varN}_t * (3.0 - 2.0 * ${varN}_t);`);
      outMap.set("out", { kind: "f32", expr: `${varN}_s` });
    } else if (tid === "remap") {
      const v = readPin(node, def, "v", pinLinks, "f32");
      const i0 = readPin(node, def, "i0", pinLinks, "f32");
      const i1 = readPin(node, def, "i1", pinLinks, "f32");
      const o0 = readPin(node, def, "o0", pinLinks, "f32");
      const o1 = readPin(node, def, "o1", pinLinks, "f32");
      const varN = `rm_${sanitizeNodeId(node.id)}`;
      lines.push(
        `let ${varN}_t = select(0.0, (${v} - ${i0}) / (${i1} - ${i0}), abs(${i1} - ${i0}) > 1e-20);`
      );
      outMap.set("out", { kind: "f32", expr: `(${o0} + (${o1} - ${o0}) * ${varN}_t)` });
    } else if (tid === "gt") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: `select(0.0, 1.0, ${a} > ${b})` });
    } else if (tid === "select") {
      const a = readPin(node, def, "a", pinLinks, "f32");
      const b = readPin(node, def, "b", pinLinks, "f32");
      const t = readPin(node, def, "t", pinLinks, "f32");
      const thIdx = addParamSlot({ kind: "param", nodeId: node.id, key: "threshold" });
      outMap.set("out", {
        kind: "f32",
        expr: `select(${a}, ${b}, ${t} >= g_params.values[${thIdx}])`
      });
    } else if (tid === "output") {
      const v = readPin(node, def, "value", pinLinks, "f32");
      outMap.set("out", { kind: "f32", expr: v });
    } else {
      outMap.set("out", { kind: "f32", expr: "0.0" });
      errors.push({
        code: "unsupported_node",
        message: `Unsupported node type for GPU: ${tid}`,
        nodeId: node.id
      });
    }
  }

  const odef = registry.get("output");
  const outLink = linkToInput(outN, graph.links, "value");
  let outputExpr = "0.0";
  if (outLink) {
    const m = pinVals.get(outLink.from.nodeId);
    const v = m?.get(outLink.from.pinId);
    if (v && v.kind === "f32") {
      outputExpr = v.expr;
    }
  } else if (outN.pinDefaults && typeof outN.pinDefaults.value === "number") {
    const idx = addParamSlot({ kind: "scalarPin", nodeId: outN.id, pinId: "value" });
    outputExpr = `g_params.values[${idx}]`;
  } else if (odef) {
    const idx = addParamSlot({ kind: "scalarPin", nodeId: outN.id, pinId: "value" });
    lines.push(`/* default out */`);
    outputExpr = `g_params.values[${idx}]`;
  }

  const ok = errors.length === 0;
  return {
    ok,
    wgslBody: lines.join("\n"),
    paramCount,
    paramSlots,
    errors,
    outputExpr
  };
}

/**
 * @param {import("../graph/types.js").NoiseGraph} graph
 * @param {import("../graph/registry.js").NodeRegistry} registry
 */
export function buildHeightShaderWgsl(graph, registry) {
  const c = compileGraphHeightBody(graph, registry);
  if (!c.ok) {
    return { ok: false, fullWgsl: "", paramCount: 0, errors: c.errors, paramSlots: c.paramSlots };
  }
  const struct = `
struct GlobalU {
  ctx_time: f32,
  ctx_seed: f32,
  amp_mesh: f32,
  height_off: f32,
  off_x: f32,
  off_y: f32,
  off_z: f32,
  slice_z: f32,
  animate: f32,
  time_speed: f32,
  pad0: f32,
  pad1: f32,
};
struct ParamsU {
  values: array<f32, ${MAX_PARAMS}>,
};
@group(0) @binding(0) var<uniform> g_global: GlobalU;
@group(0) @binding(1) var<uniform> g_params: ParamsU;
`;
  const fn = `
fn eval_graph_height(world_x: f32, world_y: f32) -> f32 {
  let ctx_x = world_x + g_global.off_x;
  let ctx_y = world_y + g_global.off_y;
  let ctx_z = g_global.slice_z + select(0.0, g_global.ctx_time * g_global.time_speed, g_global.animate > 0.5) + g_global.off_z;
  let ctx_time = select(0.0, g_global.ctx_time * g_global.time_speed, g_global.animate > 0.5);
  let ctx_seed = g_global.ctx_seed;
${c.wgslBody.split("\n").map((l) => (l ? "  " + l : "")).join("\n")}
  let raw = ${c.outputExpr};
  return raw * g_global.amp_mesh + g_global.height_off;
}
`;
  const full = `${WGSL_NOISE_LIB}\n${struct}\n${fn}\n`;
  return {
    ok: c.ok,
    fullWgsl: full,
    paramCount: c.paramCount,
    errors: c.errors,
    paramSlots: c.paramSlots
  };
}

/**
 * Fill `g_params.values` from graph (same slot order as compile).
 * @param {Float32Array} dst length >= paramCount
 * @param {import("../graph/types.js").NoiseGraph} graph
 * @param {import("../graph/registry.js").NodeRegistry} registry
 */
export function fillGraphParamBuffer(dst, graph, registry) {
  const c = compileGraphHeightBody(graph, registry);
  return fillGraphParamBufferFromSlots(dst, graph, registry, c.ok ? c.paramSlots : []);
}

/**
 * Fill `g_params.values` from a previously compiled slot layout.
 * @param {Float32Array} dst
 * @param {import("../graph/types.js").NoiseGraph} graph
 * @param {import("../graph/registry.js").NodeRegistry} registry
 * @param {ParamSlot[]} paramSlots
 */
export function fillGraphParamBufferFromSlots(dst, graph, registry, paramSlots) {
  if (!paramSlots.length) {
    return 0;
  }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  let i = 0;
  for (const slot of paramSlots) {
    const node = nodeById.get(slot.nodeId);
    if (!node) {
      dst[i++] = 0;
      continue;
    }
    const def = registry.get(node.typeId);
    if (slot.kind === "param") {
      const v = /** @type {any} */ (node.params)[slot.key];
      dst[i++] = typeof v === "number" && Number.isFinite(v) ? v : 0;
    } else if (slot.kind === "scalarPin") {
      if (!def) {
        dst[i++] = 0;
        continue;
      }
      dst[i++] = scalarDefault(node, def, slot.pinId);
    } else {
      if (!def) {
        dst[i++] = 0;
        continue;
      }
      const v3 = vec3Default(node, def, slot.pinId);
      const ax = slot.axis || "x";
      dst[i++] = ax === "x" ? v3.x : ax === "y" ? v3.y : v3.z;
    }
  }
  return i;
}
