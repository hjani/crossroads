import * as THREE from "three";
import type { PlannedPoint, SectionPlan } from "../core/network/edits";
import { positionOf } from "../core/network/queries";
import { isNodeId, type RoadNetwork } from "../core/network/RoadNetwork";
import { STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { centerlineBetween } from "./tessellate";
import type { Vec2 } from "../core/geometry/point";

/** Nothing is drawn under a new node yet, so its mark is the whole of what
 * is seen there. An existing node needs a wider one, to show around it. */
const NEW_NODE_SIZE = 11;
const EXISTING_NODE_SIZE = 15;

/**
 * A planned section, drawn as the whole of what committing it would do:
 * the chain of road it would run, in the shapes it would run in, a mark on
 * every node it would make, and a mark on every node already there that it
 * would meet.
 *
 * One drawable for one plan, because a plan is one answer. Which pieces
 * are drawn and what color they take both follow from it, so there is no
 * way to show a chain that disagrees with its junctions, or a refusal that
 * still looks buildable.
 *
 * Decoration only — it says nothing about the network and never edits it.
 * It does read the model, but only to look up where a node is: a plan
 * names existing nodes by id, and only the network knows their positions.
 */
export class SectionPlanView {
  readonly sceneObject = new THREE.Group();

  private readonly chain: THREE.Line<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly newNodes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;
  private readonly existingNodes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;

  constructor() {
    this.chain = new THREE.Line(
      makeGeometry([]),
      new THREE.LineBasicMaterial({ color: STATE_COLOR.PLANNED }),
    );
    this.chain.frustumCulled = false;

    this.newNodes = makeMarks(STATE_COLOR.PLANNED, NEW_NODE_SIZE);
    this.existingNodes = makeMarks(STATE_COLOR.SELECTED, EXISTING_NODE_SIZE);

    this.sceneObject.add(this.chain, this.newNodes, this.existingNodes);
    this.sceneObject.visible = false;
  }

  /** Draws the plan, and makes it visible if it was not. */
  showPlan(network: RoadNetwork, plan: SectionPlan): void {
    const chainCoordinates: number[] = [];
    const newNodeCoordinates: number[] = [];
    const existingNodeCoordinates: number[] = [];

    // A point naming a node is one the network already has; one carrying a
    // position is a node the edit would make there.
    const mark = (point: PlannedPoint, position: Vec2): void => {
      const marks = isNodeId(point.at)
        ? existingNodeCoordinates
        : newNodeCoordinates;
      marks.push(position.x, LAYER.NODE_DECORATION, position.z);
    };

    let previous = positionOf(network, plan.start.at);
    chainCoordinates.push(previous.x, LAYER.SECTION_DECORATION, previous.z);
    mark(plan.start, previous);

    for (const piece of plan.pieces) {
      const position = positionOf(network, piece.to.at);

      // Each piece is drawn in the shape it runs in, so a planned curve is a
      // curve. Its first position is the one already written for the point
      // before it, and writing it twice would leave the line doubling back
      // on nothing.
      const along = centerlineBetween(
        previous,
        position,
        piece.centerlineGeometry,
      );
      for (const step of along.slice(1)) {
        chainCoordinates.push(step.x, LAYER.SECTION_DECORATION, step.z);
      }

      mark(piece.to, position);
      previous = position;
    }

    const verdict = plan.buildable ? STATE_COLOR.PLANNED : STATE_COLOR.REFUSED;
    this.chain.material.color.setHex(verdict);
    this.newNodes.material.color.setHex(verdict);

    replaceGeometry(this.chain, chainCoordinates);
    replaceGeometry(this.newNodes, newNodeCoordinates);
    replaceGeometry(this.existingNodes, existingNodeCoordinates);
    this.sceneObject.visible = true;
  }

  hide(): void {
    this.sceneObject.visible = false;
  }

  /** Releases the GPU buffers behind the view. Unusable after. */
  dispose(): void {
    this.chain.geometry.dispose();
    this.chain.material.dispose();
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
  marks.frustumCulled = false;
  return marks;
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
 * Rebuilt rather than updated in place: a plan has a handful of points,
 * and how many changes with every crossing the cursor drags across.
 *
 * The bounding sphere is rebuilt with it, and an empty geometry leaves
 * none at all, which is why nothing here is frustum-culled.
 */
function replaceGeometry(
  target: THREE.Line | THREE.Points,
  coordinates: readonly number[],
): void {
  target.geometry.dispose();
  target.geometry = makeGeometry(coordinates);
}
