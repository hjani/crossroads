uniform vec3 color;

varying float u;
varying float vHalfWidth;

// Edge line, in meters: a gap in from the curb, then the line.
const float EDGE_INSET = 0.1;
const float LINE_WIDTH = 0.1;
const vec3 MARKING = vec3(1.0);

// How much of a pixel lies past an edge `x` meters behind its center, for
// a pixel `px` meters wide: 0 → 1 across one pixel.
float ramp(float x, float px) {
  return clamp(x / px + 0.5, 0.0, 1.0);
}

void main() {
  // Meters per pixel. Taken of `u`, not `d`: `abs` kinks at the centerline.
  float px = fwidth(u);
  // Distance in from the nearer curb.
  float d = vHalfWidth - abs(u);
  // Past the line's inner edge but not its outer one. Thinner than a pixel
  // → never reaches 1 → the line fades instead of flickering.
  float edgeLine =
    ramp(d - EDGE_INSET, px) - ramp(d - (EDGE_INSET + LINE_WIDTH), px);
  gl_FragColor = vec4(mix(color, MARKING, edgeLine), 1.0);
  // THREE.Color holds linear values; this converts them for the screen, as
  // every built-in material does last.
  #include <colorspace_fragment>
}
