/**
 * @typedef {object} ParamEnumOption
 * @property {number | string} value
 * @property {string} label
 */

/**
 * @typedef {object} ParamFieldEnum
 * @property {"enum"} kind
 * @property {ParamEnumOption[]} options
 */

/**
 * @typedef {object} ParamFieldNumber
 * @property {"number"} kind
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 */

/**
 * @typedef {object} ParamFieldBoolean
 * @property {"boolean"} kind
 */

/**
 * @typedef {ParamFieldEnum | ParamFieldNumber | ParamFieldBoolean} ParamFieldSpec
 */

/** @type {ParamFieldNumber} */
const noiseNumber = { kind: "number", min: -1e6, max: 1e6, step: 1 };
/** @type {ParamFieldNumber} */
const jitterSpec = { kind: "number", min: 0, max: 2, step: 0.01 };
/** @type {ParamFieldEnum} */
const cellMetricSpec = {
  kind: "enum",
  options: [
    { value: 0, label: "Euclidean" },
    { value: 1, label: "Manhattan" },
    { value: 2, label: "Chebyshev" }
  ]
};
/** @type {ParamFieldEnum} */
const cellReturnSpec = {
  kind: "enum",
  options: [
    { value: 0, label: "F1" },
    { value: 1, label: "F2" },
    { value: 2, label: "F2−F1" }
  ]
};
/** @type {ParamFieldEnum} */
const normalizeSpec = {
  kind: "enum",
  options: [
    { value: 0, label: "Off" },
    { value: 1, label: "On" }
  ]
};

/** @type {ParamFieldEnum} */
const fractalBaseSpec = {
  kind: "enum",
  options: [
    { value: "value", label: "Value" },
    { value: "perlin", label: "Perlin" },
    { value: "simplex2", label: "Simplex" },
    { value: "os2", label: "OpenSimplex" },
    { value: "white", label: "White" },
    { value: "worley", label: "Worley" }
  ]
};

const noiseParams = {
  seed: noiseNumber,
  jitter: jitterSpec,
  cellMetric: cellMetricSpec,
  cellReturn: cellReturnSpec,
  normalize: normalizeSpec
};

const fractalParams = {
  base: fractalBaseSpec,
  octaves: { kind: "number", min: 1, max: 16, step: 1 },
  lacunarity: { kind: "number", min: 0.1, max: 8, step: 0.05 },
  gain: { kind: "number", min: 0, max: 2, step: 0.01 },
  seed: noiseNumber,
  jitter: jitterSpec,
  cellMetric: cellMetricSpec,
  cellReturn: cellReturnSpec
};

/**
 * @type {Map<string, Record<string, ParamFieldSpec>>}
 */
const byType = new Map();

/**
 * @param {string} typeId
 */
function addNoiseType(typeId) {
  byType.set(typeId, /** @type {Record<string, ParamFieldSpec>} */ (noiseParams));
}
addNoiseType("noise_white");
addNoiseType("noise_value");
addNoiseType("noise_perlin");
addNoiseType("noise_simplex");
addNoiseType("noise_os2");
addNoiseType("noise_worley");

for (const id of /** @type {const} */ (["fbm", "billow", "ridged", "turbulence"])) {
  byType.set(id, /** @type {Record<string, ParamFieldSpec>} */ (fractalParams));
}

byType.set("swizzle", {
  component: {
    kind: "enum",
    options: [
      { value: 0, label: "X" },
      { value: 1, label: "Y" },
      { value: 2, label: "Z" }
    ]
  }
});
byType.set("constant", {
  value: { kind: "number", min: -1e3, max: 1e3, step: 0.0001 }
});
byType.set("domain_warp", {
  seed: noiseNumber,
  octaves: { kind: "number", min: 1, max: 12, step: 1 }
});
byType.set("select", {
  threshold: { kind: "number", min: 0, max: 1, step: 0.001 }
});

/**
 * @param {string} typeId
 * @param {string} key
 * @returns {ParamFieldSpec | null}
 */
export function getParamFieldSpec(typeId, key) {
  const t = byType.get(typeId);
  if (!t) {
    return null;
  }
  const s = t[key];
  if (s && typeof s === "object" && "kind" in s) {
    return s;
  }
  return null;
}
