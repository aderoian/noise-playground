import { createRoot } from "react-dom/client";
import React from "react";
import { GraphEditor } from "../ui/graph/GraphEditor.jsx";
import {
  graphEvalSignature,
  graphParamSignature,
  graphTopologySignature
} from "./evalSignature.js";

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
  let lastGraphTopologySignature = null;
  let lastGraphParamSignature = null;

  function onG(/** @type {import("./types.js").NoiseGraph} */ g) {
    const evalSig = graphEvalSignature(g);
    const topoSig = graphTopologySignature(g);
    const paramSig = graphParamSignature(g);
    if (lastGraphEvalSignature !== null && evalSig === lastGraphEvalSignature) {
      api.applyPatch({ noiseGraph: g });
      return;
    }
    const topologyChanged =
      lastGraphTopologySignature === null || topoSig !== lastGraphTopologySignature;
    const paramChanged =
      lastGraphParamSignature === null || paramSig !== lastGraphParamSignature;
    lastGraphEvalSignature = evalSig;
    lastGraphTopologySignature = topoSig;
    lastGraphParamSignature = paramSig;
    const st = getState();
    const nextEvalRev = (st.graphRevision | 0) + 1;
    const nextTopoRev = (st.graphTopologyRevision | 0) + (topologyChanged ? 1 : 0);
    const nextParamRev = (st.graphParamRevision | 0) + (paramChanged ? 1 : 0);
    api.applyPatch({
      noiseGraph: g,
      graphRevision: nextEvalRev,
      graphTopologyRevision: nextTopoRev,
      graphParamRevision: nextParamRev,
      graphTopologyHash: topoSig,
      graphParamHash: paramSig,
      graphLastEditKind: topologyChanged ? "topology" : "param"
    });
  }
  function onFile(/** @type {import("./types.js").NoiseGraph} */ g) {
    lastGraphEvalSignature = null;
    lastGraphTopologySignature = null;
    lastGraphParamSignature = null;
    const st = getState();
    const nextKey = (st.graphKey | 0) + 1;
    api.applyPatch({
      noiseGraph: g,
      graphKey: nextKey,
      graphEditTarget: "main",
      graphRevision: (st.graphRevision | 0) + 1,
      graphTopologyRevision: (st.graphTopologyRevision | 0) + 1,
      graphParamRevision: (st.graphParamRevision | 0) + 1,
      graphTopologyHash: graphTopologySignature(g),
      graphParamHash: graphParamSignature(g),
      graphLastEditKind: "topology"
    });
  }
  return {
    render() {
      const st = getState();
      root.render(
        <GraphEditor
          key={`${st.graphKey ?? 0}-${st.graphEditTarget || "main"}`}
          initialGraph={st.noiseGraph}
          graphEditTarget={st.graphEditTarget || "main"}
          onGraphEditTargetChange={(t) => api.applyPatch({ graphEditTarget: t })}
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
