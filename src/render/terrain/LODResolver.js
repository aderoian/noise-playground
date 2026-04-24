/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number} Chebyshev / square-ring distance in chunk units
 */
export function chebyshevChunkDistance(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * @param {object} st
 * @param {number} distRing
 * @returns {number} mesh segments (edge count) for a chunk
 */
export function resolveMeshSegmentsForRing(st, distRing) {
  const defS = st.defaultChunkResolution | 0;
  const minS = st.minLodResolution | 0;
  const d0 = distRing | 0;
  if (!st.lodEnabled) {
    return Math.max(2, defS);
  }
  if (d0 <= 0) {
    return Math.max(2, defS);
  }
  let r = defS;
  for (let k = 0; k < d0; k++) {
    r = Math.max(2, (r * 0.5) | 0);
  }
  r = Math.max(minS, Math.min(defS, r));
  return r;
}
