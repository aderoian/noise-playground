import {
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  FloatType,
  GLSL3,
  LinearFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  RedFormat,
  RawShaderMaterial,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import { buildMeshVertexShader, buildMeshFragmentShader } from "../shaders/buildMeshShaders.js";
import { stateToUniforms } from "../noise/defaults.js";
import { validateAndNormalize } from "../noise/state.js";
import { bakeGraphHeight } from "../noise/graphBridge.js";
import { getGraphRegistry } from "../noise/graphBridge.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {() => any} getState
 */
export function createNoiseView(canvas, getState) {
  const parent = canvas.parentElement;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new Scene();
  const camera = new PerspectiveCamera(48, 1, 0.05, 200);
  const CAM_Y = 1.6;
  const CAM_Z0 = 2.85;
  camera.position.set(0, CAM_Y, CAM_Z0);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0.15);

  const uniforms = {
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
    vertexShader: buildMeshVertexShader(),
    fragmentShader: buildMeshFragmentShader(),
    uniforms,
    side: DoubleSide
  });
  const wireMat = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: buildMeshVertexShader(),
    fragmentShader: buildMeshFragmentShader(),
    uniforms,
    side: DoubleSide,
    wireframe: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });

  const MESH_SEG_DEFAULT = 192;
  /** @type {PlaneGeometry} */
  let terrainGeo = new PlaneGeometry(1, 1, MESH_SEG_DEFAULT, MESH_SEG_DEFAULT);
  const terrain = new Mesh(terrainGeo, solidMat);
  const wire = new Mesh(terrainGeo, wireMat);
  wire.renderOrder = 1;
  scene.add(terrain, wire);
  const viewInfo = { segments: MESH_SEG_DEFAULT };
  let lastMeshSeg = MESH_SEG_DEFAULT;
  const clock = { start: performance.now() };
  const reg = getGraphRegistry();
  /** @type {DataTexture | null} */
  let graphDataTex = null;
  let lastBakedGraphRevision = -1;
  const bakeDebug =
    typeof window !== "undefined" && window.localStorage?.getItem("noise-bake-debug") === "1";
  /** @type {{ compileMs: number, sampleMs: number, uploadMs: number } | null} */
  let lastBakeStats = null;

  function ensureGraphTexture() {
    if (graphDataTex) {
      return graphDataTex;
    }
    const w = 4;
    const h = 4;
    const d = new Float32Array(w * h);
    graphDataTex = new DataTexture(d, w, h, RedFormat, FloatType);
    graphDataTex.magFilter = LinearFilter;
    graphDataTex.minFilter = LinearFilter;
    graphDataTex.wrapS = ClampToEdgeWrapping;
    graphDataTex.wrapT = ClampToEdgeWrapping;
    graphDataTex.needsUpdate = true;
    uniforms.uGraphTex.value = graphDataTex;
    return graphDataTex;
  }

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

  function setTerrainResolution(seg) {
    const s = seg | 0;
    if (s === lastMeshSeg && terrainGeo) {
      return;
    }
    if (terrainGeo) {
      terrainGeo.dispose();
    }
    lastMeshSeg = s;
    terrainGeo = new PlaneGeometry(1, 1, s, s);
    terrain.geometry = terrainGeo;
    wire.geometry = terrainGeo;
    viewInfo.segments = s;
  }

  function applyCameraFromState(st) {
    const z = CAM_Z0 / (st.cameraZoom > 0 ? st.cameraZoom : 1.0);
    camera.position.set(0, CAM_Y, z);
    camera.lookAt(0, 0, 0.15);
  }

  function renderFrame() {
    const st = { ...getState() };
    validateAndNormalize(st);
    setTerrainResolution(st.meshSegments);
    applyCameraFromState(st);
    const t = (performance.now() - clock.start) * 0.001;
    const w = canvas.width || 1;
    const h = canvas.height || 1;
    if (st.useGraph && st.noiseGraph) {
      const needBake =
        st.graphRevision !== lastBakedGraphRevision || Boolean(st.animate);
      if (needBake) {
        const tw = Math.max(8, st.graphBakeW | 0);
        const th = Math.max(8, st.graphBakeH | 0);
        const outStats = bakeDebug ? /** @type {{ compileMs?: number, sampleMs?: number }} */ ({}) : null;
        const data = bakeGraphHeight(st.noiseGraph, st, t, tw, th, w, h, reg, outStats);
        const gtex = ensureGraphTexture();
        const tUpload0 = performance.now();
        if (gtex.image.width !== tw || gtex.image.height !== th) {
          gtex.dispose();
          graphDataTex = new DataTexture(data, tw, th, RedFormat, FloatType);
          graphDataTex.magFilter = LinearFilter;
          graphDataTex.minFilter = LinearFilter;
          graphDataTex.wrapS = ClampToEdgeWrapping;
          graphDataTex.wrapT = ClampToEdgeWrapping;
          graphDataTex.needsUpdate = true;
          uniforms.uGraphTex.value = graphDataTex;
        } else {
          const buf = /** @type {Float32Array} */ (gtex.image.data);
          buf.set(data);
          gtex.needsUpdate = true;
        }
        if (bakeDebug && outStats) {
          lastBakeStats = {
            compileMs: outStats.compileMs ?? 0,
            sampleMs: outStats.sampleMs ?? 0,
            uploadMs: performance.now() - tUpload0
          };
        } else {
          lastBakeStats = null;
        }
        lastBakedGraphRevision = st.graphRevision;
      }
    } else {
      lastBakedGraphRevision = -1;
      lastBakeStats = null;
    }
    stateToUniforms(st, { width: w, height: h }, t, { u: uniforms });
    uniforms.uUseGraph.value = st.useGraph && st.noiseGraph ? 1 : 0;
    if (uniforms.uGraphTex) {
      uniforms.uGraphTex.value = graphDataTex;
    }
    wire.visible = Boolean(st.meshWireframe);
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
    /** Returns last graph bake segment timings (ms) when `localStorage noise-bake-debug=1` */
    getLastBakeStats: () => lastBakeStats,
    renderer,
    /** @type {{ segments: number }} */
    viewInfo,
    dispose() {
      ro.disconnect();
      if (graphDataTex) {
        graphDataTex.dispose();
      }
      solidMat.dispose();
      wireMat.dispose();
      terrainGeo.dispose();
      renderer.dispose();
    }
  };
}
