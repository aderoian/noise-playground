import { useCallback, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import { PinKind } from "../../graph/types.js";
import { useGraphActions } from "./graphContext.jsx";
import { getParamFieldSpec } from "./paramUi.js";

/**
 * @param {object} p
 * @param {import("./paramUi.js").ParamFieldSpec | null} p.spec
 * @param {number} p.value
 * @param {(n: number) => void} p.onChange
 */
function ScalarPinControl({ value, onChange, spec }) {
  const min = spec?.kind === "number" && typeof spec.min === "number" ? spec.min : -1e6;
  const max = spec?.kind === "number" && typeof spec.max === "number" ? spec.max : 1e6;
  const step = spec?.kind === "number" && typeof spec.step === "number" ? spec.step : 0.01;
  const sens = (max - min) <= 4 ? step : step * 2;

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const x0 = e.clientX;
      const v0 = value;
      const move = (/** @type {PointerEvent} */ (ev) => {
        const d = (ev.clientX - x0) * sens;
        onChange(Math.max(min, Math.min(max, v0 + d)));
      });
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [value, min, max, onChange, sens]
  );

  const strVal =
    value === 0
      ? "0"
      : Number.isFinite(value)
        ? String(value)
        : "0";

  return (
    <div className="np-scalar-ctrl">
      <span
        className="np-scalar-ctrl__grip"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        title="Drag horizontally to adjust"
        role="presentation"
      >
        ::
      </span>
      <input
        className="np-literal"
        type="number"
        step="0.0001"
        value={strVal}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(Number.isFinite(v) ? v : 0);
        }}
        onClick={(e) => e.stopPropagation()}
        title="Literal if unlinked"
      />
    </div>
  );
}

/**
 * @param {object} p
 * @param {import("@xyflow/react").NodeProps} p.data
 */
export function NoiseNode({ data, id, selected }) {
  const nid = id;
  const { setPin, setParam } = useGraphActions();
  const { label, category, typeId, inputs, outputs, params, pinDefaults, isUnknown } = data;
  const ins = inputs || [];
  const outs = outputs || [];
  const p = params || {};

  const inputIds = useMemo(() => new Set(ins.map((x) => x.id)), [ins]);

  const paramOnlyKeys = useMemo(() => {
    if (!p || typeId === "constant") {
      return [];
    }
    return Object.keys(p).filter((k) => {
      if (inputIds.has(k)) {
        return false;
      }
      const v = p[k];
      if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") {
        return false;
      }
      return getParamFieldSpec(typeId, k) != null;
    });
  }, [p, typeId, inputIds]);

  return (
    <div
      className={`np-node${selected ? " np-node--sel" : ""}${
        isUnknown ? " np-node--err" : ""
      }`}
      data-category={String(category).toLowerCase().replace(/\s+/g, "-")}
    >
      <div className="np-node__head">
        <div className="np-node__title">{label || typeId}</div>
        <div className="np-node__cat">{category || ""}</div>
      </div>
      <div className="np-node__rows">
        {ins.map((pin, i) => (
          <div
            key={pin.id}
            className="np-node__row np-node__row--in"
            style={{ marginTop: i === 0 ? 0 : 2 }}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={pin.id}
              className={`np-handle np-handle--${pin.kind === PinKind.Vec2 || pin.kind === PinKind.Vec3 ? "vec" : "scalar"}`}
            />
            <span className="np-pin-name">{pin.name}</span>
            {pin.kind === PinKind.Scalar &&
              (() => {
                const spec = getParamFieldSpec(typeId, pin.id);
                const raw =
                  pinDefaults && pinDefaults[pin.id] !== undefined
                    ? pinDefaults[pin.id]
                    : pin.default;
                const numVal = typeof raw === "number" && !Number.isNaN(raw) ? raw : 0;
                if (spec?.kind === "enum" && spec.options) {
                  const str = String(numVal);
                  const match = spec.options.find((o) => String(o.value) === str);
                  const valueForSelect = match
                    ? str
                    : str === ""
                      ? String(spec.options[0].value)
                      : str;
                  return (
                    <select
                      className="np-param-select"
                      value={valueForSelect}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value;
                        const o = spec.options.find((x) => String(x.value) === v);
                        setPin(nid, pin.id, o ? Number(o.value) : parseFloat(v) || 0);
                      }}
                    >
                      {spec.options.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  );
                }
                return (
                  <ScalarPinControl
                    spec={spec?.kind === "number" ? spec : { kind: "number", min: -1e6, max: 1e6, step: 0.01 }}
                    value={numVal}
                    onChange={(n) => setPin(nid, pin.id, n)}
                  />
                );
              })()}
          </div>
        ))}
        {typeId === "constant" && (
          <div className="np-node__row">
            <span className="np-pin-name">Value</span>
            <ScalarPinControl
              spec={getParamFieldSpec("constant", "value")}
              value={Number(p && p.value) || 0}
              onChange={(n) => setParam(nid, { value: n })}
            />
          </div>
        )}
        {paramOnlyKeys.length > 0 && (
          <div className="np-node__params" role="group" aria-label="Node parameters">
            {paramOnlyKeys.map((k) => {
              const spec = getParamFieldSpec(typeId, k);
              if (!spec) {
                return null;
              }
              if (spec.kind === "enum" && spec.options) {
                const cur = p[k];
                const str = cur === undefined || cur === null ? "" : String(cur);
                const match = spec.options.find((o) => String(o.value) === str);
                const valueForSelect =
                  match || str === "" ? (match ? str : String(spec.options[0].value)) : str;
                return (
                  <label key={k} className="np-node__row np-node__param-row">
                    <span className="np-pin-name">{k}</span>
                    <select
                      className="np-param-select"
                      value={valueForSelect}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value;
                        const o = spec.options.find((x) => String(x.value) === v);
                        if (o) {
                          setParam(nid, { [k]: o.value });
                        } else {
                          setParam(nid, { [k]: v });
                        }
                      }}
                    >
                      {!match && str !== "" && <option value={str}>{`Custom (${str})`}</option>}
                      {spec.options.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (spec.kind === "number") {
                const min = spec.min ?? 0;
                const max = spec.max ?? 1;
                const step = spec.step ?? 0.01;
                const raw = p[k];
                const parsed = typeof raw === "number" ? raw : parseFloat(String(raw));
                const num = Number.isFinite(parsed) ? parsed : min;
                return (
                  <div key={k} className="np-node__row np-node__param-row">
                    <span className="np-pin-name">{k}</span>
                    <ScalarPinControl
                      spec={spec}
                      value={num}
                      onChange={(n) => setParam(nid, { [k]: n })}
                    />
                  </div>
                );
              }
              if (spec.kind === "boolean" || typeof p[k] === "boolean") {
                return (
                  <label key={k} className="np-node__row np-node__param-row np-node__row--inline">
                    <input
                      type="checkbox"
                      checked={!!p[k]}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setParam(nid, { [k]: e.target.checked })}
                    />
                    <span className="np-pin-name">{k}</span>
                  </label>
                );
              }
              return null;
            })}
          </div>
        )}
        {outs.map((pin) => (
          <div key={pin.id} className="np-node__row np-node__row--out">
            <span className="np-pin-name">{pin.name}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={pin.id}
              className={`np-handle np-handle--${pin.kind === PinKind.Vec2 || pin.kind === PinKind.Vec3 ? "vec" : "scalar"}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
