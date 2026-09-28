// Three.js declares `position` and the matrices for a ShaderMaterial.
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
