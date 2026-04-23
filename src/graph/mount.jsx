import { createRoot } from "react-dom/client";
import React from "react";
import { GraphEditor } from "../ui/graph/GraphEditor.jsx";

/**
 * @param {import("./types.js").NoiseGraph} g
 * @returns {string}
 */
function graphEvalSignature(g) {
  return JSON.stringify({
    id: g.id,
    version: g.version,
    outputNodeId: g.outputNodeId,
    nodes: g.nodes.map((n) => ({
      id: n.id,
      typeId: n.typeId,
      params: n.params,
      pinDefaults: n.pinDefaults,
      isUnknown: n.isUnknown
    })),
    links: g.links.map((l) => ({
      id: l.id,
      from: l.from,
      to: l.to
    }))
  });
}

/**
 * Bumps `graphRevision` when the *eval* payload changes (not node positions / layout).
 * Same signature + position-only drag => apply `noiseGraph` only (keeps revision; no rebake).
 * @param {HTMLElement} el
 * @param {() => object} getState
 * @param {object} api
 * @param {(p: object) => void} api.applyPatch
 * @param {() => void} [api.onRerender]
 */
export function mountGraphApp(el, getState, api) {
  const root = createRoot(el);
  let lastGraphEvalSignature = null;

  function onG(/** @type {import("./types.js").NoiseGraph} */ g) {
    const sig = graphEvalSignature(g);
    if (lastGraphEvalSignature !== null && sig === lastGraphEvalSignature) {
      api.applyPatch({ noiseGraph: g });
      return;
    }
    lastGraphEvalSignature = sig;
    const st = getState();
    const nextRev = (st.graphRevision | 0) + 1;
    api.applyPatch({ noiseGraph: g, graphRevision: nextRev });
  }
  function onFile(/** @type {import("./types.js").NoiseGraph} */ g) {
    lastGraphEvalSignature = null;
    const st = getState();
    const nextKey = (st.graphKey | 0) + 1;
    api.applyPatch({ noiseGraph: g, graphKey: nextKey });
  }
  return {
    render() {
      const st = getState();
      root.render(
        <GraphEditor
          key={st.graphKey ?? 0}
          initialGraph={st.noiseGraph}
          onGraphChange={onG}
          onGraphFileLoaded={onFile}
        />
      );
    },
    unmount() {
      root.unmount();
    }
  };
}
