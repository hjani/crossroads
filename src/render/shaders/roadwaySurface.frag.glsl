uniform vec3 color;

varying float u;
varying float vHalfWidth;

// Edge line, in meters: a gap in from the curb, then the line.
const float EDGE_INSET = 0.1;
const float LINE_WIDTH = 0.1;
const vec3 MARKING = vec3(1.0);

void main() {
  // Distance in from the nearer curb.
  float d = vHalfWidth - abs(u);
  bool onEdgeLine = EDGE_INSET < d && d < EDGE_INSET + LINE_WIDTH;
  gl_FragColor = vec4(onEdgeLine ? MARKING : color, 1.0);
  // THREE.Color holds linear values; this converts them for the screen, as
  // every built-in material does last.
  #include <colorspace_fragment>
}
