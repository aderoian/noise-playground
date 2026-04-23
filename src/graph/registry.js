import { sampleBase, sampleFractal, worley2D, makeSimplex2D } from "./noiseCpu.js";
import { PinKind } from "./types.js";

/**
 * @typedef {import("./evaluate.js").WireValue} WireValue
 * @typedef {import("./types.js").GraphNode} GraphNode
 * @typedef {import("./types.js").EvalContext} EvalContext
 * @typedef {(ctx: EvalContext, node: GraphNode, getInput: (id: string) => WireValue | undefined) => Map<string, WireValue>} NodeEval
 */

/**
 * @param {WireValue | undefined} w
 * @returns {number}
 */
export function readScalar(w) {
  if (!w || w.kind !== "scalar" || w.s === undefined) {
    return 0;
  }
  return w.s;
}

/**
 * @param {WireValue | undefined} w
 * @returns {{x:number,y:number,z:number}}
 */
export function readVec3(w) {
  if (w && w.kind === "vec3" && w.v3) {
    return { x: w.v3.x, y: w.v3.y, z: w.v3.z };
  }
  return { x: 0, y: 0, z: 0 };
}

/**
 * @param {WireValue | undefined} w
 * @returns {{x:number,y:number}}
 */
export function readVec2(w) {
  if (w && w.kind === "vec2" && w.v2) {
    return { x: w.v2.x, y: w.v2.y };
  }
  return { x: 0, y: 0 };
}

/**
 * @param {string} s
 * @param {string[]} allowed
 * @param {string} fallback
 */
function pickEnum(s, allowed, fallback) {
  return allowed.includes(/** @type {any} */ (s)) ? s : fallback;
}

export class NodeRegistry {
  constructor() {
    /** @type {Map<string, import("./types.js").NodeTypeDef & { eval?: NodeEval }>} */
    this._types = new Map();
  }

  /**
   * @param {import("./types.js").NodeTypeDef & { eval?: NodeEval }} def
   */
  register(def) {
    this._types.set(def.typeId, def);
  }

  /**
   * @param {string} typeId
   */
  get(typeId) {
    return this._types.get(typeId);
  }

  /**
   * @param {string} typeId
   */
  has(typeId) {
    return this._types.has(typeId);
  }

  all() {
    return [...this._types.values()];
  }
}

/**
 * @returns {NodeRegistry}
 */
export function createBuiltinRegistry() {
  const r = new NodeRegistry();

  r.register({
    typeId: "pos_x",
    label: "Position X",
    category: "Input",
    inputs: [],
    outputs: [{ id: "out", name: "X", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx) => {
      return new Map([["out", { kind: "scalar", s: ctx.x }]]);
    }
  });
  r.register({
    typeId: "pos_y",
    label: "Position Y",
    category: "Input",
    inputs: [],
    outputs: [{ id: "out", name: "Y", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx) => new Map([["out", { kind: "scalar", s: ctx.y }]])
  });
  r.register({
    typeId: "pos_z",
    label: "Position Z",
    category: "Input",
    inputs: [],
    outputs: [{ id: "out", name: "Z", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx) => new Map([["out", { kind: "scalar", s: ctx.z }]])
  });
  r.register({
    typeId: "context_position",
    label: "Vector3 Position",
    category: "Input",
    inputs: [],
    outputs: [{ id: "out", name: "Position", kind: PinKind.Vec3 }],
    defaultParams: {},
    eval: (ctx) =>
      new Map([["out", { kind: "vec3", v3: { x: ctx.x, y: ctx.y, z: ctx.z } }]])
  });
  r.register({
    typeId: "time",
    label: "Time",
    category: "Input",
    inputs: [],
    outputs: [{ id: "out", name: "Time", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx) => new Map([["out", { kind: "scalar", s: ctx.time }]])
  });
  r.register({
    typeId: "seed",
    label: "Seed",
    category: "Input",
    inputs: [],
    outputs: [{ id: "out", name: "Seed", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx) => new Map([["out", { kind: "scalar", s: ctx.seed }]])
  });
  r.register({
    typeId: "constant",
    label: "Constant",
    category: "Input",
    inputs: [],
    outputs: [{ id: "out", name: "Value", kind: PinKind.Scalar }],
    defaultParams: { value: 0.5 },
    eval: (ctx, node) => {
      const v = Number(node.params.value ?? 0.5);
      return new Map([["out", { kind: "scalar", s: v }]]);
    }
  });

  // compose vec3 from scalars
  r.register({
    typeId: "compose_vec3",
    label: "Combine XYZ",
    category: "Input",
    inputs: [
      { id: "x", name: "X", kind: PinKind.Scalar, default: 0 },
      { id: "y", name: "Y", kind: PinKind.Scalar, default: 0 },
      { id: "z", name: "Z", kind: PinKind.Scalar, default: 0 }
    ],
    outputs: [{ id: "out", name: "Vector", kind: PinKind.Vec3 }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      const x = readScalar(g("x"));
      const y = readScalar(g("y"));
      const z = readScalar(g("z"));
      return new Map([["out", { kind: "vec3", v3: { x, y, z } }]]);
    }
  });

  r.register({
    typeId: "swizzle",
    label: "Vector Component",
    category: "Input",
    inputs: [{ id: "v", name: "Vector", kind: PinKind.Vec3 }],
    outputs: [{ id: "out", name: "Scalar", kind: PinKind.Scalar }],
    defaultParams: { component: 0 },
    eval: (ctx, node, g) => {
      void ctx;
      const v3 = readVec3(g("v"));
      const c = Math.max(0, Math.min(2, Math.floor(Number(node.params.component) || 0)));
      const s = c === 0 ? v3.x : c === 1 ? v3.y : v3.z;
      return new Map([["out", { kind: "scalar", s }]]);
    }
  });

  // --- Noise (single) ---
  function registerNoise(
    typeId,
    label,
    kind
  ) {
    r.register({
      typeId,
      label,
      category: "Noise",
      inputs: [
        { id: "position", name: "Position", kind: PinKind.Vec3 },
        { id: "frequency", name: "Frequency", kind: PinKind.Scalar, default: 1 },
        { id: "amplitude", name: "Amplitude", kind: PinKind.Scalar, default: 1 },
        { id: "seed", name: "Seed", kind: PinKind.Scalar, default: 0 },
        { id: "jitter", name: "Jitter", kind: PinKind.Scalar, default: 0.5 },
        { id: "cellMetric", name: "Cell metric", kind: PinKind.Scalar, default: 0 },
        { id: "cellReturn", name: "Cell return", kind: PinKind.Scalar, default: 0 },
        { id: "normalize", name: "Normalize", kind: PinKind.Scalar, default: 0 }
      ],
      outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
      defaultParams: {},
      eval: (ctx, node, g) => {
        void ctx;
        void node;
        const p = readVec3(g("position"));
        const f = readScalar(g("frequency")) || 1e-6;
        const a = readScalar(g("amplitude"));
        const s = readScalar(g("seed"));
        const j = readScalar(g("jitter")) || 0.5;
        const cm = Math.floor(readScalar(g("cellMetric")) || 0);
        const cr = Math.floor(readScalar(g("cellReturn")) || 0);
        const cell = { jitter: j, cellMetric: cm, cellReturn: cr };
        const px = p.x * f;
        const py = p.y * f;
        const pz = p.z * f;
        let n =
          typeId === "noise_worley" || kind === "worley"
            ? worley2D(px, py, j, cm, cr)
            : sampleBase(
                kind,
                px,
                py,
                pz,
                s,
                cell
              );
        if (readScalar(g("normalize")) > 0.5) {
          n = n * 0.5 + 0.5;
        }
        return new Map([["out", { kind: "scalar", s: n * a }]]);
      }
    });
  }
  registerNoise("noise_white", "White Noise", "white");
  registerNoise("noise_value", "Value Noise", "value");
  registerNoise("noise_perlin", "Perlin Noise", "perlin");
  registerNoise("noise_simplex", "Simplex Noise", "simplex2");
  registerNoise("noise_os2", "OpenSimplex", "os2");
  registerNoise("noise_worley", "Worley / Cellular", "worley");

  // Fractal variants: re-use sampleFractal
  function registerFractal(
    typeId,
    label,
    fractal
  ) {
    r.register({
      typeId,
      label,
      category: "Fractal",
      inputs: [
        { id: "position", name: "Position", kind: PinKind.Vec3 },
        { id: "frequency", name: "Frequency", kind: PinKind.Scalar, default: 1 },
        { id: "amplitude", name: "Amplitude", kind: PinKind.Scalar, default: 1 },
        { id: "seed", name: "Seed", kind: PinKind.Scalar, default: 0 },
        { id: "octaves", name: "Octaves", kind: PinKind.Scalar, default: 4 },
        { id: "lacunarity", name: "Lacunarity", kind: PinKind.Scalar, default: 2 },
        { id: "gain", name: "Gain", kind: PinKind.Scalar, default: 0.5 },
        { id: "jitter", name: "Jitter", kind: PinKind.Scalar, default: 0.5 },
        { id: "cellMetric", name: "Cell metric", kind: PinKind.Scalar, default: 0 },
        { id: "cellReturn", name: "Cell return", kind: PinKind.Scalar, default: 0 }
      ],
      outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
      defaultParams: {
        base: "os2"
      },
      eval: (ctx, node, g) => {
        void ctx;
        const p = readVec3(g("position"));
        const f = readScalar(g("frequency")) || 1e-6;
        const a = readScalar(g("amplitude"));
        const base = pickEnum(String(node.params.base), ["value", "perlin", "simplex2", "os2", "white", "worley"], "os2");
        const s = readScalar(g("seed"));
        const o = {
          fractal,
          octaves: Math.max(1, Math.floor(readScalar(g("octaves")) || 1)),
          lacunarity: readScalar(g("lacunarity")) || 2,
          gain: readScalar(g("gain")) || 0.5,
          cell: {
            jitter: readScalar(g("jitter")) || 0.5,
            cellMetric: Math.floor(readScalar(g("cellMetric")) || 0),
            cellReturn: Math.floor(readScalar(g("cellReturn")) || 0)
          }
        };
        const px = p.x * f;
        const py = p.y * f;
        const pz = p.z * f;
        const n = sampleFractal(base, px, py, pz, s, o);
        return new Map([["out", { kind: "scalar", s: n * a }]]);
      }
    });
  }
  registerFractal("fbm", "FBM", "fbm");
  registerFractal("billow", "Billow", "billow");
  registerFractal("ridged", "Ridged Multifractal", "ridged");
  registerFractal("turbulence", "Turbulence", "turbulence");

  r.register({
    typeId: "domain_warp",
    label: "Domain Warp",
    category: "Domain",
    inputs: [
      { id: "position", name: "Position", kind: PinKind.Vec3 },
      { id: "strength", name: "Strength", kind: PinKind.Scalar, default: 0.1 },
      { id: "frequency", name: "Frequency", kind: PinKind.Scalar, default: 1 },
      { id: "seed", name: "Seed", kind: PinKind.Scalar, default: 0 },
      { id: "octaves", name: "Octaves", kind: PinKind.Scalar, default: 1 }
    ],
    outputs: [{ id: "out", name: "Warped", kind: PinKind.Vec3 }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const p = readVec3(g("position"));
      const st = readScalar(g("strength"));
      const fq = readScalar(g("frequency")) || 1e-6;
      const s = readScalar(g("seed"));
      const oct = Math.max(1, Math.min(12, Math.floor(readScalar(g("octaves")) || 1)));
      const octScale = 1 + (oct - 1) * 0.08;
      const o = makeSimplex2D((s * 0.001) | 0);
      const ox = o(p.x * fq * 0.3, p.y * fq * 0.3);
      const oy = o(p.y * fq * 0.37 + 11.0, p.z * fq * 0.29);
      const oz = o(p.x * fq * 0.41, p.z * fq * 0.33 + 3.0);
      const w = st * octScale;
      return new Map([
        [
          "out",
          {
            kind: "vec3",
            v3: { x: p.x + ox * w, y: p.y + oy * w, z: p.z + oz * w }
          }
        ]
      ]);
    }
  });

  r.register({
    typeId: "scale_position",
    label: "Scale Coordinates",
    category: "Domain",
    inputs: [
      { id: "position", name: "Position", kind: PinKind.Vec3 },
      { id: "scale", name: "Scale", kind: PinKind.Scalar, default: 1 }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Vec3 }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const p = readVec3(g("position"));
      const sc = readScalar(g("scale")) || 1;
      return new Map([["out", { kind: "vec3", v3: { x: p.x * sc, y: p.y * sc, z: p.z * sc } }]]);
    }
  });
  r.register({
    typeId: "translate_position",
    label: "Translate Coordinates",
    category: "Domain",
    inputs: [
      { id: "position", name: "Position", kind: PinKind.Vec3 },
      {
        id: "offset",
        name: "Offset",
        kind: PinKind.Vec3,
        default: { x: 0, y: 0, z: 0 }
      }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Vec3 }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const p = readVec3(g("position"));
      const o = readVec3(g("offset"));
      return new Map([["out", { kind: "vec3", v3: { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z } }]]);
    }
  });
  r.register({
    typeId: "rotate2d",
    label: "Rotate 2D",
    category: "Domain",
    inputs: [
      { id: "position", name: "Position", kind: PinKind.Vec3 },
      { id: "angle", name: "Angle (rad)", kind: PinKind.Scalar, default: 0 }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Vec3 }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const p = readVec3(g("position"));
      const a = readScalar(g("angle"));
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = p.x * c - p.y * s;
      const y = p.x * s + p.y * c;
      return new Map([["out", { kind: "vec3", v3: { x, y, z: p.z } }]]);
    }
  });

  // Math
  const bin = (op) => (a, b) => {
    if (op === "add") {
      return a + b;
    }
    if (op === "sub") {
      return a - b;
    }
    if (op === "mul") {
      return a * b;
    }
    if (op === "div") {
      return b === 0 ? 0 : a / b;
    }
    if (op === "min") {
      return Math.min(a, b);
    }
    if (op === "max") {
      return Math.max(a, b);
    }
    if (op === "pow") {
      return Math.pow(a, b);
    }
    return 0;
  };
  for (const [typeId, label, op] of /** @type {const} */ ([
    ["add", "Add", "add"],
    ["sub", "Subtract", "sub"],
    ["mul", "Multiply", "mul"],
    ["div", "Divide", "div"],
    ["min", "Min", "min"],
    ["max", "Max", "max"],
    ["pow", "Power", "pow"]
  ])) {
    r.register({
      typeId,
      label,
      category: "Math",
      inputs: [
        { id: "a", name: "A", kind: PinKind.Scalar, default: 0 },
        { id: "b", name: "B", kind: PinKind.Scalar, default: 0 }
      ],
      outputs: [{ id: "out", name: "Result", kind: PinKind.Scalar }],
      defaultParams: {},
      eval: (ctx, node, g) => {
        void ctx;
        void node;
        const fn = bin(/** @type {any} */ (op));
        return new Map([["out", { kind: "scalar", s: fn(readScalar(g("a")), readScalar(g("b"))) }]]);
      }
    });
  }
  for (const [typeId, label, f] of /** @type {const} */ [
    ["abs", "Abs", (x) => Math.abs(x)],
    ["neg", "Negate", (x) => -x],
    ["sqrt", "Square Root", (x) => (x < 0 ? 0 : Math.sqrt(x))],
    ["saturate", "Saturate", (x) => Math.max(0, Math.min(1, x))],
    ["oneminus", "One Minus", (x) => 1 - x]
  ]) {
    r.register({
      typeId,
      label,
      category: "Math",
      inputs: [{ id: "a", name: "In", kind: PinKind.Scalar, default: 0 }],
      outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
      defaultParams: {},
      eval: (ctx, node, g) => {
        void ctx;
        void node;
        return new Map([["out", { kind: "scalar", s: f(readScalar(g("a"))) }]]);
      }
    });
  }
  r.register({
    typeId: "clamp",
    label: "Clamp",
    category: "Math",
    inputs: [
      { id: "a", name: "Value", kind: PinKind.Scalar, default: 0 },
      { id: "lo", name: "Min", kind: PinKind.Scalar, default: 0 },
      { id: "hi", name: "Max", kind: PinKind.Scalar, default: 1 }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const a = readScalar(g("a"));
      const lo = readScalar(g("lo"));
      const hi = readScalar(g("hi"));
      return new Map([["out", { kind: "scalar", s: Math.max(lo, Math.min(hi, a)) }]]);
    }
  });
  r.register({
    typeId: "lerp",
    label: "Lerp",
    category: "Math",
    inputs: [
      { id: "a", name: "A", kind: PinKind.Scalar, default: 0 },
      { id: "b", name: "B", kind: PinKind.Scalar, default: 1 },
      { id: "t", name: "T", kind: PinKind.Scalar, default: 0.5 }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const a = readScalar(g("a"));
      const b = readScalar(g("b"));
      const t = readScalar(g("t"));
      return new Map([["out", { kind: "scalar", s: a + (b - a) * t }]]);
    }
  });
  r.register({
    typeId: "smoothstep",
    label: "Smoothstep",
    category: "Math",
    inputs: [
      { id: "e0", name: "Edge0", kind: PinKind.Scalar, default: 0 },
      { id: "e1", name: "Edge1", kind: PinKind.Scalar, default: 1 },
      { id: "x", name: "X", kind: PinKind.Scalar, default: 0.5 }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const e0 = readScalar(g("e0"));
      const e1 = readScalar(g("e1"));
      const x = readScalar(g("x"));
      const t = e1 === e0 ? 0 : Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      const s = t * t * (3 - 2 * t);
      return new Map([["out", { kind: "scalar", s }]]);
    }
  });
  r.register({
    typeId: "remap",
    label: "Remap Range",
    category: "Math",
    inputs: [
      { id: "v", name: "Value", kind: PinKind.Scalar, default: 0 },
      { id: "i0", name: "In Min", kind: PinKind.Scalar, default: -1 },
      { id: "i1", name: "In Max", kind: PinKind.Scalar, default: 1 },
      { id: "o0", name: "Out Min", kind: PinKind.Scalar, default: 0 },
      { id: "o1", name: "Out Max", kind: PinKind.Scalar, default: 1 }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const v = readScalar(g("v"));
      const i0 = readScalar(g("i0"));
      const i1 = readScalar(g("i1"));
      const o0 = readScalar(g("o0"));
      const o1 = readScalar(g("o1"));
      const t = i1 === i0 ? 0 : (v - i0) / (i1 - i0);
      return new Map([["out", { kind: "scalar", s: o0 + (o1 - o0) * t }]]);
    }
  });
  r.register({
    typeId: "gt",
    label: "Greater Than",
    category: "Math",
    inputs: [
      { id: "a", name: "A", kind: PinKind.Scalar, default: 0 },
      { id: "b", name: "B", kind: PinKind.Scalar, default: 0 }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      return new Map([["out", { kind: "scalar", s: readScalar(g("a")) > readScalar(g("b")) ? 1 : 0 }]]);
    }
  });
  r.register({
    typeId: "select",
    label: "Select",
    category: "Math",
    inputs: [
      { id: "a", name: "A", kind: PinKind.Scalar, default: 0 },
      { id: "b", name: "B", kind: PinKind.Scalar, default: 0 },
      { id: "t", name: "T", kind: PinKind.Scalar, default: 0.5 }
    ],
    outputs: [{ id: "out", name: "Out", kind: PinKind.Scalar }],
    defaultParams: { threshold: 0.5 },
    eval: (ctx, node, g) => {
      void ctx;
      const t = readScalar(g("t"));
      const th = Number(node.params.threshold) ?? 0.5;
      return new Map([["out", { kind: "scalar", s: t >= th ? readScalar(g("b")) : readScalar(g("a")) }]]);
    }
  });

  r.register({
    typeId: "output",
    label: "Output",
    category: "Output",
    inputs: [{ id: "value", name: "Value", kind: PinKind.Scalar, default: 0 }],
    outputs: [],
    defaultParams: {},
    eval: (ctx, node, g) => {
      void ctx;
      void node;
      const v = g("value");
      const s = readScalar(v);
      return new Map();
    }
  });

  return r;
}
