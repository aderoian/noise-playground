// Assumes: precision, includes (os2, os2s, cellular), and the uniforms below.
// Used by both terrain vertex and any fragment that samples noise the same way.

uniform int uBaseKind;
uniform int uOrientation;
uniform int uFractal;
uniform int uOctaves;
uniform int uCellMetric;
uniform int uCellReturn;
uniform float uLacunarity;
uniform float uGain;
uniform float uFrequency;
uniform vec3 uOffset;
uniform float uJitter;
uniform float uRigidExp;
uniform float uRigidWeight;
uniform float uAspect;
uniform int uViewMode;
uniform float uSliceZ;
uniform float uWorldScale;
uniform float uTime;

float baseN(vec3 p) {
  if (uBaseKind == 0) {
    return sampleOpenSimplex2(uOrientation, p);
  }
  if (uBaseKind == 1) {
    return sampleOpenSimplex2S(uOrientation, p);
  }
  return worley3(p, uJitter, uCellMetric, uCellReturn);
}

float fractalValue(vec3 p) {
  if (uFractal == 0) {
    return baseN(p);
  }
  if (uFractal == 1) {
    float sum = 0.0;
    float normalizer = 0.0;
    float f = 1.0;
    float a = 1.0;
    for (int o = 0; o < 8; o++) {
      if (o >= uOctaves) {
        break;
      }
      sum += a * baseN(p * f);
      normalizer += a;
      f *= uLacunarity;
      a *= uGain;
    }
    return sum / max(normalizer, 1.0e-4);
  }
  float sum = 0.0;
  float normalizer = 0.0;
  float f = 1.0;
  float a = 1.0;
  float w = 1.0;
  for (int o2 = 0; o2 < 8; o2++) {
    if (o2 >= uOctaves) {
      break;
    }
    float n2 = 1.0 - abs(baseN(p * f));
    n2 = pow(max(n2, 0.0), uRigidExp);
    sum += a * w * n2;
    normalizer += a * w;
    f *= uLacunarity;
    a *= uGain;
    w *= uRigidWeight;
  }
  return sum / max(normalizer, 1.0e-4);
}

// Sample position for noise: matches previous fullscreen fragment mapping
vec3 noiseSampleP(vec2 uv) {
  vec2 w = (uv - 0.5) * 2.0 * uWorldScale;
  w.x *= uAspect;
  float zc = 0.0;
  if (uViewMode == 1) {
    zc = uSliceZ;
  }
  vec3 p = vec3(w.x, w.y, zc) + uOffset;
  p = vec3(p.x, p.y, p.z + uTime);
  p *= uFrequency;
  return p;
}
