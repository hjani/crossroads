import * as THREE from "three";
import type { Vec2 } from "../core/types";

/**
 * Just under the nodes in `NetworkView`, so the node stays visible as an
 * orange center inside the mark rather than being covered by it.
 */
const HIGHLIGHT_HEIGHT = 0.035;

/** Blue, which is what the edit's colors reserve for something already
 * there — and a node the cursor has found is exactly that. What a mark is
 * usually for, so it is the color one takes unless its builder says
 * otherwise. */
const FOUND_NODE_COLOR = 0x66ccff;

/** In pixels, and wider than a node, so the mark shows around it. */
const HIGHLIGHT_SIZE = 15;

/**
 * A mark on a single place: the node an endpoint would weld onto, or
 * another one position a tool wants pointed at.
 *
 * Decoration only, and told what to mark rather than reading the model —
 * it is the tool's answer to "where would this click land", which is not
 * something the network knows. The color says which of those answers it is,
 * and so is the builder's to choose, as `SectionHighlight`'s is.
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

  constructor(color: number = FOUND_NODE_COLOR) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.positions);

    this.sceneObject = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color,
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
