import { Vector3 } from "three";

const vLook = new Vector3();

/**
 * @param {object} st
 * @returns {{ x: number, y: number }}
 */
export function getViewCenterWorldXY(st) {
  if (st.rendererViewMode === "complex") {
    return { x: st.flyCamera.x, y: st.flyCamera.y };
  }
  return { x: -st.offset.x, y: -st.offset.y };
}

/**
 * @param {object} st
 * @returns {{ cx: number, cy: number }}
 */
export function getCenterChunkCoord(st) {
  const c = getViewCenterWorldXY(st);
  const S = st.chunkWorldSize > 0 ? st.chunkWorldSize : 0.1;
  return {
    cx: Math.floor(c.x / S),
    cy: Math.floor(c.y / S)
  };
}

/**
 * Camera position in chunk space (not floored) so a circular load radius
 * is centered on the true view position, not on integer chunk indices.
 * @param {object} st
 * @returns {{ fxc: number, fyc: number }}
 */
export function getViewCenterChunkFloat(st) {
  const c = getViewCenterWorldXY(st);
  const S = st.chunkWorldSize > 0 ? st.chunkWorldSize : 0.1;
  return { fxc: c.x / S, fyc: c.y / S };
}

const CAM_Z0 = 2.85;
const CAM_Y = 1.6;

/**
 * @param {import("three").PerspectiveCamera} camera
 * @param {object} st
 */
export function applyCameraFromViewMode(camera, st) {
  if (st.rendererViewMode === "complex") {
    const fc = st.flyCamera;
    camera.position.set(fc.x, fc.y, fc.z);
    const cosP = Math.cos(fc.pitch);
    const sinP = Math.sin(fc.pitch);
    const cosY = Math.cos(fc.yaw);
    const sinY = Math.sin(fc.yaw);
    const fx = cosP * cosY;
    const fy = cosP * sinY;
    const fz = -sinP;
    vLook.set(fc.x + fx, fc.y + fy, fc.z + fz);
    camera.up.set(0, 0, 1);
    camera.lookAt(vLook);
    return;
  }
  const z = CAM_Z0 / (st.cameraZoom > 0 ? st.cameraZoom : 1.0);
  camera.position.set(0, CAM_Y, z);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0.15);
}
