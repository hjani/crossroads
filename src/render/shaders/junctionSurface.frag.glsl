uniform vec3 color;

void main() {
  gl_FragColor = vec4(color, 1.0);
  // THREE.Color holds linear values; this converts them for the screen, as
  // every built-in material does last.
  #include <colorspace_fragment>
}
