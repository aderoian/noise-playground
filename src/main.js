import { createDefaultState, normalizeRenderPresetKey } from "./noise/defaults.js";
import { createDefaultGraph } from "./graph/defaultGraph.js";
import { createNoiseView } from "./render/NoiseView.js";
import { validateAndNormalize } from "./noise/state.js";
import { mountGraphApp } from "./graph/mount.jsx";
import { initLayoutControls } from "./ui/layoutControl.js";

const viewCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById("view"));
const graphRoot = document.getElementById("graph-root");
const diagContent = document.getElementById("diagnostics-content");
if (!viewCanvas || !graphRoot || !diagContent) {
  throw new Error("Missing #view, #graph-root, or #diagnostics-content");
}

const el = (id) => document.getElementById(id);
const renderReset = el("render-reset");
const renderViewMode = el("render-view-mode");
const renderWorld = el("render-world");
const renderWorldNum = el("render-world-num");
const renderZoom = el("render-zoom");
const renderZoomNum = el("render-zoom-num");
const renderMesh = el("render-mesh");
const renderMeshNum = el("render-mesh-num");
const renderMeshVerts = el("render-mesh-verts");
const renderPreset = el("render-preset");
const renderChunkR = el("render-chunk-r");
const renderChunkRNum = el("render-chunk-r-num");
const renderChunkW = el("render-chunk-w");
const renderChunkWNum = el("render-chunk-w-num");
const renderFreq = el("render-freq");
const renderFreqNum = el("render-freq-num");
const renderMeshH = el("render-meshh");
const renderMeshHNum = el("render-meshh-num");
const renderHoff = el("render-hoff");
const renderHoffNum = el("render-hoff-num");
const renderLod = el("render-lod");
const renderLodmin = el("render-lodmin");
const renderLodminNum = el("render-lodmin-num");
const renderRebuild = el("render-rebuild");
const renderRebuildNum = el("render-rebuild-num");
const debugBorders = el("debug-borders");
const debugLod = el("debug-lod");

if (
  !renderReset ||
  !renderViewMode ||
  !renderWorld ||
  !renderWorldNum ||
  !renderZoom ||
  !renderZoomNum ||
  !renderMesh ||
  !renderMeshNum ||
  !renderMeshVerts ||
  !renderPreset ||
  !renderChunkR ||
  !renderChunkRNum ||
  !renderChunkW ||
  !renderChunkWNum ||
  !renderFreq ||
  !renderFreqNum ||
  !renderMeshH ||
  !renderMeshHNum ||
  !renderHoff ||
  !renderHoffNum ||
  !renderLod ||
  !renderLodmin ||
  !renderLodminNum ||
  !renderRebuild ||
  !renderRebuildNum ||
  !debugBorders ||
  !debugLod
) {
  throw new Error("Missing render panel controls in DOM");
}

const MOVEMENT = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight"
]);
/** @type {Set<string>} */
const keys = new Set();
let state = { ...createDefaultState(), noiseGraph: createDefaultGraph() };
let lastRafT = performance.now();

const graphApp = mountGraphApp(graphRoot, () => state, {
  applyPatch: (p) => {
    state = { ...state, ...p };
    graphApp.render();
    schedule();
  }
});

const noise = createNoiseView(viewCanvas, () => state);

/**
 * @param {object} p
 */
function applyRenderPatch(p) {
  state = { ...state, ...p };
  validateAndNormalize(state);
  syncRenderPanelFromState();
  updateRenderPanelMode();
  schedule();
}

/**
 * @param {HTMLInputElement} rangeEl
 * @param {HTMLInputElement} numEl
 * @param {number} v
 */
function setPairFloat(rangeEl, numEl, v) {
  const s = String(v);
  rangeEl.value = s;
  numEl.value = s;
}

function syncRenderPanelFromState() {
  setPairFloat(/** @type {HTMLInputElement} */ (renderWorld), /** @type {HTMLInputElement} */ (renderWorldNum), state.worldScale);
  setPairFloat(/** @type {HTMLInputElement} */ (renderZoom), /** @type {HTMLInputElement} */ (renderZoomNum), state.cameraZoom);
  setPairFloat(/** @type {HTMLInputElement} */ (renderMesh), /** @type {HTMLInputElement} */ (renderMeshNum), state.defaultChunkResolution);
  setPairFloat(/** @type {HTMLInputElement} */ (renderChunkR), /** @type {HTMLInputElement} */ (renderChunkRNum), state.chunkRadius);
  setPairFloat(/** @type {HTMLInputElement} */ (renderChunkW), /** @type {HTMLInputElement} */ (renderChunkWNum), state.chunkWorldSize);
  setPairFloat(/** @type {HTMLInputElement} */ (renderFreq), /** @type {HTMLInputElement} */ (renderFreqNum), state.frequency);
  setPairFloat(/** @type {HTMLInputElement} */ (renderMeshH), /** @type {HTMLInputElement} */ (renderMeshHNum), state.meshHeight);
  setPairFloat(/** @type {HTMLInputElement} */ (renderHoff), /** @type {HTMLInputElement} */ (renderHoffNum), state.heightOffset);
  setPairFloat(/** @type {HTMLInputElement} */ (renderLodmin), /** @type {HTMLInputElement} */ (renderLodminNum), state.minLodResolution);
  setPairFloat(/** @type {HTMLInputElement} */ (renderRebuild), /** @type {HTMLInputElement} */ (renderRebuildNum), state.maxChunkRebuildsPerFrame);
  /** @type {HTMLSelectElement} */ (renderPreset).value = normalizeRenderPresetKey(state.renderPreset);
  /** @type {HTMLSelectElement} */ (renderViewMode).value = state.rendererViewMode;
  /** @type {HTMLInputElement} */ (renderLod).checked = state.lodEnabled;
  /** @type {HTMLInputElement} */ (debugBorders).checked = state.debugShowChunkBorders;
  /** @type {HTMLInputElement} */ (debugLod).checked = state.debugColorByLod;
}

function updateRenderPanelMode() {
  const m = state.rendererViewMode;
  for (const n of document.querySelectorAll("[data-render-for]")) {
    if (!(n instanceof HTMLElement)) {
      continue;
    }
    const w = n.getAttribute("data-render-for");
    if (w === "simple") {
      n.hidden = m !== "simple";
    } else if (w === "complex") {
      n.hidden = m !== "complex";
    }
  }
}

/**
 * @param {HTMLInputElement} rangeEl
 * @param {HTMLInputElement} numEl
 * @param {(n: number) => object} buildPatch
 */
function bindRangeNumberPair(rangeEl, numEl, buildPatch) {
  function onRange() {
    const n = parseFloat(rangeEl.value);
    if (!Number.isFinite(n)) {
      return;
    }
    numEl.value = String(n);
    applyRenderPatch(buildPatch(n));
  }
  function onNum() {
    const n = parseFloat(numEl.value);
    if (!Number.isFinite(n)) {
      return;
    }
    rangeEl.value = String(n);
    applyRenderPatch(buildPatch(n));
  }
  rangeEl.addEventListener("input", onRange);
  numEl.addEventListener("input", onNum);
  numEl.addEventListener("change", onNum);
}

bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderWorld),
  /** @type {HTMLInputElement} */ (renderWorldNum),
  (n) => ({ worldScale: n })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderZoom),
  /** @type {HTMLInputElement} */ (renderZoomNum),
  (n) => ({ cameraZoom: n })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderMesh),
  /** @type {HTMLInputElement} */ (renderMeshNum),
  (n) => ({ defaultChunkResolution: Math.floor(n) })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderChunkR),
  /** @type {HTMLInputElement} */ (renderChunkRNum),
  (n) => ({ chunkRadius: Math.floor(n) })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderChunkW),
  /** @type {HTMLInputElement} */ (renderChunkWNum),
  (n) => ({ chunkWorldSize: n })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderFreq),
  /** @type {HTMLInputElement} */ (renderFreqNum),
  (n) => ({ frequency: n })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderMeshH),
  /** @type {HTMLInputElement} */ (renderMeshHNum),
  (n) => ({ meshHeight: n })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderHoff),
  /** @type {HTMLInputElement} */ (renderHoffNum),
  (n) => ({ heightOffset: n })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderLodmin),
  /** @type {HTMLInputElement} */ (renderLodminNum),
  (n) => ({ minLodResolution: Math.floor(n) })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderRebuild),
  /** @type {HTMLInputElement} */ (renderRebuildNum),
  (n) => ({ maxChunkRebuildsPerFrame: Math.floor(n) })
);
/** @type {HTMLSelectElement} */ (renderPreset).addEventListener("change", (e) => {
  const v = /** @type {HTMLSelectElement} */ (e.target).value;
  applyRenderPatch({ renderPreset: v });
});
/** @type {HTMLSelectElement} */ (renderViewMode).addEventListener("change", (e) => {
  const v = /** @type {HTMLSelectElement} */ (e.target).value;
  if (v === "complex" || v === "simple") {
    const next = (state.chunkReloadSeq | 0) + 1;
    applyRenderPatch({ rendererViewMode: v, chunkReloadSeq: next });
  }
});
/** @type {HTMLButtonElement} */ (renderReset).addEventListener("click", () => {
  const d = createDefaultState();
  state = {
    ...state,
    offset: { x: 0, y: 0, z: 0 },
    cameraZoom: 1,
    flyCamera: { ...d.flyCamera },
    chunkReloadSeq: (state.chunkReloadSeq | 0) + 1
  };
  validateAndNormalize(state);
  syncRenderPanelFromState();
  updateRenderPanelMode();
  schedule();
});
/** @type {HTMLInputElement} */ (renderLod).addEventListener("change", (e) => {
  applyRenderPatch({ lodEnabled: /** @type {HTMLInputElement} */ (e.target).checked });
});
/** @type {HTMLInputElement} */ (debugBorders).addEventListener("change", (e) => {
  applyRenderPatch({ debugShowChunkBorders: /** @type {HTMLInputElement} */ (e.target).checked });
});
/** @type {HTMLInputElement} */ (debugLod).addEventListener("change", (e) => {
  applyRenderPatch({ debugColorByLod: /** @type {HTMLInputElement} */ (e.target).checked });
});

syncRenderPanelFromState();
updateRenderPanelMode();

/**
 * @param {Event} e
 */
function isFormFieldTarget(e) {
  const t = e.target;
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement
  );
}

function isViewportKeyTarget() {
  return document.activeElement === viewCanvas || document.pointerLockElement === viewCanvas;
}

function nudgeOffset(dx, dy) {
  state = {
    ...state,
    offset: { ...state.offset, x: state.offset.x + dx, y: state.offset.y + dy }
  };
  validateAndNormalize(state);
}

viewCanvas.addEventListener("blur", () => {
  keys.clear();
});
window.addEventListener(
  "keydown",
  (e) => {
    if (isFormFieldTarget(e)) {
      return;
    }
    if (!MOVEMENT.has(e.code)) {
      return;
    }
    e.preventDefault();
    keys.add(e.code);
  },
  { passive: false }
);
window.addEventListener(
  "keyup",
  (e) => {
    keys.delete(e.code);
  },
  { passive: true }
);

viewCanvas.addEventListener(
  "wheel",
  (e) => {
    if (!isViewportKeyTarget() && isFormFieldTarget(e)) {
      return;
    }
    if (!isViewportKeyTarget()) {
      return;
    }
    e.preventDefault();
    if (state.rendererViewMode === "simple") {
      const z = state.cameraZoom - e.deltaY * 0.001;
      applyRenderPatch({ cameraZoom: z });
    } else {
      const c = state.flyCamera;
      const cosY = Math.cos(c.yaw);
      const sinY = Math.sin(c.yaw);
      const step = (e.deltaY > 0 ? -1 : 1) * 0.4;
      state = {
        ...state,
        flyCamera: { ...c, x: c.x + cosY * step, y: c.y + sinY * step }
      };
      validateAndNormalize(state);
      syncRenderPanelFromState();
      updateRenderPanelMode();
      schedule();
    }
  },
  { passive: false }
);

viewCanvas.addEventListener("click", () => {
  if (state.rendererViewMode === "complex") {
    viewCanvas.requestPointerLock();
  }
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== viewCanvas) {
    return;
  }
  if (isFormFieldTarget(e)) {
    return;
  }
  const c = state.flyCamera;
  const nx = c.yaw - e.movementX * 0.0022;
  const np = c.pitch - e.movementY * 0.0022;
  const pitch = np < -1.2 ? -1.2 : np > 1.2 ? 1.2 : np;
  state = { ...state, flyCamera: { ...c, yaw: nx, pitch } };
  validateAndNormalize(state);
  schedule();
});

let raf = 0;
function shouldKeepRaf() {
  if (state.animate) {
    return true;
  }
  if (!isViewportKeyTarget()) {
    return false;
  }
  if (state.rendererViewMode === "simple") {
    for (const k of keys) {
      if (k === "KeyW" || k === "KeyA" || k === "KeyS" || k === "KeyD" || k.startsWith("Arrow")) {
        return true;
      }
    }
    return false;
  }
  for (const k of keys) {
    if (k === "KeyW" || k === "KeyA" || k === "KeyS" || k === "KeyD") {
      return true;
    }
  }
  return document.pointerLockElement === viewCanvas;
}

function runFrame() {
  if (raf) {
    return;
  }
  raf = requestAnimationFrame(() => {
    raf = 0;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastRafT) * 0.001);
    lastRafT = now;

    if (isViewportKeyTarget()) {
      if (state.rendererViewMode === "simple") {
        const move = 2.0 * dt;
        let dx = 0;
        let dy = 0;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) {
          dx -= move;
        }
        if (keys.has("KeyD") || keys.has("ArrowRight")) {
          dx += move;
        }
        if (keys.has("KeyS") || keys.has("ArrowDown")) {
          dy -= move;
        }
        if (keys.has("KeyW") || keys.has("ArrowUp")) {
          dy += move;
        }
        if (dx !== 0 || dy !== 0) {
          nudgeOffset(dx, dy);
        }
      } else {
        const c = { ...state.flyCamera };
        const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
        const sp = (sprint ? 10.0 : 2.2) * dt;
        const cosY = Math.cos(c.yaw);
        const sinY = Math.sin(c.yaw);
        const str = sp * 0.8;
        if (keys.has("KeyW")) {
          c.x += cosY * sp;
          c.y += sinY * sp;
        }
        if (keys.has("KeyS")) {
          c.x -= cosY * sp;
          c.y -= sinY * sp;
        }
        if (keys.has("KeyA")) {
          c.x += -sinY * str;
          c.y += cosY * str;
        }
        if (keys.has("KeyD")) {
          c.x -= -sinY * str;
          c.y -= cosY * str;
        }
        state = { ...state, flyCamera: c };
        validateAndNormalize(state);
      }
    }

    const t0 = performance.now();
    noise.renderFrame();
    const ms = performance.now() - t0;
    const w = viewCanvas.clientWidth | 0;
    const h = viewCanvas.clientHeight | 0;
    const info = /** @type {any} */ (noise).viewInfo;
    const tris = info.triangleCount ?? 0;
    const chunks = info.activeChunkCount ?? 0;
    const center = info.centerChunk ?? "—";
    const mode = state.rendererViewMode;
    if (state.debugShowRendererStats !== false) {
      diagContent.textContent = `Frame: ${ms.toFixed(2)} ms  |  ${w}×${h}  |  ` +
        `tris: ~${tris.toLocaleString()}  |  chunks: ${chunks}  |  center: ${center}  |  ${mode}  |  ` +
        `pos ${info.flyPos || ""} `;
    }
    renderMeshVerts.textContent = `~${tris.toLocaleString()} tris, max res ${state.defaultChunkResolution} — click canvas to focus keys`;

    if (shouldKeepRaf()) {
      runFrame();
    }
  });
}

function schedule() {
  runFrame();
}

const viewportWrap = document.getElementById("viewport-wrap");
if (viewportWrap) {
  viewportWrap.addEventListener("pointerdown", () => {
    viewCanvas.focus({ preventScroll: true });
  });
}

initLayoutControls(() => {
  schedule();
});

graphApp.render();
schedule();

window.addEventListener("resize", () => {
  schedule();
});
