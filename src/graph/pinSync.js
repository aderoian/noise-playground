import { PinKind } from "./types.js";

/**
 * For graphs saved before per-pin literals, `params` held values that are now
 * input pins. Copy into `pinDefaults` when a pin is missing.
 * @param {import("./types.js").GraphNode} node
 * @param {import("./registry.js").NodeRegistry} registry
 */
export function syncLegacyParamsToInputPins(node, registry) {
  const def = registry.get(node.typeId);
  if (!def) {
    return;
  }
  for (const pin of def.inputs) {
    if (pin.kind !== PinKind.Scalar) {
      continue;
    }
    if (node.pinDefaults && Object.prototype.hasOwnProperty.call(node.pinDefaults, pin.id)) {
      const existing = node.pinDefaults[/** @type {string} */ (pin.id)];
      if (existing !== undefined && existing !== null) {
        continue;
      }
    }
    if (node.params && node.params[pin.id] != null) {
      const v = node.params[pin.id];
      if (typeof v === "number" && !Number.isNaN(v)) {
        if (!node.pinDefaults) {
          node.pinDefaults = {};
        }
        node.pinDefaults[pin.id] = v;
      } else if (typeof v === "string" && v !== "" && !Number.isNaN(parseFloat(v))) {
        if (!node.pinDefaults) {
          node.pinDefaults = {};
        }
        node.pinDefaults[pin.id] = parseFloat(v);
      }
    }
  }
}
