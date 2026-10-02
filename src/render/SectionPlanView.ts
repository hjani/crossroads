import * as THREE from "three";
import type { Junction } from "../core/layout/junction";
import {
  changedOrViolatingParts,
  type RoadPlan,
} from "../core/layout/roadPlan";
import type { Roadway } from "../core/layout/roadway";
import type { LayoutSpeculation } from "../core/layout/speculation";
import type { SectionPlan } from "../core/network/edits";
import { positionOf } from "../core/network/queries";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { NodeId, SectionId } from "../core/network/types";
import { PLANNING_OPACITY, STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { PART_STATE, PartStates } from "./PartStates";
import { RoadSurface } from "./RoadSurface";
import { polylineBetween, tessellateRibbon } from "./tessellate";

/**
 * A planned section, drawn as the whole of what committing it would do:
 * the road surface (or, with no width, the centerline) in the shapes it
 * would run in.
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

  /**
   * `roadWidth` the width of the road being planned. If 0, the plan is drawn
   * as its centerline only, otherwise as surface.
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

    this.sceneObject.add(
      this.speculativeSurface.sceneObject,
      this.band,
      this.centerline,
    );
    this.sceneObject.visible = false;
  }

  /**
   * Draws a road plan.
   *
   * With no width, the centerline alone. Otherwise, if a speculative layout
   * is available, the parts it changes or that are in violation are drawn
   * from it as road surface, in place of the live ones; if not, just a band
   * along the plan's line geometry.
   */
  showRoadPlan(liveNetwork: RoadNetwork, plan: RoadPlan): void {
    const { sectionPlan, speculation } = plan;
    const color = plan.buildable ? STATE_COLOR.PLANNED : STATE_COLOR.REFUSED;
    if (this.roadWidth === 0) {
      this.showCenterline(liveNetwork, sectionPlan, color);
    } else {
      if (speculation !== null) {
        replaceGeometry(this.band, []);
        this.showSpeculativeSurface(plan, speculation);
      } else {
        this.speculativeSurface.setParts([], []);
        this.showBand(liveNetwork, sectionPlan, color);
      }
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
  }

  /** The centerline, each piece in the shape it runs in. */
  private showCenterline(
    liveNetwork: RoadNetwork,
    plan: SectionPlan,
    color: number,
  ): void {
    let previous = positionOf(liveNetwork, plan.start.at);
    const coordinates = [previous.x, LAYER.SECTION_DECORATION, previous.z];
    for (const piece of plan.pieces) {
      const position = positionOf(liveNetwork, piece.to.at);
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
    liveNetwork: RoadNetwork,
    plan: SectionPlan,
    color: number,
  ): void {
    const coordinates: number[] = [];
    let previous = positionOf(liveNetwork, plan.start.at);
    for (const piece of plan.pieces) {
      const position = positionOf(liveNetwork, piece.to.at);
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
