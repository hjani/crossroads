import * as THREE from "three";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { NodeId, SectionId } from "../core/types";
import { LAYER } from "./layers";
import { tessellate } from "./tessellate";

/** In pixels, and wider than a node, so the mark shows around it. */
const NODE_MARK_SIZE = 15;

/**
 * A mark on sections, and on nodes, in one color.
 *
 * The color is the whole of what it means, and is chosen by whoever builds
 * it: what makes a mark "the one under the cursor" or "the one selected" is
 * not something the drawable decides. So a tool showing both holds two of
 * these rather than one that repaints itself — they are on screen together
 * and say different things.
 *
 * Decoration only: which sections these are is the tool's answer, not
 * something the network knows. It reads the model only to look up the ids it
 * is given, as `SectionPlanView` does.
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

  constructor(
    private readonly network: RoadNetwork,
    color: number,
  ) {
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
   * Marks sections and nodes of the network, and makes the marks visible if
   * they were not. A section is marked along the shape it is drawn in, so a
   * mark on a curve is the curve and not the line across it.
   *
   * Each section is written the way `NetworkView` writes the network:
   * `LineSegments` joins the buffer two points at a time and nothing between
   * one pair and the next, so a run is written with every interior point
   * twice.
   */
  show(sections: readonly SectionId[], nodes: readonly NodeId[]): void {
    const lineCoordinates: number[] = [];
    for (const id of sections) {
      const points = tessellate(this.network, this.network.getSection(id));
      for (let i = 1; i < points.length; i++) {
        const start = points[i - 1];
        const end = points[i];
        lineCoordinates.push(start.x, LAYER.SECTION_DECORATION, start.z);
        lineCoordinates.push(end.x, LAYER.SECTION_DECORATION, end.z);
      }
    }

    const nodeMarkCoordinates: number[] = [];
    for (const id of nodes) {
      const { x, z } = this.network.getNode(id).position;
      nodeMarkCoordinates.push(x, LAYER.NODE_DECORATION, z);
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
