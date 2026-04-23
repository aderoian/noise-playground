import { describe, it, expect } from "vitest";
import { createDefaultGraph } from "./defaultGraph.js";
import { createBuiltinRegistry } from "./registry.js";
import { validateGraph, hasErrors } from "./validate.js";
import { evaluateAt } from "./evaluate.js";
import { saveGraphToJson, loadGraphFromJson } from "./serialize.js";
import { addLink, addNode, createGraph } from "./model.js";
import { ASSET_VERSION } from "./types.js";

describe("graph", () => {
  const reg = createBuiltinRegistry();

  it("default graph validates and evaluates", () => {
    const g = createDefaultGraph();
    const issues = validateGraph(g, reg);
    expect(hasErrors(issues)).toBe(false);
    const v = evaluateAt(g, reg, { x: 0.1, y: 0.2, z: 0, time: 0, seed: 1 });
    expect(Number.isFinite(v)).toBe(true);
  });

  it("serializes and loads roundtrip", () => {
    const g = createDefaultGraph();
    const j = saveGraphToJson(g);
    const { graph: g2 } = loadGraphFromJson(j, reg);
    expect(g2.version).toBe(ASSET_VERSION);
    expect(g2.nodes.length).toBe(g.nodes.length);
    const issues = validateGraph(g2, reg);
    expect(hasErrors(issues)).toBe(false);
  });

  it("detects cycle", () => {
    const g = createGraph("t");
    const a = addNode(g, "pos_x", 0, 0, reg);
    const b = addNode(g, "add", 100, 0, reg);
    const c = addNode(g, "add", 200, 0, reg);
    addLink(g, a, "out", b, "a", reg);
    addLink(g, b, "out", c, "a", reg);
    addLink(g, c, "out", b, "b", reg);
    const issues = validateGraph(g, reg);
    expect(issues.some((i) => i.code === "cycle")).toBe(true);
  });
});
