attribute float side;
attribute float halfWidth;

// Signed distance from the centerline, in meters.
varying float u;
varying float vHalfWidth;

void main() {
  u = side * halfWidth;
  vHalfWidth = halfWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
