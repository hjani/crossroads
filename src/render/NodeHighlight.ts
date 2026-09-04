import * as THREE from "three";
import type { Vec2 } from "../core/types";

/**
 * Just under the nodes in `NetworkView`, so the node stays visible as an
 * orange center inside the mark rather than being covered by it.
 */
const HIGHLIGHT_HEIGHT = 0.035;

/** Blue, which is what the edit's colors reserve for something already
 * there — and a node the cursor has found is exactly that. */
const HIGHLIGHT_COLOR = 0x66ccff;

/** In pixels, and wider than a node, so the mark shows around it. */
const HIGHLIGHT_SIZE = 15;

/**
 * A mark on a single node: the one an endpoint would weld onto.
 *
 * Decoration only, and told what to mark rather than reading the model —
 * it is the tool's answer to "where would this click land", which is not
 * something the network knows.
 */
export class NodeHighlight {
  readonly sceneObject: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;

  private readonly positions = new THREE.Float32BufferAttribute(
    new Float32Array(3),
    3,
  );

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.positions);

    this.sceneObject = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: HIGHLIGHT_COLOR,
        size: HIGHLIGHT_SIZE,
        // Fixed pixel size, matching how nodes themselves are drawn.
        sizeAttenuation: false,
      }),
    );
    // The bounding sphere is computed once, from a point at the origin, so
    // culling would drop the mark as soon as the camera moved away from it.
    this.sceneObject.frustumCulled = false;
    this.sceneObject.visible = false;
  }

  /** Marks a position, and makes the mark visible if it was not. */
  show(position: Vec2): void {
    this.positions.setXYZ(0, position.x, HIGHLIGHT_HEIGHT, position.z);
    this.positions.needsUpdate = true;
    this.sceneObject.visible = true;
  }

  hide(): void {
    this.sceneObject.visible = false;
  }

  /** Releases the GPU buffers behind the mark. Unusable after. */
  dispose(): void {
    this.sceneObject.geometry.dispose();
    this.sceneObject.material.dispose();
  }
}
