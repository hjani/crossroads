import * as THREE from "three";
import type { RoadNetwork } from "../core/RoadNetwork";
import { ROAD_WIDTH_METERS, roadwayOf } from "../core/roadways";
import { STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { ribbonSlicesBetween, type RibbonSlice } from "./tessellate";

/**
 * Draws a road network as asphalt: a ribbon along each roadway.
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
        roadway.geometry,
        ROAD_WIDTH_METERS,
      );
      appendRibbon(slices, coordinates);
    }

    this.surface.geometry.dispose();
    this.surface.geometry = makeGeometry(coordinates);
  }
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
