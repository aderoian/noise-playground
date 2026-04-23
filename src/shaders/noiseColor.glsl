// Fragment-only: color ramp and display (requires uRamp, uContrast, uBrightness, uInvert)

uniform int uRamp;
uniform int uInvert;
uniform float uContrast;
uniform float uBrightness;

vec3 rampColor(float t) {
  t = clamp(t, 0.0, 1.0);
  if (uRamp == 0) {
    return vec3(t);
  }
  if (uRamp == 1) {
    vec3 c0 = vec3(0.05, 0.05, 0.2);
    vec3 c1 = vec3(1.0, 0.0, 0.0);
    vec3 c2 = vec3(1.0, 1.0, 0.0);
    vec3 c3 = vec3(1.0, 1.0, 1.0);
    if (t < 0.33) {
      return mix(c0, c1, t / 0.33);
    }
    if (t < 0.66) {
      return mix(c1, c2, (t - 0.33) / 0.33);
    }
    return mix(c2, c3, (t - 0.66) / 0.34);
  }
  vec3 l = vec3(0.2, 0.35, 0.1);
  vec3 h = vec3(0.45, 0.38, 0.25);
  vec3 s = vec3(0.75, 0.75, 0.65);
  vec3 p = vec3(1.0);
  if (t < 0.35) {
    return mix(l, h, t / 0.35);
  }
  if (t < 0.7) {
    return mix(h, s, (t - 0.35) / 0.35);
  }
  return mix(s, p, (t - 0.7) / 0.3);
}

// nScaledByAmplitude: same as old frag `fractalValue(p) * uAmplitude` (before 0.5+0.5)
float displayScalarFromNoise(float nScaledByAmplitude) {
  float n = nScaledByAmplitude;
  n = n * 0.5 + 0.5;
  n = (n * uContrast) + uBrightness;
  n = clamp(n, 0.0, 1.0);
  if (uInvert == 1) {
    n = 1.0 - n;
  }
  return n;
}
