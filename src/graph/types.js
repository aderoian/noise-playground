/**
 * @typedef {"Scalar" | "Vec2" | "Vec3"} PinKind
 */

/** @type {const} */
export const PinKind = {
  Scalar: "Scalar",
  Vec2: "Vec2",
  Vec3: "Vec3"
};

/**
 * @typedef {object} GraphPinDef
 * @property {string} id
 * @property {string} name
 * @property {PinKind} kind
 * @property {number | {x:number,y?:number,z?:number} | {x:number,y:number}} [default] scalar or vec default
 */

/**
 * @typedef {object} NodeTypeDef
 * @property {string} typeId
 * @property {string} label
 * @property {string} category
 * @property {GraphPinDef[]} inputs
 * @property {GraphPinDef[]} outputs
 * @property {Record<string, number | boolean | string>} defaultParams
 */

/**
 * @typedef {object} GraphNode
 * @property {string} id
 * @property {string} typeId
 * @property {number} x
 * @property {number} y
 * @property {Record<string, number | boolean | string | {x?:number,y?:number,z?:number}>} params
 * @property {Record<string, number | {x?:number,y?:number} | {x?:number,y?:number,z?:number}>} [pinDefaults] unlinked input literal per pin id
 * @property {object} [ui] collapsed, etc.
 * @property {boolean} [isUnknown] loaded unknown type
 */

/**
 * @typedef {object} GraphLink
 * @property {string} id
 * @property {{ nodeId: string, pinId: string }} from
 * @property {{ nodeId: string, pinId: string }} to
 */

/**
 * @typedef {object} NoiseGraph
 * @property {string} id
 * @property {string} name
 * @property {number} version
 * @property {GraphNode[]} nodes
 * @property {GraphLink[]} links
 * @property {string} [outputNodeId]
 */

/**
 * @typedef {object} EvalContext
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} time
 * @property {number} seed
 */

/**
 * Precomputed graph for hot-path evaluation (compile once, sample many).
 * @typedef {object} CompiledGraph
 * @property {NoiseGraph} graph
 * @property {string[]} order
 * @property {CompiledGraphStep[]} steps
 * @property {OutputResolveSpec} outResolve
 */

/**
 * @typedef {object} CompiledGraphStep
 * @property {GraphNode} node
 * @property {import("./registry.js").NodeDef | null} def
 * @property {boolean} isUnknown
 * @property {Map<string, { fromNodeId: string, fromPin: string }>} pinLinks
 */

/**
 * @typedef {object} OutputResolveSpec
 * @property {"fromLink"} [type] link from a node to output
 * @property {string} [fromNodeId]
 * @property {string} [fromPin]
 * @property {number} [v] const scalar
 * @property {"const"} [type]
 * @property {"nan"} [type] invalid
 */

/**
 * @typedef {object} ValidationIssue
 * @property {"error" | "warning"} level
 * @property {string} code
 * @property {string} message
 * @property {string} [nodeId]
 * @property {string} [linkId]
 */

export const ASSET_VERSION = 2;
