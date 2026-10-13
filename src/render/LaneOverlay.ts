import * as THREE from "three";
import { lineDirectionAt, type Line } from "../core/geometry/lineGeometry";
import type { Vec2 } from "../core/geometry/point";
import type { Lane } from "../core/lanes/lane";
import { LANE_OVERLAY_COLOR } from "./colors";
import { LAYER } from "./layers";
import { polylineBetween } from "./tessellate";

/** How wide an arrowhead is across its lane, in meters: `b` below. */
const ARROW_BASE_METERS = 2;
/** How long an arrowhead is from base to tip, in meters: `ℓ` below. */
const ARROW_LENGTH_METERS = 2.5;

/**
 * Draws lanes over the road surface as a debug view: each lane's centerline
 * as a line, an arrowhead at each end (`docs/lanes.md`, Overlay).
 *
 * Told which lanes to draw rather than reading the lane graph itself, as
 * `RoadSurface` is told its parts.
 */
export class LaneOverlay {
  /** Add this to the scene once; `setLanes` replaces what it shows. */
  readonly sceneObject = new THREE.Group();

  private readonly lines: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly arrowheads: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;

  constructor() {
    this.lines = new THREE.LineSegments(
      makeGeometry([]),
      new THREE.LineBasicMaterial({ color: LANE_OVERLAY_COLOR }),
    );
    this.arrowheads = new THREE.Mesh(
      makeGeometry([]),
      new THREE.MeshBasicMaterial({
        color: LANE_OVERLAY_COLOR,
        // Seen only from above, so which way a triangle winds doesn't matter.
        side: THREE.DoubleSide,
      }),
    );
    this.sceneObject.add(this.lines, this.arrowheads);
  }

  /** Discards the geometry and builds it again from exactly these lanes. */
  setLanes(lanes: Iterable<Lane>): void {
    const lineCoordinates: number[] = [];
    const arrowheadCoordinates: number[] = [];
    for (const { centerline } of lanes) {
      appendPolyline(
        polylineBetween(centerline.from, centerline.to, centerline.geometry),
        lineCoordinates,
      );
      appendArrowheads(centerline, arrowheadCoordinates);
    }

    replaceGeometry(this.lines, lineCoordinates);
    replaceGeometry(this.arrowheads, arrowheadCoordinates);
  }

  /** Releases the GPU buffers behind the overlay. Unusable after. */
  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.arrowheads.geometry.dispose();
    this.arrowheads.material.dispose();
  }
}

/**
 * Appends a polyline in the layout `LineSegments` draws: every piece as its
 * own pair of points, as `NetworkView` does.
 */
function appendPolyline(points: readonly Vec2[], coordinates: number[]): void {
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    coordinates.push(start.x, LAYER.LANES, start.z);
    coordinates.push(end.x, LAYER.LANES, end.z);
  }
}

/**
 * Appends a lane's two arrowheads, one triangle at each end, both pointing
 * the way the lane runs there.
 *
 * Symbols: `P` an end, `h` the unit heading there (`lineDirectionAt`), `b`
 * the base's width, `ℓ` the length from base to tip, `B` the base's middle.
 *
 * - square to `h`:
 *
 *       n = (−h.z, h.x)
 *
 * - entry, base on it: `B = P`
 * - exit, tip on it: `B + ℓ·h = P` → `B = P − ℓ·h`
 * - the triangle, either end:
 *
 *       B + (b/2)·n,   B − (b/2)·n,   B + ℓ·h
 *
 * - → both lie on the roadway's side of their end
 * - → symmetric about `h` → which way `n` points doesn't matter
 * - on an arc of radius `r` the triangle follows the tangent at `P`, not the
 *   curve: about `ℓ²/2r` off it at the far side
 */
function appendArrowheads(centerline: Line, coordinates: number[]): void {
  const { from, to, geometry } = centerline;
  const entryHeading = lineDirectionAt(from, to, geometry, 0);
  const exitHeading = lineDirectionAt(from, to, geometry, 1);
  const exitBase = {
    x: to.x - ARROW_LENGTH_METERS * exitHeading.x,
    z: to.z - ARROW_LENGTH_METERS * exitHeading.z,
  };
  appendArrowhead(from, entryHeading, coordinates);
  appendArrowhead(exitBase, exitHeading, coordinates);
}

/** The triangle with its base's middle at `B`; see `appendArrowheads`. */
function appendArrowhead(B: Vec2, h: Vec2, coordinates: number[]): void {
  const half = ARROW_BASE_METERS / 2;
  const n = { x: -h.z, z: h.x };
  const y = LAYER.LANES;
  coordinates.push(B.x + half * n.x, y, B.z + half * n.z);
  coordinates.push(B.x - half * n.x, y, B.z - half * n.z);
  coordinates.push(
    B.x + ARROW_LENGTH_METERS * h.x,
    y,
    B.z + ARROW_LENGTH_METERS * h.z,
  );
}

function makeGeometry(coordinates: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coordinates, 3),
  );
  return geometry;
}

function replaceGeometry(
  target: THREE.LineSegments | THREE.Mesh,
  coordinates: readonly number[],
): void {
  target.geometry.dispose();
  target.geometry = makeGeometry(coordinates);
}
