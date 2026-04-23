const STORAGE_KEY = "np.layout.v1";

const DEFAULTS = {
  graphW: 480,
  diagH: 48
};

const LIMITS = {
  graphW: { min: 260, max: 900 },
  diagH: { min: 32, max: 200 }
};

/**
 * @returns {number}
 */
function maxDiagH() {
  return Math.min(LIMITS.diagH.max, Math.floor(window.innerHeight * 0.5));
}

/**
 * @param {number} h
 * @returns {number}
 */
function capDiagH(h) {
  return Math.max(
    LIMITS.diagH.min,
    Math.min(maxDiagH(), h)
  );
}

/**
 * @returns {{ graphW: number, diagH: number }}
 */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULTS };
    }
    const j = JSON.parse(raw);
    return {
      graphW: clamp(
        Number(j.graphW) || DEFAULTS.graphW,
        LIMITS.graphW.min,
        LIMITS.graphW.max
      ),
      diagH: capDiagH(Number(j.diagH) || DEFAULTS.diagH)
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Widen graph max based on current viewport.
 * @param {number} w
 * @returns {number}
 */
function capGraphW(w) {
  const cap = Math.min(LIMITS.graphW.max, Math.floor(window.innerWidth * 0.8));
  return clamp(w, LIMITS.graphW.min, cap);
}

/**
 * @param {{ graphW: number, diagH: number }} s
 */
function save(s) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        graphW: capGraphW(s.graphW),
        diagH: capDiagH(s.diagH)
      })
    );
  } catch {
    // ignore
  }
}

/**
 * @param {boolean} mobile
 * @param {{ graphW: number, diagH: number }} s
 */
function applyCss(mobile, s) {
  const root = document.documentElement;
  if (mobile) {
    root.style.removeProperty("--graph-w");
    root.style.removeProperty("--diag-h");
    return;
  }
  const gw = capGraphW(s.graphW);
  const dh = capDiagH(s.diagH);
  root.style.setProperty("--graph-w", `${gw}px`);
  root.style.setProperty("--diag-h", `${Math.round(dh)}px`);
}

/**
 * @returns {boolean}
 */
export function isMobileLayout() {
  return window.innerWidth <= 800;
}

/**
 * @param {HTMLElement} el
 * @param {() => void} onEnd
 * @param {(e: PointerEvent) => void} onMove
 */
function dragPointer(
  el,
  onEnd,
  onMove
) {
  /**
   * @param {PointerEvent} e
   */
  const move = (e) => {
    onMove(e);
  };
  /**
   * @param {PointerEvent} e
   */
  const up = (e) => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    document.body.classList.remove("layout-dragging", "layout-dragging--h", "layout-dragging--v");
    onEnd();
  };
  return { move, up };
}

/**
 * @param {() => void} [onChange]
 */
export function initLayoutControls(onChange) {
  let state = load();

  const splitV = document.getElementById("split-graph-view");
  const splitH = document.getElementById("split-diag");

  const sync = () => {
    const mobile = isMobileLayout();
    if (!mobile) {
      state = {
        graphW: capGraphW(state.graphW),
        diagH: capDiagH(state.diagH)
      };
      save(state);
    }
    applyCss(mobile, state);
    onChange?.();
  };

  sync();

  /**
   * @param {PointerEvent} e
   */
  const onSplitVDown = (e) => {
    if (e.button !== 0 || isMobileLayout() || !splitV) {
      return;
    }
    e.preventDefault();
    splitV.setPointerCapture(e.pointerId);
    splitV.classList.add("is-drag");
    document.body.classList.add("layout-dragging", "layout-dragging--v");
    const { move, up } = dragPointer(
      splitV,
      () => {
        splitV.classList.remove("is-drag");
        save(state);
        onChange?.();
      },
      (ev) => {
        state.graphW = capGraphW(ev.clientX);
        applyCss(false, state);
        onChange?.();
      }
    );
    splitV.addEventListener("pointermove", move);
    splitV.addEventListener("pointerup", up);
    splitV.addEventListener("pointercancel", up);
  };

  /**
   * @param {PointerEvent} e
   */
  const onSplitHDown = (e) => {
    if (e.button !== 0 || isMobileLayout() || !splitH) {
      return;
    }
    e.preventDefault();
    splitH.setPointerCapture(e.pointerId);
    splitH.classList.add("is-drag");
    document.body.classList.add("layout-dragging", "layout-dragging--h");
    const { move, up } = dragPointer(
      splitH,
      () => {
        splitH.classList.remove("is-drag");
        save(state);
        onChange?.();
      },
      (ev) => {
        const h = window.innerHeight - ev.clientY;
        state.diagH = capDiagH(h);
        applyCss(false, state);
        onChange?.();
      }
    );
    splitH.addEventListener("pointermove", move);
    splitH.addEventListener("pointerup", up);
    splitH.addEventListener("pointercancel", up);
  };

  if (splitV) {
    splitV.addEventListener("pointerdown", onSplitVDown);
  }
  if (splitH) {
    splitH.addEventListener("pointerdown", onSplitHDown);
  }

  const onWinResize = () => {
    sync();
  };
  window.addEventListener("resize", onWinResize);

  return () => {
    if (splitV) {
      splitV.removeEventListener("pointerdown", onSplitVDown);
    }
    if (splitH) {
      splitH.removeEventListener("pointerdown", onSplitHDown);
    }
    window.removeEventListener("resize", onWinResize);
  };
}
