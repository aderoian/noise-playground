import { createDefaultState, normalizeRenderPresetKey } from "./noise/defaults.js";
import { createDefaultGraph } from "./graph/defaultGraph.js";
import { createNoiseView } from "./render/NoiseView.js";
import { validateAndNormalize } from "./noise/state.js";
import { mountGraphApp } from "./graph/mount.jsx";
import { initLayoutControls } from "./ui/layoutControl.js";

/** Arrow-key pan step in world offset units (same space as graph / legacy offset) */
const OFFSET_NUDGE = 0.2;

const viewCanvas = document.getElementById("view");
const graphRoot = document.getElementById("graph-root");
const diag = document.getElementById("diagnostics");
const diagContent = document.getElementById("diagnostics-content");
const renderWorld = document.getElementById("render-world");
const renderWorldNum = document.getElementById("render-world-num");
const renderZoom = document.getElementById("render-zoom");
const renderZoomNum = document.getElementById("render-zoom-num");
const renderMesh = document.getElementById("render-mesh");
const renderMeshNum = document.getElementById("render-mesh-num");
const renderMeshVerts = document.getElementById("render-mesh-verts");
const renderPreset = document.getElementById("render-preset");
if (!viewCanvas || !diag || !graphRoot || !diagContent) {
  throw new Error("Missing #view, #graph-root, #diagnostics, or #diagnostics-content");
}
if (
  !renderWorld ||
  !renderWorldNum ||
  !renderZoom ||
  !renderZoomNum ||
  !renderMesh ||
  !renderMeshNum ||
  !renderMeshVerts ||
  !renderPreset
) {
  throw new Error("Missing render panel controls in DOM");
}

let state = { ...createDefaultState(), noiseGraph: createDefaultGraph() };
const graphApp = mountGraphApp(graphRoot, () => state, {
  applyPatch: (p) => {
    state = { ...state, ...p };
    graphApp.render();
    schedule();
  }
});

const noise = createNoiseView(/** @type {HTMLCanvasElement} */ (viewCanvas), () => state);

/**
 * @param {object} p
 */
function applyRenderPatch(p) {
  state = { ...state, ...p };
  validateAndNormalize(state);
  syncRenderPanelFromState();
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
  setPairFloat(/** @type {HTMLInputElement} */ (renderMesh), /** @type {HTMLInputElement} */ (renderMeshNum), state.meshSegments);
  /** @type {HTMLSelectElement} */ (renderPreset).value = normalizeRenderPresetKey(state.renderPreset);
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
  (n) => ({ meshSegments: Math.floor(n) })
);
/** @type {HTMLSelectElement} */ (renderPreset).addEventListener("change", (e) => {
  const v = /** @type {HTMLSelectElement} */ (e.target).value;
  applyRenderPatch({ renderPreset: v });
});

syncRenderPanelFromState();

function nudgeOffsetFromKeys(dx, dy) {
  state = {
    ...state,
    offset: { ...state.offset, x: state.offset.x + dx, y: state.offset.y + dy }
  };
  validateAndNormalize(state);
  schedule();
}

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

window.addEventListener(
  "keydown",
  (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) {
      return;
    }
    if (isFormFieldTarget(e)) {
      return;
    }
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown"
    ) {
      return;
    }
    e.preventDefault();
    if (e.key === "ArrowLeft") {
      nudgeOffsetFromKeys(-OFFSET_NUDGE, 0);
    } else if (e.key === "ArrowRight") {
      nudgeOffsetFromKeys(OFFSET_NUDGE, 0);
    } else if (e.key === "ArrowUp") {
      nudgeOffsetFromKeys(0, OFFSET_NUDGE);
    } else {
      nudgeOffsetFromKeys(0, -OFFSET_NUDGE);
    }
  },
  { passive: false }
);

const viewportWrap = document.getElementById("viewport-wrap");
if (viewportWrap) {
  viewportWrap.addEventListener("pointerdown", () => {
    viewCanvas.focus({ preventScroll: true });
  });
}

let raf = 0;
function runFrame() {
  if (raf) {
    return;
  }
  raf = requestAnimationFrame(() => {
    raf = 0;
    const t0 = performance.now();
    noise.renderFrame();
    const ms = performance.now() - t0;
    const w = viewCanvas.clientWidth | 0;
    const h = viewCanvas.clientHeight | 0;
    const seg = noise.viewInfo.segments;
    const verts = (seg + 1) * (seg + 1);
    const tris = seg * seg * 2;
    const bakeDebug =
      typeof window !== "undefined" && window.localStorage?.getItem("noise-bake-debug") === "1";
    const b = bakeDebug && typeof noise.getLastBakeStats === "function" ? noise.getLastBakeStats() : null;
    const bakeLine =
      b && typeof b.compileMs === "number"
        ? `  |  Bake: compile ${b.compileMs.toFixed(1)} + sample ${b.sampleMs.toFixed(1)} + upload ${b.uploadMs.toFixed(1)} ms`
        : "";
    diagContent.textContent =
      `Frame: ${ms.toFixed(2)} ms  |  View: ${w}\u00d7${h}  |  ` +
      `Mesh ${seg}\u00d7${seg}  |  ~${verts.toLocaleString()} verts  |  ${tris.toLocaleString()} tris` +
      bakeLine;
    renderMeshVerts.textContent = `Vertices: ${verts.toLocaleString()} (grid ${seg}×${seg})`;
    if (state.animate) {
      runFrame();
    }
  });
}

function schedule() {
  runFrame();
}

initLayoutControls(() => {
  schedule();
});

graphApp.render();
schedule();

window.addEventListener("resize", () => {
  schedule();
});
