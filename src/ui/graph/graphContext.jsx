import { createContext, useContext } from "react";

/**
 * @typedef {object} GraphActions
 * @property {(nodeId: string, pinId: string, v: number) => void} setPin
 * @property {(nodeId: string, patch: object) => void} setParam
 */

/** @type {React.Context<GraphActions>} */
// eslint-disable-next-line
export const GraphActionsCtx = createContext(
  /** @type {GraphActions} */ ({
    setPin: () => {},
    setParam: () => {}
  })
);

export function useGraphActions() {
  return useContext(GraphActionsCtx);
}
