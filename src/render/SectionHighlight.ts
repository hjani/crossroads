import * as THREE from "three";
import type { Vec2 } from "../core/types";

/** Above the sections in `NetworkView`, so a marked one reads over the rest. */
const SECTION_LINE_HEIGHT = 0.03;
/**
 * Just under the nodes in `NetworkView`, so a mark on a node leaves it
 * visible as a center inside the mark instead of covering it.
 */
const NODE_MARK_HEIGHT = 0.035;

/** In pixels, and wider than a node, so the mark shows around it. */
const NODE_MARK_SIZE = 15;

/**
 * A section to draw, as the run of positions it follows — `tessellate` is
 * where one comes from. The whole shape rather than the two ends, so a mark
 * on a curve is the curve and not the line across it.
 */
export type HighlightedSection = readonly Vec2[];

/**
 * A mark on sections, and on nodes, in one color.
 *
 * The color is the whole of what it means, and is chosen by whoever builds
 * it: what makes a mark "the one under the cursor" or "the one selected" is
 * not something the drawable decides. So a tool showing both holds two of
 * these rather than one that repaints itself — they are on screen together
 * and say different things.
 *
 * Decoration only, and told what to mark rather than reading the model, as
 * `NodeHighlight` is: which sections these are is the tool's answer, not
 * something the network knows.
 */
export class SectionHighlight {
  readonly sceneObject = new THREE.Group();

  private readonly sectionLines: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly nodeMarks: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;

  constructor(color: number) {
    this.sectionLines = new THREE.LineSegments(
      makeGeometry([]),
      new THREE.LineBasicMaterial({ color }),
    );
    this.nodeMarks = new THREE.Points(
      makeGeometry([]),
      new THREE.PointsMaterial({
        color,
        size: NODE_MARK_SIZE,
        // Fixed pixel size, matching how nodes themselves are drawn.
        sizeAttenuation: false,
      }),
    );
    this.sectionLines.frustumCulled = false;
    this.nodeMarks.frustumCulled = false;

    this.sceneObject.add(this.sectionLines, this.nodeMarks);
    this.sceneObject.visible = false;
  }

  /**
   * Draws the marks, and makes them visible if they were not.
   *
   * Each section is written the way `NetworkView` writes the network:
   * `LineSegments` joins the buffer two points at a time and nothing between
   * one pair and the next, so a run is written with every interior point
   * twice.
   */
  show(sections: readonly HighlightedSection[], nodes: readonly Vec2[]): void {
    const lineCoordinates: number[] = [];
    for (const section of sections) {
      for (let i = 1; i < section.length; i++) {
        const start = section[i - 1];
        const end = section[i];
        lineCoordinates.push(start.x, SECTION_LINE_HEIGHT, start.z);
        lineCoordinates.push(end.x, SECTION_LINE_HEIGHT, end.z);
      }
    }

    const nodeMarkCoordinates: number[] = [];
    for (const node of nodes) {
      nodeMarkCoordinates.push(node.x, NODE_MARK_HEIGHT, node.z);
    }

    replaceGeometry(this.sectionLines, lineCoordinates);
    replaceGeometry(this.nodeMarks, nodeMarkCoordinates);
    this.sceneObject.visible = true;
  }

  hide(): void {
    this.sceneObject.visible = false;
  }

  /** Releases the GPU buffers behind the marks. Unusable after. */
  dispose(): void {
    this.sectionLines.geometry.dispose();
    this.sectionLines.material.dispose();
    this.nodeMarks.geometry.dispose();
    this.nodeMarks.material.dispose();
  }
}

/**
 * `coordinates` is x, y and z of every point in one flat run, which is the
 * layout a position attribute wants — `itemSize` 3 is what splits it back
 * into points.
 */
function makeGeometry(coordinates: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coordinates, 3),
  );
  return geometry;
}

/**
 * Rebuilt rather than updated in place, as in `SectionPlanView`: how many
 * sections are marked is not fixed, and what is marked changes on a gesture
 * rather than continuously.
 *
 * The bounding sphere is rebuilt with it, and an empty geometry leaves none
 * at all, which is why nothing here is frustum-culled.
 */
function replaceGeometry(
  target: THREE.LineSegments | THREE.Points,
  coordinates: readonly number[],
): void {
  target.geometry.dispose();
  target.geometry = makeGeometry(coordinates);
}
