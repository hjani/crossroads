uniform vec3 color;
// How much of a state's tint is mixed over the surface.
uniform float tintAmount;

varying float u;
varying float vHalfWidth;
varying float t;
varying float vState;
varying vec3 vTint;

// Edge line, in meters: a gap in from the curb, then the line.
const float EDGE_INSET = 0.2;
const float LINE_WIDTH = 0.1;
// Half a centerline dash, in periods: 1.5 m of dash to 3 m of gap.
const float DASH_HALF = 1.0 / 6.0;
const vec3 MARKING = vec3(1.0);

// How much of a pixel lies past an edge `x` meters behind its center, for
// a pixel `px` meters wide: 0 → 1 across one pixel.
float ramp(float x, float px) {
  return clamp(x / px + 0.5, 0.0, 1.0);
}

void main() {
  // State is The same at all three vertices, but interpolation can still land
  // a hair off → compared half a step away.
  if (vState > float(PART_STATE_HIDDEN) - 0.5) discard;

  // Meters per pixel. Taken of `u`, not `d`: `abs` kinks at the centerline.
  float px = fwidth(u);
  // Distance in from the nearer curb.
  float d = vHalfWidth - abs(u);
  // Past the line's inner edge but not its outer one. Thinner than a pixel
  // → never reaches 1 → the line fades instead of flickering.
  float edgeLine =
    ramp(d - EDGE_INSET, px) - ramp(d - (EDGE_INSET + LINE_WIDTH), px);
  // Centerline dash: the middle third of each period. `fract` jumps at a
  // period's start, always in the gap, so the jump never shows.
  float across =
    ramp(u + LINE_WIDTH / 2.0, px) - ramp(u - LINE_WIDTH / 2.0, px);
  float along = ramp(DASH_HALF - abs(fract(t) - 0.5), fwidth(t));
  float dash = across * along;
  vec3 surface = mix(color, MARKING, max(edgeLine, dash));
  // No state → no tint.
  float tint = vState < float(PART_STATE_NONE) + 0.5 ? 0.0 : tintAmount;
  gl_FragColor = vec4(mix(surface, vTint, tint), 1.0);
  // THREE.Color holds linear values; this converts them for the screen, as
  // every built-in material does last.
  #include <colorspace_fragment>
}
