import {
  DoubleSide,
  GLSL3,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  RawShaderMaterial,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import { buildMeshVertexShader, buildMeshFragmentShader } from "../shaders/buildMeshShaders.js";
import { stateToUniforms } from "../noise/defaults.js";
import { validateAndNormalize } from "../noise/state.js";

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
  camera.position.set(0, 1.6, 2.85);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0.15);

  const uniforms = {
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
    uMeshHeight: { value: 0.35 }
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

  const segments = 192;
  const geo = new PlaneGeometry(1, 1, segments, segments);
  const terrain = new Mesh(geo, solidMat);
  const wire = new Mesh(geo, wireMat);
  wire.renderOrder = 1;
  scene.add(terrain, wire);
  const clock = { start: performance.now() };

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

  function renderFrame() {
    const st = { ...getState() };
    validateAndNormalize(st);
    const t = (performance.now() - clock.start) * 0.001;
    const w = canvas.width || 1;
    const h = canvas.height || 1;
    stateToUniforms(st, { width: w, height: h }, t, { u: uniforms });
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
    renderer,
    /** @type {{ segments: number }} */
    viewInfo: { segments },
    dispose() {
      ro.disconnect();
      solidMat.dispose();
      wireMat.dispose();
      geo.dispose();
      renderer.dispose();
    }
  };
}
