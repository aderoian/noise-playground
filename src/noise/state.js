import { createDefaultState, normalizeRenderPresetKey } from "./defaults.js";

export function createNoiseState() {
  return createDefaultState();
}

/**
 * @param {number} x
 * @param {number} a
 * @param {number} b
 */
function clamp01(x, a, b) {
  if (x < a) {
    return a;
  }
  if (x > b) {
    return b;
  }
  return x;
}

/**
 * @param {object} s
 */
export function validateAndNormalize(s) {
  s.seed = Math.floor(s.seed) | 0;
  s.octaves = Math.floor(clamp01(s.octaves, 1, 8));
  s.lacunarity = clamp01(s.lacunarity, 0.1, 32.0);
  s.gain = clamp01(s.gain, 0.01, 1.0);
  s.frequency = clamp01(s.frequency, 0.001, 100.0);
  s.amplitude = clamp01(s.amplitude, 0.0, 10.0);
  s.offset.x = clamp01(s.offset.x, -1e6, 1e6);
  s.offset.y = clamp01(s.offset.y, -1e6, 1e6);
  s.offset.z = clamp01(s.offset.z, -1e6, 1e6);
  s.worldScale = clamp01(s.worldScale, 0.1, 20.0);
  s.jitter = clamp01(s.jitter, 0.0, 1.0);
  s.rigidExp = clamp01(s.rigidExp, 0.1, 8.0);
  s.rigidWeight = clamp01(s.rigidWeight, 0.0, 2.0);
  s.sliceZ = clamp01(s.sliceZ, -50, 50);
  s.contrast = clamp01(s.contrast, 0.1, 5.0);
  s.brightness = clamp01(s.brightness, -0.5, 0.5);
  s.timeSpeed = clamp01(s.timeSpeed, 0, 5.0);
  s.meshHeight = clamp01(
    Number.isFinite(s.meshHeight) ? s.meshHeight : 0.35,
    0.02,
    3.0
  );
  s.meshWireframe = Boolean(s.meshWireframe);
  s.useGraph = Boolean(s.useGraph);
  s.graphKey = Math.max(0, Math.floor(Number(s.graphKey) || 0));
  s.graphRevision = Math.max(0, Math.floor(Number(s.graphRevision) || 0));
  s.graphBakeW = Math.max(8, Math.min(1024, Math.floor(s.graphBakeW) || 128));
  s.graphBakeH = Math.max(8, Math.min(1024, Math.floor(s.graphBakeH) || 128));
  s.renderPreset = normalizeRenderPresetKey(/** @type {string} */ (s.renderPreset));
  s.cameraZoom = clamp01(
    Number.isFinite(s.cameraZoom) ? Number(s.cameraZoom) : 1.0,
    0.25,
    4.0
  );
  s.meshSegments = Math.max(8, Math.min(512, Math.floor(s.meshSegments) || 192));
  s.orientation = s.orientation ? 1 : 0;
  s.cellMetric = (s.cellMetric | 0) % 3;
  s.cellReturn = (s.cellReturn | 0) % 3;
}
