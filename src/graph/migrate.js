import { ASSET_VERSION } from "./types.js";

/**
 * @param {unknown} raw
 * @returns {{ data: any, fromVersion: number, warnings: string[] }}
 */
export function migrate(raw) {
  const warnings = [];
  if (!raw || typeof raw !== "object") {
    return { data: { name: "Untitled", nodes: [], links: [] }, fromVersion: 0, warnings };
  }
  const o = /** @type {any} */ (raw);
  let v = typeof o.version === "number" ? o.version : 0;
  if (v < 0) {
    v = 0;
  }
  if (o.version == null) {
    warnings.push("Graph missing version; assuming legacy import");
  }

  let data = o;
  if (v === 0) {
    const nodes = Array.isArray(o.nodes) ? o.nodes : [];
    for (const n of nodes) {
      if (n && typeof n === "object" && n.isUnknown) {
        warnings.push(`Node ${n.id} marked unknown; evaluators may be missing`);
      }
    }
  }

  if (v < 1) {
    data = { ...o, version: ASSET_VERSION, nodes: o.nodes || [], links: o.links || [] };
    v = ASSET_VERSION;
  }

  if (v < 2) {
    data = { ...data, version: ASSET_VERSION, nodes: data.nodes || [], links: data.links || [] };
    v = ASSET_VERSION;
  }

  if (v < ASSET_VERSION) {
    warnings.push("Future: add step migrations for newer format");
  }

  return { data, fromVersion: v, warnings };
}
