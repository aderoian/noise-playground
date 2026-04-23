import os2 from "./os2.glsl?raw";
import os2s from "./os2s.glsl?raw";
import cellular from "./cellular.glsl?raw";
import noiseValue from "./noiseValue.glsl?raw";
import noiseColor from "./noiseColor.glsl?raw";

/**
 * Terrain mesh: noise height in Z, XY from same domain as previous fullscreen shader.
 */
export function buildMeshVertexShader() {
  // No #version here: three.js prepends GLSL3 #version and defines to RawShaderMaterial.
  return `precision highp float;
${os2}
${os2s}
${cellular}
${noiseValue}
uniform int uUseGraph;
uniform sampler2D uGraphTex;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uAmplitude;
uniform float uMeshHeight;
in vec3 position;
in vec2 uv;
out vec2 vUv;
out vec3 vWorldPos;
out float vHRaw;
void main() {
  vUv = uv;
  vec2 w2 = (uv - 0.5) * 2.0 * vec2(uWorldScale * uAspect, uWorldScale);
  vec3 pN = noiseSampleP(uv);
  float raw;
  if (uUseGraph == 1) {
    float g = texture(uGraphTex, uv).r;
    raw = g * uAmplitude;
  } else {
    raw = fractalValue(pN) * uAmplitude;
  }
  float zd = raw * uMeshHeight;
  vec3 pos = vec3(w2.x, w2.y, zd) + position * 0.0;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vHRaw = raw;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;
}

export function buildMeshFragmentShader() {
  return `precision highp float;
uniform vec3 uLightDir;
uniform float uLightAmbient;
uniform float uLightDiffuse;
${noiseColor}
in vec2 vUv;
in vec3 vWorldPos;
in float vHRaw;
out vec4 fragColor;
void main() {
  float t = displayScalarFromNoise(vHRaw);
  vec3 albedo = rampColor(t);
  vec3 fdx = dFdx(vWorldPos);
  vec3 fdy = dFdy(vWorldPos);
  vec3 n = normalize(cross(fdx, fdy));
  if (!gl_FrontFacing) {
    n = -n;
  }
  vec3 L = normalize(uLightDir);
  float diff = uLightAmbient + uLightDiffuse * max(dot(n, L), 0.0);
  vec3 col = albedo * diff;
  fragColor = vec4(col, 1.0);
}
`;
}
