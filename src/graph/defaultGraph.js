import { addLink, addNode, createGraph } from "./model.js";
import { createBuiltinRegistry } from "./registry.js";
import { createDefaultBiomeProject } from "./biomeProject.js";

const registry = /* @__PURE__ */ (() => createBuiltinRegistry())();

/**
 * A simple valid graph: FBM( context position ) -> Output, plus default biome project
 * @returns {import("./types.js").NoiseGraph}
 */
export function createDefaultGraph() {
  const g = createGraph("Default");
  const pos = addNode(g, "context_position", 40, 80, registry);
  const fbm = addNode(g, "fbm", 240, 60, registry);
  const out = addNode(g, "output", 420, 100, registry);
  addLink(
    g,
    pos,
    "out",
    fbm,
    "position",
    registry
  );
  addLink(
    g,
    fbm,
    "out",
    out,
    "value",
    registry
  );
  g.outputNodeId = out;
  g.biomeProject = createDefaultBiomeProject();
  return g;
}
