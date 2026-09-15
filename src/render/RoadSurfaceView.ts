import * as THREE from "three";
import { unitDirection } from "../core/points";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { STATE_COLOR } from "./colors";
import { LAYER } from "./layers";

/**
 * How wide every road is, in meters — one width for the whole network.
 *
 * Kept here while this view is its only reader; it moves to core with the
 * cuts at junctions, which need it too.
 */
const ROAD_WIDTH_METERS = 8;

/**
 * Draws a road network as asphalt: a ribbon along each section.
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
      new THREE.MeshBasicMaterial({ color: STATE_COLOR.EXISTING }),
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
      if (section.geometry.kind !== "straight") {
        continue;
      }
      appendStraightRibbon(
        this.network.getNode(section.from).position,
        this.network.getNode(section.to).position,
        coordinates,
      );
    }

    this.surface.geometry.dispose();
    this.surface.geometry = makeGeometry(coordinates);
  }
}

/**
 * Appends the ribbon of a straight road as two triangles facing up.
 *
 * - `d = unitDirection(from, to)`, `L = |to − from|`
 * - `n = (d.z, −d.x)`: `d` turned a quarter to the left, seen from above
 * - `h = w/2`
 * - corners `from ± h·n`, `to ± h·n` → both ends square to the road, since
 *   `n ⊥ d`
 *
 * Three.js draws only a triangle's front face: the side its normal points
 * to. The camera looks down −Y, so a triangle `a, b, c` shows when
 *
 *     u = b − a,  v = c − a
 *     (u × v).y = u.z·v.x − u.x·v.z > 0
 *
 * - first triangle: `from − h·n`, `to − h·n`, `to + h·n`
 *   - `u = L·d`, `v = L·d + 2h·n`
 *   - `u × v = 2hL·(d × n)`, since `d × d = 0`
 * - second triangle: `from − h·n`, `to + h·n`, `from + h·n`
 *   - `u = L·d + 2h·n`, `v = 2h·n`
 *   - `u × v = 2hL·(d × n)`, since `n × n = 0`
 * - both come out as
 *
 *       (d × n).y = d.z·n.x − d.x·n.z = d.z² + d.x² = 1
 *       (u × v).y = 2hL > 0
 *
 * → both face the camera for every direction, and no double-sided material
 *   is needed.
 */
function appendStraightRibbon(
  from: Vec2,
  to: Vec2,
  coordinates: number[],
): void {
  const d = unitDirection(from, to);
  const h = ROAD_WIDTH_METERS / 2;
  const hn = { x: d.z * h, z: -d.x * h };

  const fromRight = { x: from.x - hn.x, z: from.z - hn.z };
  const fromLeft = { x: from.x + hn.x, z: from.z + hn.z };
  const toRight = { x: to.x - hn.x, z: to.z - hn.z };
  const toLeft = { x: to.x + hn.x, z: to.z + hn.z };

  for (const corner of [fromRight, toRight, toLeft]) {
    coordinates.push(corner.x, LAYER.ROAD_SURFACE, corner.z);
  }
  for (const corner of [fromRight, toLeft, fromLeft]) {
    coordinates.push(corner.x, LAYER.ROAD_SURFACE, corner.z);
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
