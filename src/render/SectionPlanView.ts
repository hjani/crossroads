import * as THREE from "three";
import type { Junction } from "../core/layout/junction";
import {
  changedOrViolatingParts,
  type RoadPlan,
} from "../core/layout/roadPlan";
import type { Roadway } from "../core/layout/roadway";
import type { LayoutSpeculation } from "../core/layout/speculation";
import { pointsOf, type SectionPlan } from "../core/network/edits";
import { positionOf } from "../core/network/queries";
import { isNodeId, type RoadNetwork } from "../core/network/RoadNetwork";
import type { NodeId, SectionId } from "../core/network/types";
import { PLANNING_OPACITY, STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { PART_STATE, PartStates } from "./PartStates";
import { RoadSurface } from "./RoadSurface";
import { polylineBetween, tessellateRibbon } from "./tessellate";

/** Nothing is drawn under a new node yet, so its mark is the whole of what
 * is seen there. An existing node needs a wider one, to show around it. */
const NEW_NODE_SIZE = 11;
const EXISTING_NODE_SIZE = 15;

/**
 * A planned section, drawn as the whole of what committing it would do:
 * the road surface and the centerline,
 * in the shapes it would run in, a mark on every node it would make, and a
 * mark on every node already there that it would meet.
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

  /**
   * The states of the speculation's parts.
   */
  private readonly speculativePartStates = new PartStates();
  /** The changed or violating parts, as the edit would leave them. */
  private readonly speculativeSurface = new RoadSurface(
    this.speculativePartStates,
  );
  /** A band along the centerline, where there is no speculation to draw. */
  private readonly band: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly centerline: THREE.Line<
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

  /**
   * `roadWidth` the width of the road being planned. If 0, only the centerline is drawn.
   */
  constructor(private readonly roadWidth: number) {
    this.band = new THREE.Mesh(
      makeGeometry([]),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: PLANNING_OPACITY,
        depthWrite: false,
        // Seen only from above, so which way a triangle winds doesn't matter.
        side: THREE.DoubleSide,
      }),
    );

    this.centerline = new THREE.Line(
      makeGeometry([]),
      new THREE.LineBasicMaterial({ color: STATE_COLOR.PLANNED }),
    );

    this.newNodes = makeMarks(STATE_COLOR.PLANNED, NEW_NODE_SIZE);
    this.existingNodes = makeMarks(STATE_COLOR.SELECTED, EXISTING_NODE_SIZE);

    this.sceneObject.add(
      this.speculativeSurface.sceneObject,
      this.band,
      this.centerline,
      this.newNodes,
      this.existingNodes,
    );
    this.sceneObject.visible = false;
  }

  /**
   * Draws a road plan.
   *
   * Nodes and centerline are always shown. If a speculative layout is
   * available, the parts it changes or that are in violation are drawn from
   * it as road surface, in place of the live ones. Otherwise, just a band
   * along the centerline of the plan's line geometry.
   */
  showRoadPlan(network: RoadNetwork, plan: RoadPlan): void {
    const { sectionPlan, speculation } = plan;
    const color = plan.buildable ? STATE_COLOR.PLANNED : STATE_COLOR.REFUSED;
    this.showMarks(network, sectionPlan, color);
    this.showCenterline(network, sectionPlan, color);
    if (speculation !== null && this.roadWidth > 0) {
      replaceGeometry(this.band, []);
      this.showSpeculativeSurface(plan, speculation);
    } else {
      this.speculativeSurface.setParts([], []);
      this.showBand(network, sectionPlan, color);
    }
    this.sceneObject.visible = true;
  }

  hide(): void {
    this.sceneObject.visible = false;
  }

  /** Releases the GPU buffers behind the view. Unusable after. */
  dispose(): void {
    this.speculativeSurface.dispose();
    this.band.geometry.dispose();
    this.band.material.dispose();
    this.centerline.geometry.dispose();
    this.centerline.material.dispose();
    this.newNodes.geometry.dispose();
    this.newNodes.material.dispose();
    this.existingNodes.geometry.dispose();
    this.existingNodes.material.dispose();
  }

  /**
   * A mark on every node the plan would make, in `color`, and on every node
   * already there that it would meet.
   */
  private showMarks(
    network: RoadNetwork,
    plan: SectionPlan,
    color: number,
  ): void {
    const newNodeCoordinates: number[] = [];
    const existingNodeCoordinates: number[] = [];
    for (const point of pointsOf(plan)) {
      const marks = isNodeId(point.at)
        ? existingNodeCoordinates
        : newNodeCoordinates;
      const position = positionOf(network, point.at);
      marks.push(position.x, LAYER.NODE_DECORATION, position.z);
    }

    this.newNodes.material.color.setHex(color);
    replaceGeometry(this.newNodes, newNodeCoordinates);
    replaceGeometry(this.existingNodes, existingNodeCoordinates);
  }

  /** The centerline, each piece in the shape it runs in. */
  private showCenterline(
    network: RoadNetwork,
    plan: SectionPlan,
    color: number,
  ): void {
    let previous = positionOf(network, plan.start.at);
    const coordinates = [previous.x, LAYER.SECTION_DECORATION, previous.z];
    for (const piece of plan.pieces) {
      const position = positionOf(network, piece.to.at);
      // Its first position is the one already written for the point before
      // it, and writing it twice would leave the line doubling back on
      // nothing.
      const along = polylineBetween(
        previous,
        position,
        piece.centerlineGeometry,
      );
      for (const step of along.slice(1)) {
        coordinates.push(step.x, LAYER.SECTION_DECORATION, step.z);
      }
      previous = position;
    }

    this.centerline.material.color.setHex(color);
    replaceGeometry(this.centerline, coordinates);
  }

  /** The road surface as a band `roadWidth` wide along the centerline. */
  private showBand(
    network: RoadNetwork,
    plan: SectionPlan,
    color: number,
  ): void {
    const coordinates: number[] = [];
    if (this.roadWidth > 0) {
      let previous = positionOf(network, plan.start.at);
      for (const piece of plan.pieces) {
        const position = positionOf(network, piece.to.at);
        for (const { point } of tessellateRibbon(
          previous,
          position,
          piece.centerlineGeometry,
          this.roadWidth,
        )) {
          coordinates.push(point.x, LAYER.SURFACE_DECORATION, point.z);
        }
        previous = position;
      }
    }

    this.band.material.color.setHex(color);
    replaceGeometry(this.band, coordinates);
  }

  /**
   * The changed or violating parts as road surface, from the speculative
   * layout.
   */
  private showSpeculativeSurface(
    plan: RoadPlan,
    speculation: LayoutSpeculation,
  ): void {
    const { speculativeLayout } = speculation;
    const { violatingNodes, violatingSections } = plan.violations;
    const parts = changedOrViolatingParts(plan);

    // Refused outranks planned: a part of the road in violation shows red.
    const states = this.speculativePartStates;
    states.setJunctionsInState(
      PART_STATE.PLANNED,
      speculation.plannedRoadNodes,
    );
    states.setRoadwaysInState(
      PART_STATE.PLANNED,
      speculation.plannedRoadSections,
    );
    states.setJunctionsInState(PART_STATE.REFUSED, violatingNodes);
    states.setRoadwaysInState(PART_STATE.REFUSED, violatingSections);

    this.speculativeSurface.setParts(
      Array.from(parts.nodes, (id): [NodeId, Junction] => [
        id,
        speculativeLayout.junctionAt(id),
      ]),
      Array.from(parts.sections, (id): [SectionId, Roadway] => [
        id,
        speculativeLayout.roadwayAlong(id),
      ]),
    );

    this.speculativeSurface.update();
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
 */
function replaceGeometry(
  target: THREE.Line | THREE.Points | THREE.Mesh,
  coordinates: readonly number[],
): void {
  target.geometry.dispose();
  target.geometry = makeGeometry(coordinates);
}
