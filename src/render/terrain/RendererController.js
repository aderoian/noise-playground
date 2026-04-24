import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  GLSL3,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RawShaderMaterial,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import { stateToUniforms } from "../../noise/defaults.js";
import { validateAndNormalize } from "../../noise/state.js";
import { buildChunkTerrainVertexShader, buildChunkTerrainFragmentShader } from "../../shaders/chunkMeshShaders.js";
import { buildChunkTerrainGeometry } from "./MeshBuilder.js";
import { resolveLodLevel, resolveMeshSegmentsForRing } from "./LODResolver.js";
import {
  getCenterChunkCoord,
  getViewCenterChunkFloat,
  applyCameraFromViewMode,
  getViewCenterWorldXY
} from "./ViewController.js";
import { terrainMeshBakeSignature } from "./terrainStateSignature.js";

/** Golden-ratio hues for arbitrary LOD level debug tint (shared refs, do not mutate). */
const LOD_DBG_PALETTE = Array.from({ length: 32 }, (_, i) => {
  const c = new Color().setHSL((i * 0.618033988749895) % 1, 0.62, 0.52);
  return new Vector3(c.r, c.g, c.b);
});

/**
 * @param {number} level
 * @returns {import("three").Vector3}
 */
function lodColorForLevel(level) {
  const idx = Math.max(0, level | 0) % LOD_DBG_PALETTE.length;
  return LOD_DBG_PALETTE[idx];
}

/**
 * @param {ReturnType<typeof getCenterChunkCoord>} c0
 * @param {import("../../graph/types.js").NoiseGraph | null} graph
 * @param {() => any} getState
 * @param {() => any} [getGraph]
 */
export function createRendererController(canvas, getState, getGraph) {
  const getNoiseGraph = typeof getGraph === "function" ? getGraph : () => getState().noiseGraph;
  const parent = canvas.parentElement;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new Scene();
  const camera = new PerspectiveCamera(48, 1, 0.05, 500);

  /** Unity-style orientation skybox: large inverted faces; follows camera. */
  const skyboxMats = [
    new MeshBasicMaterial({ color: 0x4a6b85, side: BackSide }),
    new MeshBasicMaterial({ color: 0x4a6b85, side: BackSide }),
    new MeshBasicMaterial({ color: 0x4d7ab8, side: BackSide }),
    new MeshBasicMaterial({ color: 0x1e2f1f, side: BackSide }),
    new MeshBasicMaterial({ color: 0x4d7290, side: BackSide }),
    new MeshBasicMaterial({ color: 0x4d7290, side: BackSide })
  ];
  const skyboxGeo = new BoxGeometry(450, 450, 450);
  const skybox = new Mesh(skyboxGeo, skyboxMats);
  skybox.name = "skybox";
  skybox.frustumCulled = false;
  skybox.renderOrder = -1;
  scene.add(skybox);

  const chunkRoot = new Group();
  scene.add(chunkRoot);
  const borderGroup = new Group();
  scene.add(borderGroup);

  const uColorMode = { value: 0 };
  const uDebugColor = { value: new Vector3(1, 1, 1) };
  const uniforms = {
    uColorMode,
    uDebugColor,
    uUseGraph: { value: 0 },
    uGraphTex: { value: null },
    uAspect: { value: 1.0 },
    uWorldScale: { value: 1.0 },
    uBaseKind: { value: 0 },
    uOrientation: { value: 0 },
    uFractal: { value: 0 },
    uOctaves: { value: 1 },
    uLacunarity: { value: 2.0 },
    uGain: { value: 0.5 },
    uFrequency: { value: 1.0 },
    uAmplitude: { value: 1.0 },
    uOffset: { value: new Vector3(0, 0, 0) },
    uJitter: { value: 0.5 },
    uCellMetric: { value: 0 },
    uCellReturn: { value: 0 },
    uRigidExp: { value: 2.0 },
    uRigidWeight: { value: 1.0 },
    uViewMode: { value: 0 },
    uSliceZ: { value: 0.0 },
    uInvert: { value: 0 },
    uContrast: { value: 1.0 },
    uBrightness: { value: 0.0 },
    uRamp: { value: 0 },
    uTime: { value: 0.0 },
    uMeshHeight: { value: 0.35 },
    uLightDir: { value: new Vector3(0.45, 0.85, 0.4) },
    uLightAmbient: { value: 0.22 },
    uLightDiffuse: { value: 0.78 }
  };

  const solidMat = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: buildChunkTerrainVertexShader(),
    fragmentShader: buildChunkTerrainFragmentShader(),
    uniforms: /** @type {any} */ (uniforms)
  });
  const wireMat = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: buildChunkTerrainVertexShader(),
    fragmentShader: buildChunkTerrainFragmentShader(),
    uniforms: /** @type {any} */ (uniforms),
    wireframe: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });

  const borderMat = new LineBasicMaterial({ color: 0xffcc00, depthTest: true });

  const clock = { start: performance.now() };
  let frameSt = /** @type {any} */ ({});

  /**
   * @type {Map<string, { geometry: import("three").BufferGeometry | null, solid: import("three").Mesh, wire: import("three").Mesh, border: import("three").Line, cx: number, cy: number, segments: number, dist: number, dirty: boolean, debugRgb: import("three").Vector3, triangleCount: number }>}
   */
  const chunkMap = new Map();

  let lastMeshBakeSig = "";
  let lastOffsetScrollSig = "";
  const viewInfo = {
    segments: 0,
    triangleCount: 0,
    activeChunkCount: 0,
    centerChunk: "—",
    cameraLabel: "—",
    viewMode: "—",
    flyPos: "—"
  };

  function resize() {
    if (!parent) {
      return;
    }
    const w = parent.clientWidth | 0;
    const h = parent.clientHeight | 0;
    if (w < 1 || h < 1) {
      return;
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function removeAndDisposeChunk(k) {
    const ch = chunkMap.get(k);
    if (!ch) {
      return;
    }
    chunkRoot.remove(ch.solid, ch.wire);
    borderGroup.remove(ch.border);
    if (ch.geometry) {
      ch.geometry.dispose();
    }
    if (ch.border && ch.border.geometry) {
      ch.border.geometry.dispose();
    }
    chunkMap.delete(k);
  }

  function buildBorderGeometry(cx, cy, size) {
    const x0 = cx * size;
    const y0 = cy * size;
    const z = 0.05;
    const p = new Float32Array(12);
    p[0] = x0;
    p[1] = y0;
    p[2] = z;
    p[3] = x0 + size;
    p[4] = y0;
    p[5] = z;
    p[6] = x0 + size;
    p[7] = y0 + size;
    p[8] = z;
    p[9] = x0;
    p[10] = y0 + size;
    p[11] = z;
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(p, 3));
    return g;
  }

  function syncRing(st) {
    /** @type {Set<string>} */
    const want = new Set();
    let fxc = 0;
    let fyc = 0;
    if (st.rendererViewMode === "chunk") {
      const n = st.chunkViewSize | 0;
      const side = n === 1 || n === 3 || n === 5 ? n : 3;
      const half = (side - 1) >> 1;
      fxc = 0;
      fyc = 0;
      for (let j = -half; j <= half; j++) {
        for (let i = -half; i <= half; i++) {
          want.add(`${i},${j}`);
        }
      }
    } else {
      const c = getCenterChunkCoord(st);
      const fc = getViewCenterChunkFloat(st);
      fxc = fc.fxc;
      fyc = fc.fyc;
      const r = st.chunkRadius | 0;
      if (r <= 0) {
        want.add(`${c.cx},${c.cy}`);
      } else {
        const r2 = r * r;
        const i0 = Math.floor(fxc - r) - 1;
        const i1 = Math.ceil(fxc + r) + 1;
        const j0 = Math.floor(fyc - r) - 1;
        const j1 = Math.ceil(fyc + r) + 1;
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const dxc = i + 0.5 - fxc;
            const dyc = j + 0.5 - fyc;
            if (dxc * dxc + dyc * dyc > r2) {
              continue;
            }
            want.add(`${i},${j}`);
          }
        }
      }
    }
    for (const k of Array.from(chunkMap.keys())) {
      if (!want.has(k)) {
        removeAndDisposeChunk(k);
      }
    }
    for (const k of want) {
      if (!chunkMap.has(k)) {
        const [sx, sy] = k.split(",").map((n) => parseInt(n, 10) || 0);
        const dE = Math.hypot(sx + 0.5 - fxc, sy + 0.5 - fyc);
        const d = Math.max(0, Math.floor(dE + 1e-9));
        const segs0 = resolveMeshSegmentsForRing(st, d);
        const level = resolveLodLevel(st, d);
        const dbg = lodColorForLevel(level);
        const emptyG = new BufferGeometry();
        const ch = {
          geometry: null,
          solid: new Mesh(emptyG, solidMat),
          wire: new Mesh(/** @type {any} */ (emptyG), wireMat),
          border: new LineLoop(/** @type {any} */ (new BufferGeometry()), borderMat),
          cx: sx,
          cy: sy,
          segments: segs0,
          dist: d,
          dirty: true,
          debugRgb: dbg,
          triangleCount: 0
        };
        ch.solid.name = "chunk-solid";
        ch.wire.name = "chunk-wire";
        ch.solid.onBeforeRender = onChunkBeforeRender;
        ch.wire.onBeforeRender = onChunkBeforeRender;
        chunkMap.set(k, ch);
        ch.solid.userData = { ch };
        ch.wire.userData = { ch };
        chunkRoot.add(ch.solid, ch.wire);
        borderGroup.add(ch.border);
        ch.border.visible = false;
      }
    }
  }

  function onChunkBeforeRender() {
    const st = frameSt;
    uColorMode.value = st && st.debugColorByLod ? 1 : 0;
    if (uColorMode.value === 1) {
      const u = this.userData.ch;
      uDebugColor.value.copy(u.debugRgb);
    }
  }

  function updateLodOnChunks(st) {
    if (st.rendererViewMode === "chunk") {
      const segsN = resolveMeshSegmentsForRing(st, 0);
      for (const ch of chunkMap.values()) {
        ch.debugRgb = lodColorForLevel(0);
        if (0 !== ch.dist) {
          ch.dist = 0;
        }
        if (segsN !== ch.segments) {
          ch.segments = segsN;
          ch.dirty = true;
        }
      }
      return;
    }
    const { fxc, fyc } = getViewCenterChunkFloat(st);
    for (const ch of chunkMap.values()) {
      const dE = Math.hypot(ch.cx + 0.5 - fxc, ch.cy + 0.5 - fyc);
      const d = Math.max(0, Math.floor(dE + 1e-9));
      const segsN = resolveMeshSegmentsForRing(st, d);
      ch.debugRgb = lodColorForLevel(resolveLodLevel(st, d));
      if (d !== ch.dist) {
        ch.dist = d;
      }
      if (segsN !== ch.segments) {
        ch.segments = segsN;
        ch.dirty = true;
      }
    }
  }

  function rebuildOneChunk(/** @type {any} */ st, g, tSec, ch) {
    const ob = ch.solid.geometry;
    if (ob) {
      ob.dispose();
    }
    if (ch.border && ch.border.geometry) {
      ch.border.geometry.dispose();
    }
    const wSize = st.chunkWorldSize;
    const out = buildChunkTerrainGeometry(ch.cx, ch.cy, wSize, ch.segments, st, tSec, g, {});
    ch.geometry = out.geometry;
    ch.solid.geometry = ch.geometry;
    ch.wire.geometry = ch.geometry;
    ch.triangleCount = out.triangleCount;
    ch.border.geometry = buildBorderGeometry(ch.cx, ch.cy, wSize);
    ch.dirty = false;
  }

  function renderFrame() {
    const st0 = { ...getState() };
    validateAndNormalize(st0);
    const graph = getNoiseGraph();
    frameSt = st0;
    const t = (performance.now() - clock.start) * 0.001;
    const w = canvas.width || 1;
    const h = canvas.height || 1;

    const meshBake = terrainMeshBakeSignature(st0, graph);
    const scroll = `${st0.offset.x},${st0.offset.y},${st0.offset.z}`;
    if (meshBake !== lastMeshBakeSig) {
      lastMeshBakeSig = meshBake;
      for (const ch of chunkMap.values()) {
        ch.dirty = true;
      }
    }
    if (scroll !== lastOffsetScrollSig) {
      lastOffsetScrollSig = scroll;
      for (const ch of chunkMap.values()) {
        ch.dirty = true;
      }
    }

    applyCameraFromViewMode(camera, st0);
    skybox.position.copy(camera.position);
    stateToUniforms(st0, { width: w, height: h }, t, { u: uniforms });

    syncRing(st0);
    updateLodOnChunks(st0);

    let maxR = st0.maxChunkRebuildsPerFrame | 0;
    const nChunks = chunkMap.size | 0;
    if (st0.rendererViewMode === "chunk" && nChunks > 0 && nChunks <= 25) {
      maxR = Math.min(32, Math.max(maxR, nChunks));
    }
    let rebuilt = 0;
    for (const [k, ch] of chunkMap) {
      if (!ch.dirty) {
        continue;
      }
      if (rebuilt >= maxR) {
        break;
      }
      rebuildOneChunk(st0, graph, t, ch);
      rebuilt += 1;
    }

    for (const ch of chunkMap.values()) {
      ch.solid.visible = true;
      ch.wire.visible = Boolean(st0.meshWireframe);
      if (st0.debugShowChunkBorders) {
        ch.border.visible = true;
        ch.border.renderOrder = 2;
      } else {
        ch.border.visible = false;
      }
    }

    const c0 = getCenterChunkCoord(st0);
    viewInfo.segments = st0.defaultChunkResolution | 0;
    let tri = 0;
    for (const v of chunkMap.values()) {
      tri += v.triangleCount;
    }
    viewInfo.triangleCount = tri;
    viewInfo.activeChunkCount = chunkMap.size;
    viewInfo.centerChunk =
      st0.rendererViewMode === "chunk" ? "0,0" : `${c0.cx},${c0.cy}`;
    const vc = getViewCenterWorldXY(st0);
    viewInfo.viewMode = st0.rendererViewMode;
    viewInfo.flyPos = st0.flyCamera
      ? `(${st0.flyCamera.x.toFixed(1)},${st0.flyCamera.y.toFixed(1)},${st0.flyCamera.z.toFixed(1)})`
      : "—";
    viewInfo.cameraLabel = `view (${vc.x.toFixed(1)},${vc.y.toFixed(1)}) mode=${st0.rendererViewMode}`;

    renderer.render(scene, camera);
  }

  const ro = new ResizeObserver(() => {
    resize();
    renderFrame();
  });
  if (parent) {
    ro.observe(parent);
  }
  window.addEventListener("resize", () => {
    resize();
    renderFrame();
  });
  resize();

  return {
    renderFrame,
    getLastBakeStats: () => null,
    renderer,
    viewInfo,
    dispose() {
      ro.disconnect();
      for (const k of Array.from(chunkMap.keys())) {
        removeAndDisposeChunk(k);
      }
      scene.remove(skybox);
      skyboxGeo.dispose();
      for (const m of skyboxMats) {
        m.dispose();
      }
      solidMat.dispose();
      wireMat.dispose();
      borderMat.dispose();
      renderer.dispose();
    }
  };
}
