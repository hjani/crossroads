import * as THREE from "three";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { Outline } from "../core/layout/outline";
import type { RoadLayout } from "../core/layout/RoadLayout";
import { STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { tessellateOutline } from "./tessellate";

/**
 * Draws a road network as asphalt, filling the ground every roadway and
 * junction covers.
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

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
  ) {
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
      appendOutline(this.layout.roadwayAlong(section.id).outline, coordinates);
    }
    for (const node of this.network.allNodes()) {
      appendOutline(this.layout.junctionAt(node.id).outline(), coordinates);
    }

    this.surface.geometry.dispose();
    this.surface.geometry = makeGeometry(coordinates);
  }
}

/** Appends the triangles filling an outline, at the road surface's height. */
function appendOutline(outline: Outline, coordinates: number[]): void {
  for (const point of tessellateOutline(outline)) {
    coordinates.push(point.x, LAYER.ROAD_SURFACE, point.z);
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
