attribute float side;
attribute float halfWidth;
attribute float periodsAlong;
attribute float periodsAcross;
// Distance from the start and from the end, in meters.
attribute float fromStart;
attribute float fromEnd;
// The part's `PART_STATE`. The same at every vertex of a part.
attribute float state;

// Indexed by state. Looked up here: a fragment shader may only index a
// uniform array by a constant.
uniform vec3 stateColors[PART_STATE_COUNT];

// Signed distance from the centerline, in meters.
varying float u;
varying float vHalfWidth;
// Distance along the dashed stretch, in dash periods.
varying float t;
// Distance across, from one edge line's inner edge, in bar periods.
varying float k;
varying float vFromStart;
varying float vFromEnd;
varying float vState;
varying vec3 vTint;

void main() {
  u = side * halfWidth;
  vHalfWidth = halfWidth;
  t = periodsAlong;
  k = periodsAcross;
  vFromStart = fromStart;
  vFromEnd = fromEnd;
  vState = state;
  vTint = stateColors[int(state)];
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
