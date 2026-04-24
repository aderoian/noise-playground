import { makeSimplex3D } from "open-simplex-noise";
import { seedToOffset } from "../../noise/defaults.js";
import { worley2D, sampleFractal } from "../../graph/noiseCpu.js";

/**
 * @param {number} wx
 * @param {number} wy
 * @param {object} st
 * @param {number} tSec
 * @returns {number} unscaled by meshHeight/height offset (raw ~ [-1,1] * amp)
 */
export function sampleProceduralHeightRaw(wx, wy, st, tSec) {
  const zc = st.viewMode === "slice3d" ? st.sliceZ : 0.0;
  const uT = st.animate ? tSec * st.timeSpeed : 0.0;
  const so = seedToOffset(st.seed);
  const ox = st.offset.x + so.x;
  const oy = st.offset.y + so.y;
  const oz = st.offset.z + so.z;
  const px0 = (wx + ox) * st.frequency;
  const py0 = (wy + oy) * st.frequency;
  const pz0 = (zc + uT + oz) * st.frequency;

  const n3 = makeSimplex3D(st.seed);
  const cell = {
    jitter: st.jitter,
    cellMetric: st.cellMetric,
    cellReturn: st.cellReturn
  };
  const oct = st.octaves | 0;
  const baseKind = st.baseKind;

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  function baseN3(x, y, z) {
    if (baseKind === "os2" || baseKind === "os2s") {
      return n3(x, y, z);
    }
    if (baseKind === "worley") {
      return worley2D(x, y, st.jitter, st.cellMetric, st.cellReturn) * 2.0 - 1.0;
    }
    return n3(x, y, z);
  }

  const fractal = st.fractal;
  if (fractal === "none" || !fractal) {
    return baseN3(px0, py0, pz0) * st.amplitude;
  }
  if (fractal === "fbm") {
    let sum = 0.0;
    let norm = 0.0;
    let f = 1.0;
    let a = 1.0;
    for (let o = 0; o < Math.min(8, oct || 1); o++) {
      sum += a * baseN3(px0 * f, py0 * f, pz0 * f);
      norm += a;
      f *= st.lacunarity;
      a *= st.gain;
    }
    return (sum / Math.max(norm, 1e-4)) * st.amplitude;
  }
  if (fractal === "rigid") {
    let sum = 0.0;
    let norm = 0.0;
    let f = 1.0;
    let a = 1.0;
    let w = 1.0;
    for (let o2 = 0; o2 < Math.min(8, oct || 1); o2++) {
      let n2 = 1.0 - Math.abs(baseN3(px0 * f, py0 * f, pz0 * f));
      n2 = Math.pow(Math.max(n2, 0.0), st.rigidExp);
      sum += a * w * n2;
      norm += a * w;
      f *= st.lacunarity;
      a *= st.gain;
      w *= st.rigidWeight;
    }
    return (sum / Math.max(norm, 1e-4)) * st.amplitude;
  }
  const kindM =
    st.baseKind === "worley" ? "worley" : st.baseKind === "os2s" ? "os2" : "os2";
  return (
    sampleFractal(
      kindM,
      px0,
      py0,
      pz0,
      st.seed,
      { fractal: "fbm", octaves: st.octaves, lacunarity: st.lacunarity, gain: st.gain, cell }
    ) * st.amplitude
  );
}
