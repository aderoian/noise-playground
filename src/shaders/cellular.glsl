// 3D Worley (cellular) with configurable distance metric and F1 / F2 / F2-F1
vec3 cell_hash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

float cell_dist(int metric, vec3 a, vec3 b) {
  vec3 d = a - b;
  if (metric == 0) {
    return length(d);
  }
  if (metric == 1) {
    return abs(d.x) + abs(d.y) + abs(d.z);
  }
  return max(max(abs(d.x), abs(d.y)), abs(d.z));
}

float worley3(vec3 p, float uJitter, int uMetric, int uReturn) {
  vec3 i = floor(p);
  float d1 = 1.0e10;
  float d2 = 1.0e10;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int x = -1; x <= 1; x++) {
        vec3 o = i + vec3(float(x), float(j), float(k));
        vec3 r = cell_hash3(o);
        vec3 f = o + 0.5 + uJitter * (r - 0.5) * 2.0;
        float d = cell_dist(uMetric, p, f);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
  }
  if (uReturn == 0) {
    return d1;
  }
  if (uReturn == 1) {
    return d2;
  }
  return d2 - d1;
}
