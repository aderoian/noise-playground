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

  const viewMode = s.rendererViewMode;
  s.rendererViewMode = viewMode === "complex" ? "complex" : "simple";
  s.chunkRadius = Math.max(0, Math.min(12, Math.floor(Number(s.chunkRadius) || 0)));
  s.defaultChunkResolution = Math.max(
    8,
    Math.min(512, Math.floor(Number(s.defaultChunkResolution) || 192))
  );
  s.minLodResolution = Math.max(2, Math.min(256, Math.floor(Number(s.minLodResolution) || 8)));
  s.chunkWorldSize = clamp01(
    Number.isFinite(s.chunkWorldSize) ? Number(s.chunkWorldSize) : 0.4,
    0.05,
    10.0
  );
  s.lodEnabled = Boolean(s.lodEnabled);
  s.maxChunkRebuildsPerFrame = Math.max(1, Math.min(32, Math.floor(Number(s.maxChunkRebuildsPerFrame) || 3)));
  s.heightOffset = clamp01(
    Number.isFinite(s.heightOffset) ? s.heightOffset : 0.0,
    -50.0,
    50.0
  );
  s.debugShowChunkBorders = Boolean(s.debugShowChunkBorders);
  s.debugShowChunkCoords = Boolean(s.debugShowChunkCoords);
  s.debugColorByLod = Boolean(s.debugColorByLod);
  s.debugShowRendererStats = s.debugShowRendererStats !== false;
  s.chunkReloadSeq = Math.max(0, Math.floor(Number(s.chunkReloadSeq) || 0));
  if (!s.flyCamera || typeof s.flyCamera !== "object") {
    s.flyCamera = { x: 0, y: 0, z: 1.2, yaw: 0, pitch: -0.35 };
  } else {
    s.flyCamera = {
      x: clamp01(Number(s.flyCamera.x) || 0, -1e6, 1e6),
      y: clamp01(Number(s.flyCamera.y) || 0, -1e6, 1e6),
      z: clamp01(Number(s.flyCamera.z) || 1.2, 0.1, 500.0),
      yaw: Number(s.flyCamera.yaw) || 0,
      pitch: clamp01(Number(s.flyCamera.pitch) || 0, -1.2, 1.2)
    };
  }
  if (s.minLodResolution > s.defaultChunkResolution) {
    s.minLodResolution = s.defaultChunkResolution;
  }
  s.meshSegments = s.defaultChunkResolution;
}
