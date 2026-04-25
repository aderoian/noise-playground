import { ASSET_VERSION } from "./types.js";

/**
 * @param {unknown} raw
 * @returns {{ data: any, fromVersion: number, warnings: string[] }}
 */
export function migrate(raw) {
  const warnings = [];
  if (!raw || typeof raw !== "object") {
    return { data: { name: "Untitled", nodes: [], links: [], version: ASSET_VERSION }, fromVersion: 0, warnings };
  }
  const o = /** @type {any} */ (raw);
  const fromVersionIn = typeof o.version === "number" ? o.version : 0;
  let v = fromVersionIn;
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
    data = { ...o, version: 1, nodes: o.nodes || [], links: o.links || [] };
    v = 1;
  }

  if (v < 2) {
    data = { ...data, version: 2, nodes: data.nodes || [], links: data.links || [] };
    v = 2;
  }

  if (v < 3) {
    data = {
      ...data,
      version: 3,
      nodes: data.nodes || [],
      links: data.links || [],
      biomeProject: data.biomeProject ?? null
    };
    v = 3;
    if (fromVersionIn < 3) {
      warnings.push("Migrated to v3 biome-capable format");
    }
  }

  data = { ...data, version: ASSET_VERSION };
  if (fromVersionIn < ASSET_VERSION) {
    warnings.push(`Migrated from version ${fromVersionIn} to ${ASSET_VERSION}`);
  }

  return { data, fromVersion: fromVersionIn, warnings };
}
