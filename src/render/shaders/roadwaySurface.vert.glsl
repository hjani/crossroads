attribute float side;
attribute float halfWidth;
attribute float periodsAlong;

// Signed distance from the centerline, in meters.
varying float u;
varying float vHalfWidth;
// Distance along the roadway, in dash periods.
varying float t;

void main() {
  u = side * halfWidth;
  vHalfWidth = halfWidth;
  t = periodsAlong;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
