// K.jpg OpenSimplex2 (4-point BCC) — namespaced for combining with os2s in one shader
// https://github.com/KdotJPG/OpenSimplex2/blob/master/glsl/OpenSimplex2.glsl (Unlicense)

vec4 os2_permute(vec4 t) {
  return t * (t * 34.0 + 133.0);
}

vec3 os2_grad(float hash) {
  vec3 cube = mod(floor(hash / vec3(1.0, 2.0, 4.0)), 2.0) * 2.0 - 1.0;
  vec3 cuboct = cube;
  cuboct[int(hash / 16.0)] = 0.0;
  float type = mod(floor(hash / 8.0), 2.0);
  vec3 rhomb = (1.0 - type) * cube + type * (cuboct + cross(cube, cuboct));
  vec3 g = cuboct * 1.22474487139 + rhomb;
  g *= (1.0 - 0.042942436724648037 * type) * 32.80201376986577;
  return g;
}

vec4 openSimplex2Base(vec3 X) {
  vec3 v1 = round(X);
  vec3 d1 = X - v1;
  vec3 score1 = abs(d1);
  vec3 dir1 = step(max(score1.yzx, score1.zxy), score1);
  vec3 v2 = v1 + dir1 * sign(d1);
  vec3 d2 = X - v2;
  vec3 X2 = X + 144.5;
  vec3 v3 = round(X2);
  vec3 d3 = X2 - v3;
  vec3 score2 = abs(d3);
  vec3 dir2 = step(max(score2.yzx, score2.zxy), score2);
  vec3 v4 = v3 + dir2 * sign(d3);
  vec3 d4 = X2 - v4;
  vec4 hashes = os2_permute(mod(vec4(v1.x, v2.x, v3.x, v4.x), 289.0));
  hashes = os2_permute(mod(hashes + vec4(v1.y, v2.y, v3.y, v4.y), 289.0));
  hashes = mod(os2_permute(mod(hashes + vec4(v1.z, v2.z, v3.z, v4.z), 289.0)), 48.0);
  vec4 a = max(0.5 - vec4(dot(d1, d1), dot(d2, d2), dot(d3, d3), dot(d4, d4)), 0.0);
  vec4 aa = a * a;
  vec4 aaaa = aa * aa;
  vec3 g1 = os2_grad(hashes.x);
  vec3 g2 = os2_grad(hashes.y);
  vec3 g3 = os2_grad(hashes.z);
  vec3 g4 = os2_grad(hashes.w);
  vec4 extrapolations = vec4(dot(d1, g1), dot(d2, g2), dot(d3, g3), dot(d4, g4));
  vec3 derivative = -8.0 * mat4x3(d1, d2, d3, d4) * (aa * a * extrapolations)
   + mat4x3(g1, g2, g3, g4) * aaaa;
  return vec4(derivative, dot(aaaa, extrapolations));
}

vec4 openSimplex2_Conventional(vec3 X) {
  vec4 result = openSimplex2Base(dot(X, vec3(2.0 / 3.0)) - X);
  return vec4(dot(result.xyz, vec3(2.0 / 3.0)) - result.xyz, result.w);
}

vec4 openSimplex2_ImproveXY(vec3 X) {
  mat3 orthonormalMap = mat3(
    0.788675134594813, -0.211324865405187, -0.577350269189626,
    -0.211324865405187, 0.788675134594813, -0.577350269189626,
    0.577350269189626, 0.577350269189626, 0.577350269189626);
  vec4 result = openSimplex2Base(orthonormalMap * X);
  return vec4(result.xyz * orthonormalMap, result.w);
}

float sampleOpenSimplex2(int orientation, vec3 p) {
  if (orientation == 0) return openSimplex2_Conventional(p).w;
  return openSimplex2_ImproveXY(p).w;
}
