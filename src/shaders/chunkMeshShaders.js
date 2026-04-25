import noiseColor from "./noiseColor.glsl?raw";

export function buildChunkTerrainVertexShader() {
  return `precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec3 normal;
in float hRaw;
in vec3 vColor;
out float vHRaw;
out vec3 vNormalW;
out vec3 vAlbedo;
void main() {
  vHRaw = hRaw;
  vNormalW = normal;
  vAlbedo = vColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
}

export function buildChunkTerrainFragmentShader() {
  return `precision highp float;
uniform vec3 uLightDir;
uniform float uLightAmbient;
uniform float uLightDiffuse;
uniform int uColorMode;
uniform int uTerrainShade; // 0 classic ramp, 1 biome vertex albedo, 2 mix
uniform vec3 uDebugColor;
${noiseColor}
in float vHRaw;
in vec3 vNormalW;
in vec3 vAlbedo;
out vec4 fragColor;
void main() {
  vec3 nW = normalize(vNormalW);
  vec3 L = normalize(uLightDir);
  float diff = uLightAmbient + uLightDiffuse * max(dot(nW, L), 0.0);
  if (uColorMode == 1) {
    vec3 c = uDebugColor * diff;
    fragColor = vec4(c, 1.0);
    return;
  }
  float t = displayScalarFromNoise(vHRaw);
  vec3 ramp = rampColor(t);
  vec3 albedo = ramp;
  if (uTerrainShade == 1) {
    albedo = vAlbedo;
  } else if (uTerrainShade == 2) {
    albedo = mix(ramp, vAlbedo, 0.5);
  }
  vec3 col = albedo * diff;
  fragColor = vec4(col, 1.0);
}
`;
}
