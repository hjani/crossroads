import * as THREE from "three";
import type { BuildableSectionPlan } from "../core/edits";
import { positionOf } from "../core/queries";
import { isNodeId, type RoadNetwork } from "../core/RoadNetwork";

/**
 * Just under the nodes in `NetworkView`, so a mark on an existing node
 * leaves it visible as an orange center instead of covering it — the same
 * layering `NodeHighlight` relies on.
 */
const MARK_HEIGHT = 0.035;

/** A node the edit would make, in the rubber band's own green — the band
 * and the junctions along it are the same thing being drawn. Nothing is
 * under the mark yet, so it is the whole of what is seen there. */
const NEW_NODE_COLOR = 0x66ee88;
const NEW_NODE_SIZE = 11;

/** A node that is already there, in blue against the green of everything
 * the edit would create. Wider than a node, so the mark shows around it. */
const EXISTING_NODE_COLOR = 0x66ccff;
const EXISTING_NODE_SIZE = 15;

/**
 * The points of a planned section: where the edit would make a node, and
 * where it would meet one already there, told apart by color.
 *
 * Decoration only, like the rest of a tool's preview — it draws an answer
 * the tool asked for and says nothing about the network. It does read the
 * model, but only to look up where a node is: a plan names existing nodes
 * by id, and only the network knows their positions.
 */
export class PlanMarks {
  readonly sceneObject = new THREE.Group();

  private readonly newNodes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;
  private readonly existingNodes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;

  constructor() {
    this.newNodes = makeMarks(NEW_NODE_COLOR, NEW_NODE_SIZE);
    this.existingNodes = makeMarks(EXISTING_NODE_COLOR, EXISTING_NODE_SIZE);
    this.sceneObject.add(this.newNodes, this.existingNodes);
    this.sceneObject.visible = false;
  }

  /** Draws the plan's points, and makes them visible if they were not. */
  showPlan(network: RoadNetwork, plan: BuildableSectionPlan): void {
    const newNodeCoordinates: number[] = [];
    const existingNodeCoordinates: number[] = [];

    for (const point of plan.points) {
      // A point naming a node is one the network already has; one carrying
      // a position is a node the edit would make there.
      const into = isNodeId(point.at)
        ? existingNodeCoordinates
        : newNodeCoordinates;
      const position = positionOf(network, point.at);
      into.push(position.x, MARK_HEIGHT, position.z);
    }

    replaceGeometry(this.newNodes, newNodeCoordinates);
    replaceGeometry(this.existingNodes, existingNodeCoordinates);
    this.sceneObject.visible = true;
  }

  hide(): void {
    this.sceneObject.visible = false;
  }

  /** Releases the GPU buffers behind the marks. Unusable after. */
  dispose(): void {
    this.newNodes.geometry.dispose();
    this.newNodes.material.dispose();
    this.existingNodes.geometry.dispose();
    this.existingNodes.material.dispose();
  }
}

function makeMarks(
  color: number,
  size: number,
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const marks = new THREE.Points(
    makeGeometry([]),
    new THREE.PointsMaterial({
      color,
      size,
      // Fixed pixel size, matching how nodes themselves are drawn.
      sizeAttenuation: false,
    }),
  );
  // The bounding sphere is computed per geometry, and an empty one leaves
  // nothing to cull against, so culling would drop the marks outright.
  marks.frustumCulled = false;
  return marks;
}

/** `coordinates` is x, y and z of every point in one flat run, which is
 * the layout a position attribute wants — `itemSize` 3 is what splits it
 * back into points. */
function makeGeometry(coordinates: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coordinates, 3),
  );
  return geometry;
}

/** Rebuilt rather than updated in place: a plan has a handful of points,
 * and its length changes with every crossing the cursor drags across. */
function replaceGeometry(
  target: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>,
  coordinates: readonly number[],
): void {
  target.geometry.dispose();
  target.geometry = makeGeometry(coordinates);
}
