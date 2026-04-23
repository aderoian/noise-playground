import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NoiseNode } from "./NoiseNode.jsx";
import { GraphActionsCtx } from "./graphContext.jsx";
import { createBuiltinRegistry } from "../../graph/registry.js";
import { flowToGraph, graphToFlow } from "../../graph/flowAdapters.js";
import { validateGraph } from "../../graph/validate.js";
import { saveGraphToJson, loadGraphFromJson } from "../../graph/serialize.js";
import { createDefaultGraph } from "../../graph/defaultGraph.js";
import { defaultPinDefaultsFromTypeDef } from "../../graph/model.js";

const nodeTypes = { noise: NoiseNode };

/**
 * @param {Event} e
 */
function isFormFieldTarget(e) {
  const t = e.target;
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement
  );
}

/**
 * @param {object} props
 * @param {import("../../graph/types.js").NoiseGraph} props.initialGraph
 * @param {(g: import("../../graph/types.js").NoiseGraph) => void} props.onGraphChange
 * @param {(g: import("../../graph/types.js").NoiseGraph) => void} [props.onGraphFileLoaded] remounts editor when a file is loaded
 */
export function GraphEditor({ initialGraph, onGraphChange, onGraphFileLoaded }) {
  const registry = useMemo(() => createBuiltinRegistry(), []);
  const boot = useMemo(
    () => initialGraph || createDefaultGraph(),
    [initialGraph]
  );
  const flow0 = useMemo(() => graphToFlow(boot), [boot]);
  const init = useRef(/** @type {import("../../graph/types.js").NoiseGraph | null} */ (null));
  if (init.current === null) {
    init.current = boot;
  }
  const outRef = useRef(/** @type {import("../../graph/types.js").NoiseGraph | null} */ (null));
  const [importText, setImportText] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState(flow0.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow0.edges);

  /** @type {[[string[], string[]], (v: { nodeIds: string[]; edgeIds: string[] }) => void]} */
  const [selection, setSelection] = useState({ nodeIds: [], edgeIds: [] });

  const setPin = useCallback(
    (nodeId, pinId, v) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, pinDefaults: { ...n.data.pinDefaults, [pinId]: v } } }
            : n
        )
      );
    },
    [setNodes]
  );

  const setParam = useCallback(
    (nodeId, patch) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, ...patch } } } : n
        )
      );
    },
    [setNodes]
  );

  const issues = useMemo(
    () => validateGraph(flowToGraph(nodes, edges, null), registry),
    [nodes, edges, registry]
  );
  const errCount = issues.filter((i) => i.level === "error").length;

  useEffect(() => {
    const g = flowToGraph(nodes, edges, outRef.current || init.current);
    outRef.current = g;
    onGraphChange(g);
  }, [nodes, edges, onGraphChange]);

  const onConnect = useCallback(
    (c) => {
      setEdges((eds) =>
        addEdge({ ...c, id: `e_${c.source}_${c.target}_${c.targetHandle || "h"}` }, eds)
      );
    },
    [setEdges]
  );

  const onSelectionChange = useCallback(
    /**
     * @param {{ nodes: { id: string }[]; edges: { id: string }[] }} p
     */
    ({ nodes: selNodes, edges: selEdges }) => {
      setSelection({
        nodeIds: (selNodes || []).map((n) => n.id),
        edgeIds: (selEdges || []).map((e) => e.id)
      });
    },
    []
  );

  const deleteSelectedNodes = useCallback(() => {
    const { nodeIds } = selection;
    if (nodeIds.length === 0) {
      return;
    }
    const idSet = new Set(nodeIds);
    setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
    setEdges((eds) => eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
  }, [selection, setNodes, setEdges]);

  const deleteSelectedEdges = useCallback(() => {
    const { edgeIds } = selection;
    if (edgeIds.length === 0) {
      return;
    }
    const idSet = new Set(edgeIds);
    setEdges((eds) => eds.filter((e) => !idSet.has(e.id)));
  }, [selection, setEdges]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") {
        return;
      }
      if (isFormFieldTarget(e)) {
        return;
      }
      e.preventDefault();
      if (selection.edgeIds.length > 0) {
        deleteSelectedEdges();
        return;
      }
      if (selection.nodeIds.length > 0) {
        deleteSelectedNodes();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [selection, deleteSelectedEdges, deleteSelectedNodes]);

  const addMenu = useMemo(() => {
    const m = new Map();
    for (const d of registry.all()) {
      if (!m.has(d.category)) {
        m.set(d.category, []);
      }
      m.get(d.category).push(d);
    }
    return m;
  }, [registry]);

  const act = useMemo(
    () => ({ setPin, setParam }),
    [setPin, setParam]
  );

  const canDeleteNode = selection.nodeIds.length > 0;
  const canDeleteEdge = selection.edgeIds.length > 0;

  return (
    <GraphActionsCtx.Provider value={act}>
      <div className="graph-editor">
        <div className="graph-editor__bar">
          <div className="graph-editor__add">
            <span className="graph-editor__add-label">Add</span>
            <select
              className="graph-editor__add-select"
              value=""
              onChange={(e) => {
                const typeId = e.target.value;
                e.target.value = "";
                if (!typeId) {
                  return;
                }
                const def = registry.get(typeId);
                if (!def) {
                  return;
                }
                const id = `n_${Date.now()}`;
                const n = {
                  id,
                  type: "noise",
                  position: { x: 40 + Math.random() * 100, y: 40 + Math.random() * 100 },
                  data: {
                    typeId,
                    label: def.label,
                    category: def.category,
                    params: { ...def.defaultParams },
                    pinDefaults: defaultPinDefaultsFromTypeDef(
                      /** @type {import("../../graph/types.js").NodeTypeDef} */ (def)
                    ),
                    inputs: def.inputs,
                    outputs: def.outputs
                  }
                };
                setNodes((ns) => [...ns, n]);
              }}
            >
              <option value="">Choose node&hellip;</option>
              {[...addMenu.keys()].map((c) => (
                <optgroup key={c} label={c}>
                  {addMenu.get(c).map((d) => (
                    <option key={d.typeId} value={d.typeId}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="graph-editor__bar-actions" role="group" aria-label="Delete selection">
            <button
              type="button"
              className="btn"
              title="Delete selected node (Del)"
              disabled={!canDeleteNode}
              onClick={deleteSelectedNodes}
            >
              Delete node
            </button>
            <button
              type="button"
              className="btn"
              title="Delete selected path/edge (Del)"
              disabled={!canDeleteEdge}
              onClick={deleteSelectedEdges}
            >
              Delete path
            </button>
          </div>
          <div className="graph-editor__status" title="Validation">
            {errCount > 0 ? <span className="graph-editor__err">{errCount} errors</span> : <span className="graph-editor__ok">Valid</span>}
          </div>
          <div className="graph-editor__io">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const g0 = flowToGraph(nodes, edges, boot);
                const s = saveGraphToJson(g0);
                const blob = new Blob([s], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${g0.name || "graph"}.json`;
                a.click();
              }}
            >
              Save JSON
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                try {
                  const { graph } = loadGraphFromJson(importText || "{}");
                  if (onGraphFileLoaded) {
                    onGraphFileLoaded(graph);
                  } else {
                    const { nodes: n, edges: ed } = graphToFlow(graph);
                    setNodes(n);
                    setEdges(ed);
                    onGraphChange(graph);
                  }
                } catch (e) {
                  console.error(e);
                  // eslint-disable-next-line
                  window.alert("Invalid graph JSON");
                }
              }}
            >
              Load
            </button>
          </div>
        </div>
        <div className="graph-editor__io-row">
          <textarea
            className="graph-editor__textarea"
            rows={2}
            placeholder="Paste graph JSON, then click Load"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
        </div>
        <div className="graph-editor__flow">
          <ReactFlowProvider>
            <ReactFlow
              nodeTypes={nodeTypes}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              deleteKeyCode={[]}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </GraphActionsCtx.Provider>
  );
}
