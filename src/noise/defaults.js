import { makeNoise2D } from "open-simplex-noise";

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
    colorRamp: "gray", // gray | heat | terrain
    animate: false,
    timeSpeed: 0.25,
    /** Exaggeration of Z displacement in 3D mesh (noise already scaled by amplitude) */
    meshHeight: 0.35,
    /** Wireframe overlay on solid terrain */
    meshWireframe: false
  };
}

const BASE_KINDS = { os2: 0, os2s: 1, worley: 2 };
const FRACTAL = { none: 0, fbm: 1, rigid: 2 };
const VIEW = { "2d": 0, slice3d: 1 };
const RAMP = { gray: 0, heat: 1, terrain: 2 };

/**
 * @param {number} seed
 */
function seedToOffset(seed) {
  const s = Number(seed) | 0;
  const a = makeNoise2D(s);
  const t = 10000.0;
  return {
    x: a(19.0, 23.0) * t,
    y: a(-11.0, 17.0) * t,
    z: a(3.0, 9.0) * t
  };
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
  u.uInvert.value = s.invert ? 1 : 0;
  u.uContrast.value = s.contrast;
  u.uBrightness.value = s.brightness;
  u.uRamp.value = RAMP[s.colorRamp] ?? 0;
  u.uTime.value = s.animate ? time * s.timeSpeed : 0.0;
  u.uMeshHeight.value = s.meshHeight;
}
