import * as THREE from "three";
import type { RoadLayout } from "../core/layout/RoadLayout";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { NodeId, SectionId } from "../core/network/types";
import { HIGHLIGHT_OPACITY } from "./colors";
import { LAYER } from "./layers";
import { centerline, tessellateOutline } from "./tessellate";

/** In pixels, and wider than a node, so the mark shows around it. */
const NODE_MARK_SIZE = 15;

/** What to mark, by id. A list left out marks nothing. */
export interface HighlightMarks {
  /** Sections marked along their centerline. */
  readonly sections?: readonly SectionId[];
  /** Nodes marked with a point. */
  readonly nodes?: readonly NodeId[];
  /** Nodes whose junction area is tinted. */
  readonly junctions?: readonly NodeId[];
  /** Sections whose roadway area is tinted. */
  readonly roadways?: readonly SectionId[];
}

/**
 * A mark on sections, nodes and the ground they cover, in one color.
 *
 * The color is the whole of what it means, and is chosen by whoever builds
 * it: what makes a mark "the one under the cursor" or "the one selected" is
 * not something the drawable decides. So a tool showing both holds two of
 * these rather than one that repaints itself — they are on screen together
 * and say different things.
 *
 * Decoration only: which sections these are is the tool's answer, not
 * something the network knows. It reads the model and its layout only to
 * look up the ids it is given, as `SectionPlanView` does.
 */
export class RoadNetworkHighlight {
  readonly sceneObject = new THREE.Group();

  private readonly sectionLines: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly nodeMarks: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;
  private readonly areas: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;

  /** What the buffers hold now, kept through `hide`. Null before any `show`. */
  private drawn: {
    marks: Required<HighlightMarks>;
    version: number;
  } | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
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
    this.areas = new THREE.Mesh(
      makeGeometry([]),
      new THREE.MeshBasicMaterial({
        color,
        // A tint, so whatever the surface shows still shows through.
        transparent: true,
        opacity: HIGHLIGHT_OPACITY,
        // Blended over what is under it; nothing needs hiding behind it.
        depthWrite: false,
        // Seen only from above, so which way a triangle winds doesn't matter.
        side: THREE.DoubleSide,
      }),
    );
    this.sectionLines.frustumCulled = false;
    this.nodeMarks.frustumCulled = false;
    this.areas.frustumCulled = false;

    this.sceneObject.add(this.areas, this.sectionLines, this.nodeMarks);
    this.sceneObject.visible = false;
  }

  /**
   * Marks parts of the network, and makes the marks visible if they were
   * not. A section is marked along the shape it is drawn in, so a mark on a
   * curve is the curve and not the line across it.
   *
   * Each section is written the way `NetworkView` writes the network:
   * `LineSegments` joins the buffer two points at a time and nothing between
   * one pair and the next, so a run is written with every interior point
   * twice.
   *
   * The same ids on an unchanged network are already in the buffers, so a
   * cursor resting on one section costs nothing per move. The view is not
   * part of that check: tessellation has a tolerance in meters, not pixels.
   * Nor is the layout: it is rebuilt from the network, on its version.
   */
  show(marks: HighlightMarks): void {
    const wanted: Required<HighlightMarks> = {
      sections: marks.sections ?? [],
      nodes: marks.nodes ?? [],
      junctions: marks.junctions ?? [],
      roadways: marks.roadways ?? [],
    };
    const version = this.network.version;
    const drawn = this.drawn;
    if (
      drawn !== null &&
      drawn.version === version &&
      sameIds(drawn.marks.sections, wanted.sections) &&
      sameIds(drawn.marks.nodes, wanted.nodes) &&
      sameIds(drawn.marks.junctions, wanted.junctions) &&
      sameIds(drawn.marks.roadways, wanted.roadways)
    ) {
      this.sceneObject.visible = true;
      return;
    }

    const lineCoordinates: number[] = [];
    for (const id of wanted.sections) {
      const points = centerline(this.network, this.network.getSection(id));
      for (let i = 1; i < points.length; i++) {
        const start = points[i - 1];
        const end = points[i];
        lineCoordinates.push(start.x, LAYER.SECTION_DECORATION, start.z);
        lineCoordinates.push(end.x, LAYER.SECTION_DECORATION, end.z);
      }
    }

    const nodeMarkCoordinates: number[] = [];
    for (const id of wanted.nodes) {
      const { x, z } = this.network.getNode(id).position;
      nodeMarkCoordinates.push(x, LAYER.NODE_DECORATION, z);
    }

    const areaOutlines = [
      ...wanted.junctions.map((id) => this.layout.junctionAt(id).outline()),
      ...wanted.roadways.map((id) => this.layout.roadwayAlong(id).outline),
    ];
    const areaCoordinates: number[] = [];
    for (const outline of areaOutlines) {
      for (const point of tessellateOutline(outline)) {
        areaCoordinates.push(point.x, LAYER.SURFACE_DECORATION, point.z);
      }
    }

    replaceGeometry(this.sectionLines, lineCoordinates);
    replaceGeometry(this.nodeMarks, nodeMarkCoordinates);
    replaceGeometry(this.areas, areaCoordinates);
    // Copied, since the caller's arrays are theirs to change.
    this.drawn = {
      marks: {
        sections: [...wanted.sections],
        nodes: [...wanted.nodes],
        junctions: [...wanted.junctions],
        roadways: [...wanted.roadways],
      },
      version,
    };
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
    this.areas.geometry.dispose();
    this.areas.material.dispose();
  }
}

/** Same ids in the same order — a reordering is rare enough to just redraw. */
function sameIds<Id>(a: readonly Id[], b: readonly Id[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
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
  target: THREE.LineSegments | THREE.Points | THREE.Mesh,
  coordinates: readonly number[],
): void {
  target.geometry.dispose();
  target.geometry = makeGeometry(coordinates);
}
