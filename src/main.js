import { createDefaultState, normalizeRenderPresetKey } from "./noise/defaults.js";
import { createDefaultGraph } from "./graph/defaultGraph.js";
import { createNoiseView } from "./render/NoiseView.js";
import { validateAndNormalize } from "./noise/state.js";
import { mountGraphApp } from "./graph/mount.jsx";
import { initLayoutControls, isMobileLayout } from "./ui/layoutControl.js";

const viewCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById("view"));
const graphRoot = document.getElementById("graph-root");
const diagContent = document.getElementById("diagnostics-content");
if (!viewCanvas || !graphRoot || !diagContent) {
  throw new Error("Missing #view, #graph-root, or #diagnostics-content");
}

const el = (id) => document.getElementById(id);
const renderReset = el("render-reset");
const renderBackend = el("render-backend");
const renderModeChunk = el("render-mode-chunk");
const renderModeWorld = el("render-mode-world");
const renderChunkView = el("render-chunk-view");
const renderOffsetX = el("render-offset-x");
const renderOffsetXNum = el("render-offset-x-num");
const renderOffsetY = el("render-offset-y");
const renderOffsetYNum = el("render-offset-y-num");
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
const renderLod = el("render-lod");
const renderLodLayers = el("render-lod-layers");
const renderLodLayersNum = el("render-lod-layers-num");
const renderLodmin = el("render-lodmin");
const renderLodminNum = el("render-lodmin-num");
const renderRebuild = el("render-rebuild");
const renderRebuildNum = el("render-rebuild-num");
const debugBorders = el("debug-borders");
const debugDirty = el("debug-dirty");
const debugLod = el("debug-lod");
const debugShaderPreview = el("debug-shader-preview");
const viewportStatsFps = el("viewport-stats-fps");
const viewportStatsPos = el("viewport-stats-pos");
const graphPanelMinimize = el("graph-panel-minimize");
const graphPanelRestore = el("graph-panel-restore");
const viewportMinimize = el("viewport-minimize");
const viewportRestore = el("viewport-restore");
const renderPanel = el("render-panel");
const renderPanelClose = el("render-panel-close");
const renderPanelRestore = el("render-panel-restore");

if (
  !renderReset ||
  !renderBackend ||
  !renderModeChunk ||
  !renderModeWorld ||
  !renderChunkView ||
  !renderOffsetX ||
  !renderOffsetXNum ||
  !renderOffsetY ||
  !renderOffsetYNum ||
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
  !renderLod ||
  !renderLodLayers ||
  !renderLodLayersNum ||
  !renderLodmin ||
  !renderLodminNum ||
  !renderRebuild ||
  !renderRebuildNum ||
  !debugBorders ||
  !debugDirty ||
  !debugLod ||
  !debugShaderPreview ||
  !viewportStatsFps ||
  !viewportStatsPos ||
  !graphPanelMinimize ||
  !graphPanelRestore ||
  !viewportMinimize ||
  !viewportRestore ||
  !renderPanel ||
  !renderPanelClose ||
  !renderPanelRestore
) {
  throw new Error("Missing render panel or viewport UI in DOM");
}

const renderUseBiomes = el("render-use-biomes");
const renderTerrainViz = el("render-terrain-viz");
const renderBiomePreview = el("render-biome-preview");
const renderBiomePreviewRow = el("render-biome-preview-row");

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
/** Chunk mode: accumulate WASD pan, commit every N movement frames to cut CPU terrain rebakes. */
let chunkPanAccX = 0;
let chunkPanAccY = 0;
let chunkPanAccFrames = 0;
const CHUNK_PAN_FRAMES_PER_COMMIT = 3;
let state = { ...createDefaultState(), noiseGraph: createDefaultGraph() };
let lastRafT = performance.now();
let fpsEma = 0;
let lastGraphW = "480px";
/** Graph column width before hiding the preview (restore when showing preview again). */
let lastGraphWWhenPreviewVisible = "480px";

/**
 * @returns {number}
 */
function readLayoutGraphW() {
  try {
    const raw = localStorage.getItem("np.layout.v1");
    if (!raw) {
      return 480;
    }
    const j = JSON.parse(raw);
    return Math.max(260, Math.min(900, Number(j.graphW) || 480));
  } catch {
    return 480;
  }
}

const graphApp = mountGraphApp(graphRoot, () => state, {
  applyPatch: (p) => {
    state = { ...state, ...p };
    graphApp.render();
    schedule();
  }
});

const noise = createNoiseView(viewCanvas, () => state);

function flushChunkPanAcc() {
  if (chunkPanAccX === 0 && chunkPanAccY === 0) {
    chunkPanAccFrames = 0;
    return;
  }
  nudgeOffset(chunkPanAccX, chunkPanAccY);
  chunkPanAccX = 0;
  chunkPanAccY = 0;
  chunkPanAccFrames = 0;
}

/**
 * @param {object} p
 */
function applyRenderPatch(p) {
  if (p && Object.prototype.hasOwnProperty.call(p, "offset")) {
    flushChunkPanAcc();
  }
  if (p && Object.prototype.hasOwnProperty.call(p, "rendererViewMode") && p.rendererViewMode === "world") {
    flushChunkPanAcc();
  }
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
  /** @type {HTMLSelectElement} */ (renderChunkView).value = String(state.chunkViewSize);
  setPairFloat(/** @type {HTMLInputElement} */ (renderOffsetX), /** @type {HTMLInputElement} */ (renderOffsetXNum), state.offset.x);
  setPairFloat(/** @type {HTMLInputElement} */ (renderOffsetY), /** @type {HTMLInputElement} */ (renderOffsetYNum), state.offset.y);
  setPairFloat(/** @type {HTMLInputElement} */ (renderZoom), /** @type {HTMLInputElement} */ (renderZoomNum), state.cameraZoom);
  setPairFloat(/** @type {HTMLInputElement} */ (renderMesh), /** @type {HTMLInputElement} */ (renderMeshNum), state.defaultChunkResolution);
  setPairFloat(/** @type {HTMLInputElement} */ (renderChunkR), /** @type {HTMLInputElement} */ (renderChunkRNum), state.chunkRadius);
  setPairFloat(/** @type {HTMLInputElement} */ (renderChunkW), /** @type {HTMLInputElement} */ (renderChunkWNum), state.chunkWorldSize);
  setPairFloat(
    /** @type {HTMLInputElement} */ (renderLodLayers),
    /** @type {HTMLInputElement} */ (renderLodLayersNum),
    state.lodLayerCount | 0
  );
  setPairFloat(/** @type {HTMLInputElement} */ (renderLodmin), /** @type {HTMLInputElement} */ (renderLodminNum), state.minLodResolution);
  setPairFloat(/** @type {HTMLInputElement} */ (renderRebuild), /** @type {HTMLInputElement} */ (renderRebuildNum), state.maxChunkRebuildsPerFrame);
  /** @type {HTMLSelectElement} */ (renderPreset).value = normalizeRenderPresetKey(state.renderPreset);
  /** @type {HTMLSelectElement} */ (renderBackend).value = state.terrainBackend;
  syncViewModeButtons();
  /** @type {HTMLInputElement} */ (renderLod).checked = state.lodEnabled;
  /** @type {HTMLInputElement} */ (debugBorders).checked = state.debugShowChunkBorders;
  /** @type {HTMLInputElement} */ (debugDirty).checked = state.debugShowDirtyChunks;
  /** @type {HTMLInputElement} */ (debugLod).checked = state.debugColorByLod;
  /** @type {HTMLInputElement} */ (debugShaderPreview).checked = state.debugShowShaderPreview;
  if (renderUseBiomes) {
    renderUseBiomes.checked = state.useBiomes;
  }
  if (renderTerrainViz) {
    renderTerrainViz.value = state.terrainVizMode;
  }
  if (renderBiomePreview) {
    renderBiomePreview.value = String(state.biomePreviewIndex | 0);
  }
  if (renderBiomePreviewRow) {
    renderBiomePreviewRow.style.display = state.terrainVizMode === "biomePreview" ? "" : "none";
  }
}

function syncViewModeButtons() {
  const m = state.rendererViewMode;
  /** @type {HTMLButtonElement} */ (renderModeChunk).setAttribute("aria-pressed", m === "chunk" ? "true" : "false");
  /** @type {HTMLButtonElement} */ (renderModeWorld).setAttribute("aria-pressed", m === "world" ? "true" : "false");
  renderModeChunk.classList.toggle("viewport-mode-btn--active", m === "chunk");
  renderModeWorld.classList.toggle("viewport-mode-btn--active", m === "world");
}

function updateRenderPanelMode() {
  const m = state.rendererViewMode;
  for (const n of document.querySelectorAll("[data-render-for]")) {
    if (!(n instanceof HTMLElement)) {
      continue;
    }
    const w = n.getAttribute("data-render-for");
    if (w === "chunk") {
      n.toggleAttribute("hidden", m !== "chunk");
    } else if (w === "world") {
      n.toggleAttribute("hidden", m !== "world");
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
  /** @type {HTMLInputElement} */ (renderZoom),
  /** @type {HTMLInputElement} */ (renderZoomNum),
  (n) => ({ cameraZoom: n })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderOffsetX),
  /** @type {HTMLInputElement} */ (renderOffsetXNum),
  (n) => ({ offset: { ...state.offset, x: n } })
);
bindRangeNumberPair(
  /** @type {HTMLInputElement} */ (renderOffsetY),
  /** @type {HTMLInputElement} */ (renderOffsetYNum),
  (n) => ({ offset: { ...state.offset, y: n } })
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
  /** @type {HTMLInputElement} */ (renderLodLayers),
  /** @type {HTMLInputElement} */ (renderLodLayersNum),
  (n) => ({ lodLayerCount: Math.floor(n) })
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
/** @type {HTMLSelectElement} */ (renderBackend).addEventListener("change", (e) => {
  const v = /** @type {HTMLSelectElement} */ (e.target).value;
  if (v === "auto" || v === "webgpu" || v === "cpu") {
    applyRenderPatch({ terrainBackend: v });
  }
});
if (renderUseBiomes) {
  renderUseBiomes.addEventListener("change", (e) => {
    applyRenderPatch({ useBiomes: /** @type {HTMLInputElement} */ (e.target).checked });
  });
}
if (renderTerrainViz) {
  renderTerrainViz.addEventListener("change", (e) => {
    const v = /** @type {HTMLSelectElement} */ (e.target).value;
    applyRenderPatch({ terrainVizMode: v, biomePreviewIndex: state.biomePreviewIndex | 0 });
  });
}
if (renderBiomePreview) {
  renderBiomePreview.addEventListener("change", (e) => {
    const n = Math.max(0, Math.floor(Number(/** @type {HTMLInputElement} */ (e.target).value) || 0));
    applyRenderPatch({ biomePreviewIndex: n });
  });
}
/** @type {HTMLSelectElement} */ (renderPreset).addEventListener("change", (e) => {
  const v = /** @type {HTMLSelectElement} */ (e.target).value;
  applyRenderPatch({ renderPreset: v });
});
/**
 * @param {"chunk" | "world"} v
 */
function setRendererViewModeFromUi(v) {
  if (v !== state.rendererViewMode) {
    const next = (state.chunkReloadSeq | 0) + 1;
    applyRenderPatch({ rendererViewMode: v, chunkReloadSeq: next });
  }
}
/** @type {HTMLButtonElement} */ (renderModeChunk).addEventListener("click", () => {
  setRendererViewModeFromUi("chunk");
});
/** @type {HTMLButtonElement} */ (renderModeWorld).addEventListener("click", () => {
  setRendererViewModeFromUi("world");
});
/** @type {HTMLSelectElement} */ (renderChunkView).addEventListener("change", (e) => {
  const raw = /** @type {HTMLSelectElement} */ (e.target).value;
  const v = parseInt(raw, 10);
  if (v === 1 || v === 3 || v === 5) {
    const next = (state.chunkReloadSeq | 0) + 1;
    applyRenderPatch({ chunkViewSize: v, chunkReloadSeq: next });
  }
});
/** @type {HTMLButtonElement} */ (renderReset).addEventListener("click", () => {
  flushChunkPanAcc();
  const d = createDefaultState();
  state = {
    ...state,
    offset: { x: 0, y: 0, z: 0 },
    cameraZoom: 1,
    flyCamera: { ...d.flyCamera },
    chunkViewSize: d.chunkViewSize,
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
/** @type {HTMLInputElement} */ (debugDirty).addEventListener("change", (e) => {
  applyRenderPatch({ debugShowDirtyChunks: /** @type {HTMLInputElement} */ (e.target).checked });
});
/** @type {HTMLInputElement} */ (debugLod).addEventListener("change", (e) => {
  applyRenderPatch({ debugColorByLod: /** @type {HTMLInputElement} */ (e.target).checked });
});
/** @type {HTMLInputElement} */ (debugShaderPreview).addEventListener("change", (e) => {
  applyRenderPatch({ debugShowShaderPreview: /** @type {HTMLInputElement} */ (e.target).checked });
});

graphPanelMinimize.addEventListener("click", () => {
  if (isMobileLayout()) {
    return;
  }
  const root = document.documentElement;
  lastGraphW = root.style.getPropertyValue("--graph-w") || `${readLayoutGraphW()}px`;
  if (!lastGraphW || lastGraphW === "0px") {
    lastGraphW = `${readLayoutGraphW()}px`;
  }
  document.body.classList.add("app-graph-minimized");
  graphPanelMinimize.setAttribute("aria-expanded", "false");
  graphPanelRestore.hidden = false;
  graphPanelRestore.setAttribute("aria-hidden", "false");
  schedule();
});

graphPanelRestore.addEventListener("click", () => {
  document.body.classList.remove("app-graph-minimized");
  if (!isMobileLayout()) {
    document.documentElement.style.setProperty("--graph-w", lastGraphW);
  }
  graphPanelMinimize.setAttribute("aria-expanded", "true");
  graphPanelRestore.hidden = true;
  graphPanelRestore.setAttribute("aria-hidden", "true");
  viewCanvas.focus({ preventScroll: true });
  schedule();
  window.dispatchEvent(new Event("resize"));
});

viewportMinimize.addEventListener("click", () => {
  if (isMobileLayout()) {
    return;
  }
  const root = document.documentElement;
  let w = root.style.getPropertyValue("--graph-w") || `${readLayoutGraphW()}px`;
  w = w.trim();
  if (!w || w === "0px") {
    w = `${readLayoutGraphW()}px`;
  }
  lastGraphWWhenPreviewVisible = w;
  document.body.classList.add("app-viewport-minimized");
  /** @type {HTMLElement} */ (viewportRestore).hidden = false;
  viewportRestore.setAttribute("aria-hidden", "false");
  /** @type {HTMLButtonElement} */ (viewportMinimize).setAttribute("aria-expanded", "false");
  schedule();
  window.dispatchEvent(new Event("resize"));
});

viewportRestore.addEventListener("click", () => {
  document.body.classList.remove("app-viewport-minimized");
  if (!isMobileLayout()) {
    document.documentElement.style.setProperty("--graph-w", lastGraphWWhenPreviewVisible);
  }
  /** @type {HTMLElement} */ (viewportRestore).hidden = true;
  viewportRestore.setAttribute("aria-hidden", "true");
  /** @type {HTMLButtonElement} */ (viewportMinimize).setAttribute("aria-expanded", "true");
  viewCanvas.focus({ preventScroll: true });
  schedule();
  window.dispatchEvent(new Event("resize"));
});

function closeRenderOptions() {
  const rp = /** @type {HTMLElement} */ (renderPanel);
  rp.classList.add("render-panel--hidden");
  /** @type {HTMLElement} */ (renderPanelRestore).hidden = false;
  renderPanelRestore.setAttribute("aria-hidden", "false");
  schedule();
}

function openRenderOptions() {
  const rp = /** @type {HTMLElement} */ (renderPanel);
  rp.classList.remove("render-panel--hidden");
  /** @type {HTMLElement} */ (renderPanelRestore).hidden = true;
  renderPanelRestore.setAttribute("aria-hidden", "true");
  viewCanvas.focus({ preventScroll: true });
  schedule();
}

renderPanelClose.addEventListener("click", () => {
  closeRenderOptions();
});

renderPanelRestore.addEventListener("click", () => {
  openRenderOptions();
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
  flushChunkPanAcc();
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
    if (
      state.rendererViewMode === "world" &&
      document.activeElement !== viewCanvas &&
      !e.repeat
    ) {
      if (e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD" || e.code.startsWith("Arrow")) {
        viewCanvas.focus({ preventScroll: true });
      }
    }
    schedule();
  },
  { passive: false }
);
window.addEventListener(
  "keyup",
  (e) => {
    keys.delete(e.code);
    schedule();
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
    if (state.rendererViewMode === "chunk") {
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
  if (state.rendererViewMode === "world") {
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
function hasChunkPanKeyHeld() {
  for (const k of keys) {
    if (k === "KeyW" || k === "KeyA" || k === "KeyS" || k === "KeyD" || k.startsWith("Arrow")) {
      return true;
    }
  }
  return false;
}

function hasWorldMoveKeyHeld() {
  for (const k of keys) {
    if (k === "KeyW" || k === "KeyA" || k === "KeyS" || k === "KeyD") {
      return true;
    }
  }
  return false;
}

/**
 * Keep the RAF loop alive for streaming terrain / mouselook. Do not require
 * isViewportKeyTarget() here: focus can differ from the canvas (e.g. after graph UI)
 * while movement keys are still in `keys`, which would stop chunk sync for held W.
 */
function shouldKeepRaf() {
  if (state.animate) {
    return true;
  }
  if (state.rendererViewMode === "chunk" && hasChunkPanKeyHeld()) {
    return true;
  }
  if (state.rendererViewMode === "world" && hasWorldMoveKeyHeld()) {
    return true;
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
    const rawDtSec = Math.min(0.25, Math.max(1e-4, (now - lastRafT) * 0.001));
    lastRafT = now;
    const dt = Math.min(0.05, rawDtSec);
    {
      const instFps = 1 / rawDtSec;
      fpsEma = fpsEma > 0 ? fpsEma * 0.88 + instFps * 0.12 : instFps;
    }

    if (isViewportKeyTarget()) {
      if (state.rendererViewMode === "chunk") {
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
          chunkPanAccX += dx;
          chunkPanAccY += dy;
          chunkPanAccFrames += 1;
          if (chunkPanAccFrames >= CHUNK_PAN_FRAMES_PER_COMMIT) {
            flushChunkPanAcc();
          }
        } else {
          flushChunkPanAcc();
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
    const fps = fpsEma > 0.5 ? Math.round(fpsEma) : 0;
    let posText = "—";
    if (state.rendererViewMode === "chunk") {
      const ox = -state.offset.x;
      const oy = -state.offset.y;
      const oz = state.offset.z;
      posText = `view (${ox.toFixed(1)}, ${oy.toFixed(1)}, ${oz.toFixed(1)})`;
    } else {
      const f = state.flyCamera;
      posText = `fly (${f.x.toFixed(1)}, ${f.y.toFixed(1)}, ${f.z.toFixed(1)})`;
    }
    viewportStatsFps.textContent = `${fps} fps  ·  ${ms.toFixed(1)} ms`;
    viewportStatsPos.textContent = posText;
    const info = /** @type {any} */ (noise).viewInfo;
    const tris = info.triangleCount ?? 0;
    const chunks = info.activeChunkCount ?? 0;
    const dirty = info.dirtyChunkCount ?? 0;
    const center = info.centerChunk ?? "—";
    const mode = state.rendererViewMode;
    if (state.debugShowRendererStats !== false) {
      const backend = info.backend || state.terrainBackend;
      const compileStatus = info.compileStatus || "—";
      const gpuMs =
        state.debugShowGpuTiming !== false && Number.isFinite(info.gpuGenMs)
          ? `  |  gpu-gen: ${Number(info.gpuGenMs).toFixed(2)} ms`
          : "";
      const graphHash = info.graphHash ? `  |  graph: ${String(info.graphHash).slice(0, 48)}` : "";
      const compileErrors = info.compileErrors ? `\nCompile: ${info.compileErrors}` : "";
      const shaderPreview =
        state.debugShowShaderPreview && info.shaderPreview
          ? `\nWGSL:\n${info.shaderPreview}`
          : "";
      diagContent.textContent = `Frame: ${ms.toFixed(2)} ms  |  ${w}×${h}  |  ` +
        `tris: ~${tris.toLocaleString()}  |  chunks: ${chunks}  |  dirty: ${dirty}  |  center: ${center}  |  ${mode}  |  ` +
        `backend: ${backend}  |  compile: ${compileStatus}${gpuMs}${graphHash}${compileErrors}${shaderPreview}`;
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
