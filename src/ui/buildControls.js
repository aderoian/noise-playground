import { PRESETS } from "./presets.js";

/**
 * @param {HTMLElement} root
 * @param {{ getState: () => any, setState: (p: any) => void, onReset: () => void }} ctx
 * @param {{ syncAll: () => void }} [out] - receives sync to call after setState
 */
export function buildControls(root, ctx, out) {
  const { getState, setState, onReset } = ctx;
  root.innerHTML = "";
  const wrap = el("div", { className: "control-inner" });
  const deb = debounce(16);
  const syncers = [];

  const patch = (p) => setState({ ...getState(), ...p });

  /** @type {() => void} */
  let doSync = () => { };

  function bindSelect(label, getOpts, getVal, apply) {
    const sel = el("select", { className: "control-select" });
    const r = row(label, sel);
    const sync = () => {
      sel.innerHTML = "";
      for (const o of getOpts()) {
        const op = el("option", { value: String(o.value) });
        op.textContent = o.label;
        sel.appendChild(op);
      }
      const v = getVal();
      sel.value = String(v);
    };
    syncers.push(sync);
    sync();
    sel.addEventListener("change", () => {
      const raw = sel.value;
      const o = getOpts().find((x) => String(x.value) === raw);
      if (o) {
        apply(o.value);
      }
    });
    return r;
  }

  function bindNumber(label, key, min, max, step, { debounced = true } = {}) {
    const range = el("input", { className: "control-range", type: "range" });
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    const num = el("input", { className: "control-number", type: "number" });
    num.step = String(step);
    const dual = el("div", { className: "row-dual" });
    dual.append(range, num);
    const r = row(label, dual);
    const apply = (v) => {
      if (!Number.isFinite(v)) {
        return;
      }
      if (v < min) {
        v = min;
      }
      if (v > max) {
        v = max;
      }
      patch({ [key]: v });
    };
    const applyMaybeDeb = (v) => {
      if (debounced) {
        deb(() => apply(v));
        range.value = String(v);
        num.value = String(v);
      } else {
        apply(v);
        range.value = String(v);
        num.value = String(v);
      }
    };
    range.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) {
        return;
      }
      const v = parseFloat(t.value);
      applyMaybeDeb(v);
    });
    num.addEventListener("change", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) {
        return;
      }
      const v = parseFloat(t.value);
      applyMaybeDeb(v);
    });
    const sync = () => {
      const s = getState();
      const v = s[key];
      if (Number.isFinite(v)) {
        range.value = String(v);
        num.value = String(v);
      }
    };
    syncers.push(sync);
    return r;
  }

  function bindInt(label, key, min, max) {
    const num = el("input", { className: "control-number", type: "number" });
    num.step = "1";
    num.min = String(min);
    num.max = String(max);
    const r = row(label, num);
    num.addEventListener("input", () => {
      const v = parseInt(num.value, 10);
      if (Number.isFinite(v)) {
        patch({ [key]: v });
      }
    });
    const sync = () => {
      num.value = String(getState()[key] | 0);
    };
    syncers.push(sync);
    return r;
  }

  function bindOffset(label, comp) {
    const range = el("input", { className: "control-range", type: "range" });
    range.min = "-1000";
    range.max = "1000";
    range.step = "0.5";
    const num = el("input", { className: "control-number", type: "number" });
    num.step = "0.1";
    const dual2 = el("div", { className: "row-dual" });
    dual2.append(range, num);
    const r = row(label, dual2);
    const apply = (v) => {
      if (!Number.isFinite(v)) {
        return;
      }
      const s = getState();
      patch({ offset: { ...s.offset, [comp]: v } });
    };
    const go = (v) => {
      deb(() => apply(v));
      range.value = String(v);
      num.value = String(v);
    };
    range.addEventListener("input", (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement) {
        go(parseFloat(t.value));
      }
    });
    num.addEventListener("change", (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement) {
        go(parseFloat(t.value));
      }
    });
    const sync = () => {
      const v = getState().offset[comp];
      if (Number.isFinite(v)) {
        range.value = String(v);
        num.value = String(v);
      }
    };
    syncers.push(sync);
    return r;
  }

  function bindCheckbox(label, key) {
    const input = el("input", { className: "control-checkbox", type: "checkbox" });
    const lab = el("label", { className: "row-inline" });
    lab.append(input, document.createTextNode(` ${label}`));
    const r = row("", lab);
    r.querySelector(".row-label").textContent = label;
    input.addEventListener("change", () => {
      patch({ [key]: input.checked });
    });
    const sync = () => {
      input.checked = Boolean(getState()[key]);
    };
    syncers.push(sync);
    return r;
  }

  doSync = () => {
    for (const s of syncers) {
      s();
    }
  };
  if (out) {
    out.syncAll = doSync;
  }

  function buttonRow(defs) {
    const d = el("div", { className: "button-row" });
    for (const def of defs) {
      const btn = el("button", { type: "button", className: "btn" });
      btn.textContent = def.t;
      btn.addEventListener("click", () => {
        setState({ ...PRESETS[def.k] });
        doSync();
      });
      d.appendChild(btn);
    }
    return d;
  }

  const presetsSect = el("section", { className: "control-section" });
  {
    const h3 = el("h3", { className: "section-title" });
    h3.textContent = "Presets";
    presetsSect.append(
      h3,
    buttonRow([
      { k: "default", t: "Default" },
      { k: "terrain", t: "Terrain" },
      { k: "clouds", t: "Clouds" },
      { k: "marble", t: "Marble" }
    ]),
    buttonRow([
      { k: "ridged", t: "Ridged" },
      { k: "cellular-cracks", t: "Cellular" }
    ]),
    (() => {
      const b = el("button", { type: "button", className: "btn" });
      b.textContent = "Reset defaults";
      b.addEventListener("click", () => onReset());
      return row("Reset", b);
    })()
    );
  }

  const algo = el("section", { className: "control-section" });
  {
    const h3a = el("h3", { className: "section-title" });
    h3a.textContent = "Algorithm";
    algo.append(
      h3a,
    bindSelect(
      "Base",
      () => [
        { value: "os2", label: "OpenSimplex2" },
        { value: "os2s", label: "OpenSimplex2S" },
        { value: "worley", label: "Cellular / Worley" }
      ],
      () => getState().baseKind,
      (v) => patch({ baseKind: v })
    ),
    bindSelect(
      "Orientation (OS2)",
      () => [
        { value: 0, label: "Conventional" },
        { value: 1, label: "ImproveXY" }
      ],
      () => getState().orientation,
      (v) => patch({ orientation: v })
    ),
    bindSelect(
      "Fractal",
      () => [
        { value: "none", label: "None" },
        { value: "fbm", label: "fBm" },
        { value: "rigid", label: "Rigid" }
      ],
      () => getState().fractal,
      (v) => patch({ fractal: v })
    ),
    bindSelect(
      "View",
      () => [
        { value: "2d", label: "2D plane" },
        { value: "slice3d", label: "3D slice" }
      ],
      () => getState().viewMode,
      (v) => patch({ viewMode: v })
    )
  );
  }

  const core = el("section", { className: "control-section" });
  {
    const h3c = el("h3", { className: "section-title" });
    h3c.textContent = "Core";
    core.append(
      h3c,
    bindInt("Seed", "seed", -2147483647, 2147483647),
    bindNumber("Frequency", "frequency", 0.001, 100, 0.001, { debounced: true }),
    bindNumber("Amplitude", "amplitude", 0, 10, 0.01, { debounced: true }),
    bindNumber("World scale", "worldScale", 0.1, 20, 0.01, { debounced: true }),
    bindOffset("Offset X", "x"),
    bindOffset("Offset Y", "y"),
    bindOffset("Offset Z", "z"),
    bindNumber("Slice Z (3D)", "sliceZ", -50, 50, 0.01, { debounced: true })
  );
  }

  const frac = el("section", { className: "control-section" });
  {
    const h3f = el("h3", { className: "section-title" });
    h3f.textContent = "Fractal";
    frac.append(
      h3f,
    bindInt("Octaves", "octaves", 1, 8),
    bindNumber("Lacunarity", "lacunarity", 0.1, 32, 0.05, { debounced: true }),
    bindNumber("Gain (persistence)", "gain", 0.01, 1, 0.01, { debounced: true }),
    bindNumber("Rigid exp", "rigidExp", 0.1, 8, 0.05, { debounced: true }),
    bindNumber("Rigid weight", "rigidWeight", 0, 2, 0.05, { debounced: true })
    );
  }

  const cell = el("section", { className: "control-section" });
  {
    const h3w = el("h3", { className: "section-title" });
    h3w.textContent = "Cellular";
    cell.append(
      h3w,
    bindNumber("Jitter", "jitter", 0, 1, 0.01, { debounced: true }),
    bindSelect(
      "Metric",
      () => [
        { value: 0, label: "Euclidean" },
        { value: 1, label: "Manhattan" },
        { value: 2, label: "Chebyshev" }
      ],
      () => getState().cellMetric,
      (v) => patch({ cellMetric: v })
    ),
    bindSelect(
      "Output",
      () => [
        { value: 0, label: "F1" },
        { value: 1, label: "F2" },
        { value: 2, label: "F2\u2212F1" }
      ],
      () => getState().cellReturn,
      (v) => patch({ cellReturn: v })
    )
    );
  }

  const vis = el("section", { className: "control-section" });
  {
    const h3v = el("h3", { className: "section-title" });
    h3v.textContent = "Display";
    vis.append(
      h3v,
    bindSelect(
      "Ramp",
      () => [
        { value: "gray", label: "Grayscale" },
        { value: "heat", label: "Heat" },
        { value: "terrain", label: "Terrain" }
      ],
      () => getState().colorRamp,
      (v) => patch({ colorRamp: v })
    ),
    bindNumber("Contrast", "contrast", 0.1, 5, 0.01, { debounced: true }),
    bindNumber("Brightness", "brightness", -0.5, 0.5, 0.01, { debounced: true }),
    bindCheckbox("Invert", "invert"),
    bindCheckbox("Animate (time in Z+)", "animate"),
    bindNumber("Time speed", "timeSpeed", 0, 5, 0.01, { debounced: true }),
    bindNumber("Terrain Z scale", "meshHeight", 0.02, 3, 0.01, { debounced: true }),
    bindCheckbox("Wireframe overlay", "meshWireframe")
    );
  }

  const help = el("p", { className: "help" });
  help.textContent =
    "Arrow keys pan the field offset (when not typing in a control). " +
    "K.jpg OpenSimplex2 GLSL (github.com/KdotJPG/OpenSimplex2). " +
    "Seeding uses the npm `open-simplex-noise` PRNG. Worley is custom GLSL.";

  wrap.append(presetsSect, algo, core, frac, cell, vis, help);
  root.append(wrap);

  return { syncAll: doSync };
}

/**
 * @param {string} t
 * @param {string} c
 * @param {(e: HTMLDivElement) => void} [fn]
 */
function el(t, c, fn) {
  const e = document.createElement(t);
  if (typeof c === "string") {
    e.className = c;
  } else if (c && typeof c === "object") {
    for (const [k, v] of Object.entries(c)) {
      if (k === "className") {
        e.className = v;
      } else if (k === "textContent") {
        e.textContent = v;
      } else {
        e.setAttribute(k, v);
      }
    }
  }
  if (fn) {
    fn(/** @type {HTMLElement} */ (e));
  }
  return e;
}

function row(label, right) {
  const r = el("div", { className: "row" });
  const l = el("span", { className: "row-label" });
  l.textContent = label;
  r.append(l, right);
  return r;
}

/**
 * @param {number} ms
 */
function debounce(ms) {
  let id = 0;
  return (fn) => {
    if (id) {
      clearTimeout(id);
    }
    id = setTimeout(() => {
      id = 0;
      fn();
    }, ms);
  };
}
