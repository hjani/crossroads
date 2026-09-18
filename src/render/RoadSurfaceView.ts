import * as THREE from "three";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { Vec2 } from "../core/geometry/point";
import { Junction, type OutlinePiece } from "../core/layout/junction";
import { ROAD_WIDTH_METERS, roadwayOf } from "../core/layout/roadway";
import { STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import {
  polylineBetween,
  ribbonSlicesBetween,
  type RibbonSlice,
} from "./tessellate";

/**
 * Draws a road network as asphalt: a ribbon along each roadway, and a fan
 * filling the junction at each node.
 *
 * Rebuilt as a whole when the network's version says the drawing is stale.
 */
export class RoadSurfaceView {
  /** Add this to the scene once; the view keeps its contents up to date. */
  readonly sceneObject = new THREE.Group();

  private readonly surface: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  private drawnVersion = -1;

  constructor(private readonly network: RoadNetwork) {
    this.surface = new THREE.Mesh(
      makeGeometry([]),
      // Unlit: the surface is one flat color, whatever the scene's lights.
      new THREE.MeshBasicMaterial({
        color: STATE_COLOR.EXISTING,
        // Seen only from above, so which way a triangle winds doesn't matter.
        side: THREE.DoubleSide,
      }),
    );
    this.sceneObject.add(this.surface);
  }

  /** Call once per frame. Cheap unless the network changed. */
  update(): void {
    if (this.network.version === this.drawnVersion) {
      return;
    }

    this.rebuild();
    this.drawnVersion = this.network.version;
  }

  /** Releases the GPU buffers behind the view. The view is unusable after. */
  dispose(): void {
    this.surface.geometry.dispose();
    this.surface.material.dispose();
  }

  /** Discards the geometry and builds it again from the network. */
  private rebuild(): void {
    const coordinates: number[] = [];
    for (const section of this.network.allSections()) {
      const roadway = roadwayOf(this.network, section, ROAD_WIDTH_METERS);
      const slices = ribbonSlicesBetween(
        roadway.from,
        roadway.to,
        roadway.centerlineGeometry,
        ROAD_WIDTH_METERS,
      );
      appendRibbon(slices, coordinates);
    }
    for (const node of this.network.allNodes()) {
      const junction = new Junction(this.network, node.id, ROAD_WIDTH_METERS);
      appendJunction(node.position, junction.outline(), coordinates);
    }

    this.surface.geometry.dispose();
    this.surface.geometry = makeGeometry(coordinates);
  }
}

/**
 * Appends a junction: a triangle fan from the node out to each pair of
 * neighboring outline corners, the last pair wrapping back to the first.
 *
 * The fan is how a junction is drawn, not what it is: on a tight arc beside a
 * sharp gap a triangle can flip over and pave a sliver of grass
 * (`docs/road-surface.md`, Limits). The surface is double-sided, so a flipped
 * triangle still draws.
 */
function appendJunction(
  at: Vec2,
  outline: readonly OutlinePiece[],
  coordinates: number[],
): void {
  const corners = outlineCorners(outline);
  for (let i = 0; i < corners.length; i++) {
    for (const corner of [at, corners[i], corners[(i + 1) % corners.length]]) {
      coordinates.push(corner.x, LAYER.ROAD_SURFACE, corner.z);
    }
  }
}

/**
 * The corners the outline is drawn through, with its arcs broken into chords
 * here rather than in the layout.
 *
 * A piece runs from the piece before it — the last one for the first piece,
 * the ring being closed — and each drawn piece gives back both of its ends,
 * so every piece contributes all but its first point.
 */
function outlineCorners(outline: readonly OutlinePiece[]): Vec2[] {
  return outline.flatMap((piece, index) => {
    const before =
      index === 0 ? outline[outline.length - 1] : outline[index - 1];
    return polylineBetween(before.to, piece.to, piece.outlineGeometry).slice(1);
  });
}

/** Appends a ribbon: two triangles between each pair of neighboring slices. */
function appendRibbon(
  slices: readonly RibbonSlice[],
  coordinates: number[],
): void {
  for (let i = 1; i < slices.length; i++) {
    const back = slices[i - 1];
    const front = slices[i];

    for (const corner of [
      back.edgeB,
      front.edgeB,
      front.edgeA,
      back.edgeB,
      front.edgeA,
      back.edgeA,
    ]) {
      coordinates.push(corner.x, LAYER.ROAD_SURFACE, corner.z);
    }
  }
}

function makeGeometry(points: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  return geometry;
}
