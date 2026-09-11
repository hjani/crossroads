import * as THREE from "three";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { tessellate } from "./tessellate";

/** Height above the ground plane, to stay clear of the reference grid. */
const SECTION_HEIGHT = 0.02;
/** Slightly higher again, so nodes draw over the sections meeting at them. */
const NODE_HEIGHT = 0.04;

const SECTION_COLOR = 0xdddddd;
const NODE_COLOR = 0xffaa33;
/** In pixels — see `sizeAttenuation` below. */
const NODE_SIZE = 7;

/**
 * Draws a road network as a wireframe: sections as lines, nodes as points.
 *
 * Read-only — the network is edited elsewhere. Rebuilds itself when the
 * network's version says the drawing is stale, so nothing has to notify it.
 */
export class NetworkView {
  /** Add this to the scene once; the view keeps its contents up to date. */
  readonly sceneObject = new THREE.Group();

  private readonly sections: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly nodes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;
  private drawnVersion = -1;

  constructor(private readonly network: RoadNetwork) {
    this.sections = new THREE.LineSegments(
      makeGeometry([]),
      new THREE.LineBasicMaterial({ color: SECTION_COLOR }),
    );
    this.nodes = new THREE.Points(
      makeGeometry([]),
      new THREE.PointsMaterial({
        color: NODE_COLOR,
        size: NODE_SIZE,
        // Keeps the point a fixed pixel size instead of shrinking with distance.
        sizeAttenuation: false,
      }),
    );
    this.sceneObject.add(this.sections, this.nodes);
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
    this.sections.geometry.dispose();
    this.sections.material.dispose();
    this.nodes.geometry.dispose();
    this.nodes.material.dispose();
  }

  /** Discards both geometries and builds them again from the network. */
  private rebuild(): void {
    const nodePoints: number[] = [];
    for (const node of this.network.allNodes()) {
      nodePoints.push(node.position.x, NODE_HEIGHT, node.position.z);
    }

    const sectionPoints: number[] = [];
    for (const section of this.network.allSections()) {
      appendPolyline(tessellate(this.network, section), sectionPoints);
    }

    replaceGeometry(this.sections, sectionPoints);
    replaceGeometry(this.nodes, nodePoints);
  }
}

/**
 * Appends a polyline in the layout `LineSegments` draws.
 *
 * That primitive takes the buffer two points at a time and joins each pair,
 * drawing nothing between one pair and the next — so a connected run is
 * written with every interior point twice, ending one piece and starting
 * the next. It costs a duplicated point per piece and buys one geometry and
 * one draw call for the whole network, where a `Line` per section would be
 * an object apiece.
 */
function appendPolyline(points: readonly Vec2[], coordinates: number[]): void {
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    coordinates.push(start.x, SECTION_HEIGHT, start.z);
    coordinates.push(end.x, SECTION_HEIGHT, end.z);
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

function replaceGeometry(
  target: THREE.LineSegments | THREE.Points,
  points: readonly number[],
): void {
  target.geometry.dispose();
  target.geometry = makeGeometry(points);
}
