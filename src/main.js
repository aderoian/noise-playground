import { createDefaultState } from "./noise/defaults.js";
import { createNoiseView } from "./render/NoiseView.js";
import { validateAndNormalize } from "./noise/state.js";
import { buildControls } from "./ui/buildControls.js";

/** Arrow-key pan step in world offset units (same space as the Offset sliders) */
const OFFSET_NUDGE = 0.2;

const viewCanvas = document.getElementById("view");
const controlRoot = document.getElementById("control-root");
const diag = document.getElementById("diagnostics");
if (!viewCanvas || !controlRoot || !diag) {
  throw new Error("Missing #view, #control-root, or #diagnostics");
}

let state = createDefaultState();

const ui = buildControls(
  controlRoot,
  {
    getState: () => state,
    setState: (next) => {
      state = { ...next };
      ui.syncAll();
      schedule();
    },
    onReset: () => {
      state = createDefaultState();
      ui.syncAll();
      schedule();
    }
  },
  null
);

const noise = createNoiseView(/** @type {HTMLCanvasElement} */ (viewCanvas), () => state);

function nudgeOffsetFromKeys(dx, dy) {
  state = {
    ...state,
    offset: { ...state.offset, x: state.offset.x + dx, y: state.offset.y + dy }
  };
  validateAndNormalize(state);
  ui.syncAll();
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
    diag.textContent =
      `Frame: ${ms.toFixed(2)} ms  |  View: ${w}\u00d7${h}  |  ` +
      `Mesh ${seg}\u00d7${seg}  |  ~${verts.toLocaleString()} verts  |  ${tris.toLocaleString()} tris`;
    if (state.animate) {
      runFrame();
    }
  });
}

function schedule() {
  runFrame();
}

ui.syncAll();
schedule();

window.addEventListener("resize", () => {
  schedule();
});
