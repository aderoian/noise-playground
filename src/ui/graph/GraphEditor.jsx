import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const CTX_W = 220;
const CTX_H = 320;

/**
 * @param {object} p
 * @param {() => void} p.onPointerDownCapture
 * @param {import("react").ReactNode} p.children
 * @param {number} p.x
 * @param {number} p.y
 */
const GraphContextMenuLayer = forwardRef(
  /**
   * @param {object} p
   * @param {import("react").Ref<HTMLDivElement | null>} ref
   */
  function GraphContextMenuLayerInner({ onPointerDownCapture, children, x, y }, ref) {
    const left = Math.max(8, Math.min(x, window.innerWidth - CTX_W - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - CTX_H - 8));
    return (
      <div
        ref={ref}
        className="graph-ctx-menu"
        style={{ left, top }}
        role="menu"
        onPointerDownCapture={onPointerDownCapture}
      >
        {children}
      </div>
    );
  }
);
GraphContextMenuLayer.displayName = "GraphContextMenuLayer";

/**
 * @param {object} p
 * @param {import("@xyflow/react").Node} p.node
 * @param {import("@xyflow/react").Edge[]} p.edges
 * @param {(id: string) => void} p.onDeleteNode
 * @param {(nodeId: string, targetHandle: string) => void} p.onDisconnectInput
 */
function GraphContextMenuNode({ node, edges, onDeleteNode, onDisconnectInput }) {
  const ins = (node.data && node.data.inputs) || [];
  const p0 = ins[0];
  const p1 = ins[1];
  const has0 = p0 && edges.some((e) => e.target === node.id && e.targetHandle === p0.id);
  const has1 = p1 && edges.some((e) => e.target === node.id && e.targetHandle === p1.id);
  return (
    <>
      <button
        type="button"
        className="graph-ctx-menu__item"
        role="menuitem"
        onClick={() => onDeleteNode(node.id)}
      >
        Delete node
      </button>
      {(p0 || p1) && <div className="graph-ctx-menu__sep" role="separator" />}
      {p0 && (
        <button
          type="button"
          className="graph-ctx-menu__item"
          role="menuitem"
          disabled={!has0}
          onClick={() => onDisconnectInput(node.id, p0.id)}
        >
          {`Disconnect ${p0.name || "input 1"}`}
        </button>
      )}
      {p1 && (
        <button
          type="button"
          className="graph-ctx-menu__item"
          role="menuitem"
          disabled={!has1}
          onClick={() => onDisconnectInput(node.id, p1.id)}
        >
          {`Disconnect ${p1.name || "input 2"}`}
        </button>
      )}
    </>
  );
}

/**
 * @param {object} p
 * @param {import("@xyflow/react").Edge} p.edge
 * @param {import("@xyflow/react").Node[]} p.nodes
 * @param {() => void} p.onRemove
 */
function GraphContextMenuEdge({ edge, nodes, onRemove }) {
  const sn = nodes.find((n) => n.id === edge.source);
  const tn = nodes.find((n) => n.id === edge.target);
  const sLabel = (sn && sn.data && sn.data.label) || edge.source;
  const tLabel = (tn && tn.data && tn.data.label) || edge.target;
  return (
    <>
      <button type="button" className="graph-ctx-menu__item" role="menuitem" onClick={onRemove}>
        Delete path
      </button>
      <div className="graph-ctx-menu__sep" role="separator" />
      <button
        type="button"
        className="graph-ctx-menu__item"
        role="menuitem"
        onClick={onRemove}
        title={`Remove wire from the source (left): ${sLabel}`}
      >
        Disconnect left
      </button>
      <button
        type="button"
        className="graph-ctx-menu__item"
        role="menuitem"
        onClick={onRemove}
        title={`Remove wire at the target (right): ${tLabel}`}
      >
        Disconnect right
      </button>
    </>
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

  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [ctxMenu, setCtxMenu] = useState(
    /** @type {null | { kind: "node"; nodeId: string; x: number; y: number } | { kind: "edge"; edgeId: string; x: number; y: number }} */ (
      null
    )
  );

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

  const deleteNodeId = useCallback(
    (nodeId) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setCtxMenu(null);
    },
    [setNodes, setEdges]
  );

  const deleteEdgeIdById = useCallback(
    (edgeId) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setCtxMenu(null);
    },
    [setEdges]
  );

  const disconnectNodeInput = useCallback(
    (nodeId, targetHandle) => {
      setEdges((eds) => eds.filter((e) => !(e.target === nodeId && e.targetHandle === targetHandle)));
      setCtxMenu(null);
    },
    [setEdges]
  );

  const onNodeContextMenu = useCallback(
    /**
     * @param {import("react").MouseEvent} e
     * @param {import("@xyflow/react").Node} node
     */
    (e, node) => {
      if (isFormFieldTarget(e)) {
        return;
      }
      e.preventDefault();
      setCtxMenu({ kind: "node", nodeId: node.id, x: e.clientX, y: e.clientY });
    },
    []
  );

  const onEdgeContextMenu = useCallback(
    /**
     * @param {import("react").MouseEvent} e
     * @param {import("@xyflow/react").Edge} edge
     */
    (e, edge) => {
      e.preventDefault();
      setCtxMenu({ kind: "edge", edgeId: edge.id, x: e.clientX, y: e.clientY });
    },
    []
  );

  const onPaneContextMenu = useCallback(
    /** @param {import("react").MouseEvent} e */
    (e) => {
      e.preventDefault();
      setCtxMenu(null);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setCtxMenu(null);
  }, []);

  useEffect(() => {
    if (!ctxMenu) {
      return;
    }
    const onDown = (/** @type {PointerEvent} */ e) => {
      const m = menuRef.current;
      if (m && e.target instanceof Node && m.contains(e.target)) {
        return;
      }
      setCtxMenu(null);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === "Escape") {
        setCtxMenu(null);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [ctxMenu]);

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

  const contextMenuNode =
    ctxMenu && ctxMenu.kind === "node" ? nodes.find((n) => n.id === ctxMenu.nodeId) ?? null : null;

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
              onNodeContextMenu={onNodeContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              onPaneContextMenu={onPaneContextMenu}
              onPaneClick={onPaneClick}
              deleteKeyCode={[]}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
            {ctxMenu &&
              createPortal(
                <GraphContextMenuLayer
                  ref={menuRef}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  x={ctxMenu.x}
                  y={ctxMenu.y}
                >
                  {ctxMenu.kind === "node" && contextMenuNode && (
                    <GraphContextMenuNode
                      node={contextMenuNode}
                      edges={edges}
                      onDeleteNode={deleteNodeId}
                      onDisconnectInput={disconnectNodeInput}
                    />
                  )}
                  {ctxMenu.kind === "node" && !contextMenuNode && (
                    <div className="graph-ctx-menu__empty" role="none">
                      Node not found
                    </div>
                  )}
                  {ctxMenu.kind === "edge" && (() => {
                    const ed = edges.find((q) => q.id === ctxMenu.edgeId);
                    if (!ed) {
                      return (
                        <div className="graph-ctx-menu__empty" role="none">
                          Path not found
                        </div>
                      );
                    }
                    return (
                      <GraphContextMenuEdge
                        edge={ed}
                        nodes={nodes}
                        onRemove={() => deleteEdgeIdById(ed.id)}
                      />
                    );
                  })()}
                </GraphContextMenuLayer>,
                document.body
              )}
          </ReactFlowProvider>
        </div>
      </div>
    </GraphActionsCtx.Provider>
  );
}
