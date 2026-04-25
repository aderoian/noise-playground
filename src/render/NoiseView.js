import { createRendererController } from "./terrain/RendererController.js";
import {
  createGpuRendererController,
  isWebGpuTerrainSupported
} from "./terrain/GpuRendererController.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {() => any} getState
 */
export function createNoiseView(canvas, getState) {
  const viewInfo = {};
  /** @type {any} */
  let inner = null;
  let innerMode = "";
  let probeStatus = isWebGpuTerrainSupported() ? "idle" : "failed";
  let probePromise = null;
  /** Bumps when user leaves WebGPU mid-probe so async handlers do not apply stale results. */
  let probeGen = 0;
  let lastBackendPref = "";

  function startProbe() {
    if (!isWebGpuTerrainSupported()) {
      return;
    }
    // Terminal states: do not call requestAdapter again (avoids Chrome spam: "No available adapters").
    if (probeStatus === "pending" || probeStatus === "ready" || probeStatus === "failed") {
      return;
    }
    probeStatus = "pending";
    const gen = ++probeGen;
    probePromise = Promise.race([
      navigator.gpu.requestAdapter({ powerPreference: "high-performance" }),
      new Promise((resolve) => {
        window.setTimeout(() => resolve(null), 1500);
      })
    ])
      .then((adapter) => {
        if (gen !== probeGen) {
          return;
        }
        probeStatus = adapter ? "ready" : "failed";
        window.dispatchEvent(new Event("resize"));
      })
      .catch(() => {
        if (gen !== probeGen) {
          return;
        }
        probeStatus = "failed";
        window.dispatchEvent(new Event("resize"));
      });
  }

  function desiredMode() {
    const pref = getState().terrainBackend;
    if (pref !== lastBackendPref) {
      if (pref === "webgpu") {
        // User explicitly chose WebGPU again — allow a fresh probe.
        probeGen++;
        probeStatus = "idle";
      } else if (lastBackendPref === "webgpu") {
        // Leaving WebGPU (CPU / Auto): cancel any in-flight probe and never re-request until WebGPU is chosen again.
        probeGen++;
        probeStatus = "failed";
      }
      lastBackendPref = pref;
    }

    if (pref === "cpu" || pref === "auto") {
      return "cpu";
    }
    if (pref !== "webgpu") {
      return "cpu";
    }
    startProbe();
    if (probeStatus === "ready") {
      return "webgpu";
    }
    return "cpu";
  }

  function ensureInner() {
    const want = desiredMode();
    if (inner && innerMode === want) {
      return inner;
    }
    inner?.dispose?.();
    inner =
      want === "webgpu"
        ? createGpuRendererController(canvas, getState, () => getState().noiseGraph)
        : createRendererController(canvas, getState, () => getState().noiseGraph);
    innerMode = want;
    return inner;
  }

  return {
    viewInfo,
    renderFrame() {
      let current = ensureInner();
      current.renderFrame();
      Object.assign(viewInfo, current.viewInfo || {});
      const pref = getState().terrainBackend;
      if (!current.viewInfo || !current.viewInfo.backend) {
        viewInfo.backend =
          innerMode === "webgpu"
            ? "webgpu"
            : pref === "cpu"
              ? "cpu"
              : pref === "webgpu" && probeStatus === "failed"
                ? "cpu-fallback"
                : "cpu";
      }
      if (!current.viewInfo || !current.viewInfo.compileStatus) {
        viewInfo.compileStatus =
          innerMode === "webgpu"
            ? "ready"
            : pref === "webgpu" && probeStatus === "pending"
              ? "probing-webgpu"
              : pref === "webgpu" && probeStatus === "failed"
                ? "cpu-fallback"
                : "cpu-ready";
      }
    },
    getLastBakeStats() {
      return ensureInner().getLastBakeStats?.() ?? null;
    },
    dispose() {
      inner?.dispose?.();
      inner = null;
      innerMode = "";
    }
  };
}
