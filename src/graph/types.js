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
 * @typedef {"indexed" | "weighted"} BiomeSelectionMode
 */

/**
 * @typedef {object} BiomeDef
 * @property {string} id Stable id (do not tie to display name)
 * @property {string} name
 * @property {string} colorHex e.g. #5BA85B
 * @property {number} heightScale
 * @property {number} heightOffset
 * @property {number} weight Used in weighted mode (sum need not be 1; normalized at eval)
 * @property {number} rangeStart Indexed mode 0..1
 * @property {number} rangeEnd Indexed mode 0..1
 * @property {number} blendHardness Per-biome edge sharpness factor
 * @property {NoiseGraph} terrainGraph
 */

/**
 * @typedef {object} BiomeProject
 * @property {number} globalSeed
 * @property {BiomeSelectionMode} selectionMode
 * @property {number} blendWidth How far (0..1 placement space) transitions blend
 * @property {number} blendHardness Global curve sharpness
 * @property {number} placementScale World XY scale for placement sampling
 * @property {number} placementSeed Added to eval context seed for placement graph
 * @property {number} contrast Placement value contrast (post-normalize)
 * @property {string} outputMode Preset label for UI: height | color | blended | debug
 * @property {NoiseGraph} placementGraph
 * @property {BiomeDef[]} biomes
 */

/**
 * @typedef {object} TerrainSample
 * @property {number} height World Z after mesh scaling
 * @property {number} colorR
 * @property {number} colorG
 * @property {number} colorB
 * @property {number} biomeId Index of dominant biome, or -1
 * @property {Float32Array | number[]} biomeWeights Length = biomes.length
 * @property {number} placementRaw Raw placement before normalize (debug)
 * @property {number} placementU Placement in 0..1 (debug)
 */

/**
 * @typedef {object} NoiseGraph
 * @property {string} id
 * @property {string} name
 * @property {number} version
 * @property {GraphNode[]} nodes
 * @property {GraphLink[]} links
 * @property {string} [outputNodeId]
 * @property {BiomeProject} [biomeProject] Optional biomes + placement; main nodes may still define classic scalar output when useBiomes is off
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

export const ASSET_VERSION = 3;
