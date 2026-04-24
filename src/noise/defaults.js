import { makeNoise2D } from "open-simplex-noise";

/**
 * @typedef {object} RenderPresetLook
 * @property {"gray" | "heat" | "terrain"} colorRamp
 * @property {number} contrast
 * @property {number} brightness
 * @property {boolean} invert
 * @property {readonly [number, number, number]} lightDir
 * @property {number} lightAmbient
 * @property {number} lightDiffuse
 */

/** @type {Record<string, RenderPresetLook>} */
export const RENDER_PRESETS = {
  natural: {
    colorRamp: "gray",
    contrast: 1.0,
    brightness: 0.0,
    invert: false,
    lightDir: [0.45, 0.85, 0.4],
    lightAmbient: 0.22,
    lightDiffuse: 0.78
  },
  desert: {
    colorRamp: "terrain",
    contrast: 1.12,
    brightness: 0.05,
    invert: false,
    lightDir: [0.52, 0.72, 0.32],
    lightAmbient: 0.28,
    lightDiffuse: 0.7
  },
  snow: {
    colorRamp: "gray",
    contrast: 1.05,
    brightness: 0.12,
    invert: false,
    lightDir: [0.18, 0.38, 0.9],
    lightAmbient: 0.34,
    lightDiffuse: 0.64
  },
  volcanic: {
    colorRamp: "heat",
    contrast: 1.18,
    brightness: 0.0,
    invert: false,
    lightDir: [0.35, 0.55, 0.76],
    lightAmbient: 0.16,
    lightDiffuse: 0.84
  }
};

export const RENDER_PRESET_KEYS = Object.keys(RENDER_PRESETS);

/**
 * @param {string | undefined} key
 * @returns {keyof typeof RENDER_PRESETS}
 */
export function normalizeRenderPresetKey(key) {
  const k = String(key || "natural");
  return k in RENDER_PRESETS ? k : "natural";
}

/**
 * @param {string | undefined} key
 * @returns {RenderPresetLook}
 */
export function getRenderPresetLook(key) {
  return RENDER_PRESETS[normalizeRenderPresetKey(key)];
}

export function createDefaultState() {
  return {
    seed: 42,
    baseKind: "os2", // os2 | os2s | worley
    orientation: 1, // 0 conventional, 1 improveXY
    fractal: "none", // none | fbm | rigid
    octaves: 5,
    lacunarity: 2.0,
    gain: 0.5,
    /** Same as "persistence" in many tools */
    /** kept separate name from gain for FBM: typically amp *= gain (persistence) */
    frequency: 1.0,
    amplitude: 1.0,
    offset: { x: 0, y: 0, z: 0 },
    worldScale: 1.0,
    jitter: 0.5,
    cellMetric: 0, // 0 euclidean, 1 manhattan, 2 chebyshev
    cellReturn: 0, // 0 f1, 1 f2, 2 f2-f1
    rigidExp: 2.0,
    rigidWeight: 1.0,
    viewMode: "2d", // 2d | slice3d
    sliceZ: 0.0,
    contrast: 1.0,
    brightness: 0.0,
    invert: false,
    colorRamp: "gray", // gray | heat | terrain (subsumed by renderPreset for 3D view)
    /** Color + mild lighting: natural | desert | snow | volcanic */
    renderPreset: "natural",
    /** >1 moves camera closer (zoom in); uses camera, not worldScale */
    cameraZoom: 1.0,
    /** PlaneGeometry subdivisions per side (8–512) */
    meshSegments: 192,
    animate: false,
    timeSpeed: 0.25,
    /** Exaggeration of Z displacement in 3D mesh (noise already scaled by amplitude) */
    meshHeight: 0.35,
    /** Wireframe overlay on solid terrain */
    meshWireframe: false,
    /** When true, height comes from the CPU-baked node graph (see noiseGraph) */
    useGraph: true,
    /** Baked field resolution for graph preview */
    graphBakeW: 128,
    graphBakeH: 128,
    /**
     * Incremented when the graph is edited; renderer rebakes when it changes
     * @type {number}
     */
    graphRevision: 0,
    /**
     * Procedural graph asset (or null)
     * @type {import("../graph/types.js").NoiseGraph | null}
     */
    noiseGraph: null,
    /**
     * Bumped when a graph is loaded from file (remounts the editor)
     * @type {number}
     */
    graphKey: 0,
    // --- Chunked terrain + view modes (renderer overhaul) ---
    /** "simple" = editor pan preview; "complex" = free-fly */
    rendererViewMode: "simple",
    /** Integer radius in chunk units: load chunks whose centers lie within this Euclidean distance of the camera (in chunk space). */
    chunkRadius: 2,
    /** Highest detail mesh resolution (segments per chunk edge) */
    defaultChunkResolution: 192,
    /** World extent of one chunk along X and Y (same units as noise plane w2) */
    chunkWorldSize: 0.4,
    /** When LOD enabled, this is the floor for mesh segments */
    minLodResolution: 8,
    /**
     * Number of LOD bands from view center to chunkRadius (integer ring distance).
     * Band edges use a progressive curve (narrow near camera, wider far); each step halves mesh resolution.
     */
    lodLayerCount: 3,
    lodEnabled: true,
    maxChunkRebuildsPerFrame: 3,
    /** Added to final terrain Z in world (after * meshHeight) */
    heightOffset: 0.0,
    // Fly camera (Z-up, horizontal X/Y). Used when rendererViewMode === "complex"
    flyCamera: {
      x: 0,
      y: 0,
      z: 1.2,
      yaw: 0,
      pitch: -0.35
    },
    // Debug
    debugShowChunkBorders: false,
    debugShowChunkCoords: false,
    debugColorByLod: false,
    debugShowRendererStats: true,
    /** Bumped to force all chunk meshes to rebuild (reset view, etc.) */
    chunkReloadSeq: 0
  };
}

const BASE_KINDS = { os2: 0, os2s: 1, worley: 2 };
const FRACTAL = { none: 0, fbm: 1, rigid: 2 };
const VIEW = { "2d": 0, slice3d: 1 };
const RAMP = { gray: 0, heat: 1, terrain: 2 };

/** @type {Map<number, { x: number, y: number, z: number }>} */
const _seedOffsetCache = new Map();

/**
 * @param {number} seed
 */
/**
 * @param {number} seed
 * @returns {{ x: number, y: number, z: number }}
 */
export function seedToOffset(seed) {
  const s = Number(seed) | 0;
  const hit = _seedOffsetCache.get(s);
  if (hit) {
    return hit;
  }
  const a = makeNoise2D(s);
  const t = 10000.0;
  const o = {
    x: a(19.0, 23.0) * t,
    y: a(-11.0, 17.0) * t,
    z: a(3.0, 9.0) * t
  };
  _seedOffsetCache.set(s, o);
  return o;
}

/**
 * @param {object} s
 * @param {{ width: number, height: number }} param1
 * @param {number} time
 * @param {{ u: Record<string, import("three").IUniform> }} outUniforms
 */
export function stateToUniforms(s, { width, height }, time, out) {
  const u = out.u;
  const aspect = height > 0 ? width / height : 1.0;
  u.uAspect.value = aspect;
  u.uBaseKind.value = BASE_KINDS[s.baseKind] ?? 0;
  u.uOrientation.value = s.orientation | 0;
  u.uFractal.value = FRACTAL[s.fractal] ?? 0;
  u.uOctaves.value = Math.max(1, Math.min(8, Math.floor(s.octaves)));
  u.uLacunarity.value = s.lacunarity;
  u.uGain.value = s.gain;
  u.uWorldScale.value = s.worldScale;
  u.uFrequency.value = s.frequency;
  u.uAmplitude.value = s.amplitude;
  const so = seedToOffset(s.seed);
  u.uOffset.value.set(
    s.offset.x + so.x,
    s.offset.y + so.y,
    s.offset.z + so.z
  );
  u.uJitter.value = s.jitter;
  u.uCellMetric.value = s.cellMetric | 0;
  u.uCellReturn.value = s.cellReturn | 0;
  u.uRigidExp.value = s.rigidExp;
  u.uRigidWeight.value = s.rigidWeight;
  u.uViewMode.value = VIEW[s.viewMode] ?? 0;
  u.uSliceZ.value = s.sliceZ;
  const look = getRenderPresetLook(s.renderPreset);
  u.uInvert.value = look.invert ? 1 : 0;
  u.uContrast.value = look.contrast;
  u.uBrightness.value = look.brightness;
  u.uRamp.value = RAMP[look.colorRamp] ?? 0;
  if (u.uLightDir && u.uLightDir.value && "set" in u.uLightDir.value) {
    u.uLightDir.value.set(look.lightDir[0], look.lightDir[1], look.lightDir[2]);
  }
  if (u.uLightAmbient) {
    u.uLightAmbient.value = look.lightAmbient;
  }
  if (u.uLightDiffuse) {
    u.uLightDiffuse.value = look.lightDiffuse;
  }
  u.uTime.value = s.animate ? time * s.timeSpeed : 0.0;
  u.uMeshHeight.value = s.meshHeight;
  if (u.uUseGraph) {
    u.uUseGraph.value = s.useGraph && s.noiseGraph ? 1 : 0;
  }
}
