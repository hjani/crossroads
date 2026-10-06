// Shared by every lane layout. Joined in front of the lane file that
// defines `laneMarks` for one layout.

uniform vec3 color;
// How much of a state's tint is mixed over the surface.
uniform float tintAmount;
// How far a crossing reaches from the roadway's end, in meters.
uniform float crossingDepth;

varying float u;
varying float vHalfWidth;
varying float t;
varying float k;
varying float vFromStart;
varying float vFromEnd;
flat varying int vState;
flat varying vec3 vTint;

// Edge line, in meters: a gap in from the curb, then the line.
const float EDGE_INSET = 0.2;
const float LINE_WIDTH = 0.1;
// Half a dash, in periods: 1.5 m of dash to 3 m of gap.
const float DASH_HALF = 1.0 / 6.0;
// Half a crossing bar, in periods: as much bar as gap.
const float BAR_HALF = 0.25;
const vec3 MARKING = vec3(1.0);

// How much of a pixel lies past an edge `x` meters behind its center, for
// a pixel `px` meters wide: 0 → 1 across one pixel.
float ramp(float x, float px) {
  return clamp(x / px + 0.5, 0.0, 1.0);
}

// A line `LINE_WIDTH` wide, centered where `x` is 0, `x` in meters.
float line(float x, float px) {
  return ramp(x + LINE_WIDTH / 2.0, px) - ramp(x - LINE_WIDTH / 2.0, px);
}

// Inside a dash: the middle third of each period of `t`, `tPx` periods to a
// pixel. `fract` jumps at a period's start, always in the gap, so the jump
// never shows.
float dashed(float t, float tPx) {
  return ramp(DASH_HALF - abs(fract(t) - 0.5), tPx);
}

// The lane layout's marks at signed distance `u` from the centerline and
// `t` dash periods along. Defined by the lane file.
//
// Takes the pixel sizes rather than working them out: a derivative is only
// defined where every pixel runs the same branch, and the lane file may
// branch.
float laneMarks(float u, float t, float px, float tPx);

void main() {
  if (vState == PART_STATE_HIDDEN) discard;

  // Meters per pixel. Taken of `u`, not `d`: `abs` kinks at the centerline.
  float px = fwidth(u);
  // Dash periods per pixel.
  float tPx = fwidth(t);
  // Distance in from the nearer curb.
  float d = vHalfWidth - abs(u);
  // Past the line's inner edge but not its outer one. Thinner than a pixel
  // → never reaches 1 → the line fades instead of flickering.
  float edgeLine =
    ramp(d - EDGE_INSET, px) - ramp(d - (EDGE_INSET + LINE_WIDTH), px);
  // Within a crossing's depth of an end that has one. `px` measured across
  // the road stands in for along it: both are meters.
  float crossing = ramp(crossingDepth - min(vFromStart, vFromEnd), px);
  // Never on a crossing.
  float lanes = laneMarks(u, t, px, tPx) * (1.0 - crossing);
  // Crossing bar: the middle half of each period, between the edge lines.
  // Between them, not just in a gap: the half gap at the edge is narrower
  // than the strip out to the curb.
  // Fades out as a bar narrows from two pixels to one: any narrower, and the
  // bars and gaps blur into one pale band.
  float barsFade = 1.0 - smoothstep(0.25, 0.5, fwidth(k));
  float bar = crossing
    * ramp(BAR_HALF - abs(fract(k) - 0.5), fwidth(k))
    * ramp(d - (EDGE_INSET + LINE_WIDTH), px)
    * barsFade;
  vec3 surface = mix(color, MARKING, max(edgeLine, max(lanes, bar)));
  // No state → no tint.
  float tint = vState == PART_STATE_NONE ? 0.0 : tintAmount;
  gl_FragColor = vec4(mix(surface, vTint, tint), 1.0);
  // THREE.Color holds linear values; this converts them for the screen, as
  // every built-in material does last.
  #include <colorspace_fragment>
}
