import { createRendererController } from "./terrain/RendererController.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {() => any} getState
 */
export function createNoiseView(canvas, getState) {
  return createRendererController(
    canvas,
    getState,
    () => getState().noiseGraph
  );
}
