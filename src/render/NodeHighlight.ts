import * as THREE from "three";
import { LAYER } from "./layers";
import type { Vec2 } from "../core/geometry/point";

/** In pixels, and wider than a node, so the mark shows around it. */
const HIGHLIGHT_SIZE = 15;

/**
 * A mark on a single place: where an endpoint would land, or another one
 * position a tool wants pointed at.
 *
 * Decoration only, and told what to mark rather than reading the model —
 * it is the tool's answer to "where would this click land", which is not
 * something the network knows. The color says what kind of answer it is,
 * and is given with each mark rather than once: the same mark can move from
 * a node already there to a place one would be made without the tool
 * holding a second mark for it.
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
        size: HIGHLIGHT_SIZE,
        // Fixed pixel size, matching how nodes themselves are drawn.
        sizeAttenuation: false,
      }),
    );
    this.sceneObject.visible = false;
  }

  /** Marks a position in a color, and makes the mark visible if it was not. */
  show(position: Vec2, color: number): void {
    this.positions.setXYZ(0, position.x, LAYER.NODE_DECORATION, position.z);
    this.positions.needsUpdate = true;
    this.sceneObject.material.color.setHex(color);
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
