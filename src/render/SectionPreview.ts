import * as THREE from "three";
import type { Vec2 } from "../core/types";

/** Above the sections in `NetworkView`, so a preview crossing one reads clearly. */
const PREVIEW_HEIGHT = 0.03;

const PREVIEW_COLOR = 0x66ccff;

/**
 * The rubber-band line for a section being drawn: one segment between two
 * ground positions, shown while an edit is in progress.
 *
 * Decoration only — it says nothing about the network, and the tool that
 * drives it decides what the two ends mean. Unlike `NetworkView` it is
 * told what to show rather than reading the model, because it changes with
 * the cursor rather than with the network.
 */
export class SectionPreview {
  readonly sceneObject: THREE.Line<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;

  private readonly positions = new THREE.Float32BufferAttribute(
    new Float32Array(6),
    3,
  );

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.positions);

    this.sceneObject = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: PREVIEW_COLOR }),
    );
    // The bounding sphere is computed once, from an empty line at the
    // origin, so culling would drop the preview as soon as the camera
    // moved away from it.
    this.sceneObject.frustumCulled = false;
    this.sceneObject.visible = false;
  }

  /** Draws the segment, and makes it visible if it was not. */
  show(from: Vec2, to: Vec2): void {
    this.positions.setXYZ(0, from.x, PREVIEW_HEIGHT, from.z);
    this.positions.setXYZ(1, to.x, PREVIEW_HEIGHT, to.z);
    this.positions.needsUpdate = true;
    this.sceneObject.visible = true;
  }

  hide(): void {
    this.sceneObject.visible = false;
  }

  /** Releases the GPU buffers behind the preview. Unusable after. */
  dispose(): void {
    this.sceneObject.geometry.dispose();
    this.sceneObject.material.dispose();
  }
}
