import { createDefaultState } from "../noise/defaults.js";

const BASE = createDefaultState();

export const PRESETS = {
  default: { ...createDefaultState() },
  terrain: {
    ...BASE,
    baseKind: "os2s",
    fractal: "fbm",
    octaves: 6,
    lacunarity: 2.1,
    gain: 0.48,
    frequency: 1.1,
    amplitude: 1.0,
    orientation: 1,
    colorRamp: "terrain",
    worldScale: 1.0
  },
  clouds: {
    ...BASE,
    baseKind: "os2s",
    fractal: "fbm",
    octaves: 5,
    lacunarity: 2.0,
    gain: 0.55,
    frequency: 0.9,
    amplitude: 1.0,
    orientation: 1,
    colorRamp: "gray",
    contrast: 1.1,
    brightness: 0.02
  },
  marble: {
    ...BASE,
    baseKind: "os2",
    fractal: "fbm",
    octaves: 7,
    lacunarity: 2.0,
    gain: 0.5,
    frequency: 2.2,
    amplitude: 1.0,
    orientation: 0,
    colorRamp: "heat"
  },
  "cellular-cracks": {
    ...BASE,
    baseKind: "worley",
    fractal: "none",
    jitter: 0.85,
    cellMetric: 0,
    cellReturn: 2,
    frequency: 1.0,
    amplitude: 1.0,
    contrast: 1.2,
    colorRamp: "gray"
  },
  ridged: {
    ...BASE,
    baseKind: "os2s",
    fractal: "rigid",
    octaves: 5,
    lacunarity: 2.0,
    gain: 0.5,
    rigidExp: 2.0,
    rigidWeight: 1.0,
    frequency: 1.2,
    amplitude: 1.0,
    colorRamp: "terrain"
  }
};
