import { angleOf, type Vec2 } from "../core/geometry/point";
import {
  changedOrViolatingParts,
  type RoadPlan,
} from "../core/layout/roadPlan";
import { STATE_COLOR } from "../render/colors";
import type { JunctionHighlight } from "../render/JunctionHighlight";
import { PART_STATE, type PartStates } from "../render/PartStates";
import type { Placement } from "./sectionPointPlacement";

/**
 * Pieces shared by the tools that have no better home yet.
 */

/**
 * Marks where an end would land: aimed where it welds onto a junction or a
 * roadway, in the plan's color where it makes a node of its own. Nothing for
 * `null`, where no end would land.
 *
 * Sized as a new node, whatever is there: an existing junction may grow or
 * shrink once the plan is built.
 */
export function showLanding(
  mark: JunctionHighlight,
  placed: Placement | null,
  plan: RoadPlan | null,
): void {
  if (placed === null) {
    mark.hide();
    return;
  }
  const welds = placed.kind === "node" || placed.kind === "section";
  mark.show([placed.position], welds ? STATE_COLOR.AIMED : planColor(plan));
}

/**
 * Marks an end already placed, in the plan's color: what it welds onto was
 * shown while it was being placed. Sized as in `showLanding`. Nothing for
 * `null`, where none is.
 */
export function showPlacedEnd(
  mark: JunctionHighlight,
  placed: Placement | null,
  plan: RoadPlan | null,
): void {
  if (placed === null) {
    mark.hide();
  } else {
    mark.show([placed.position], planColor(plan));
  }
}

/**
 * The unit direction at a multiple of `stepRadians` nearest to the way
 * `toward` points. `toward` does not need to be a unit vector.
 */
export function snapDirection(toward: Vec2, stepRadians: number): Vec2 {
  const angle = Math.round(angleOf(toward) / stepRadians) * stepRadians;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/** Planned, or refused where it can't be built. Planned with no plan yet. */
function planColor(plan: RoadPlan | null): number {
  return plan?.buildable === false ? STATE_COLOR.REFUSED : STATE_COLOR.PLANNED;
}

/**
 * Hides the live parts a plan's speculation is drawn in place of: the changed
 * or violating ones, and the sections the edit removes. Nothing for a plan
 * without a speculation, or for `null`, where there is no plan.
 */
export function hideSpeculatedParts(
  partStates: PartStates,
  plan: RoadPlan | null,
): void {
  const speculation = plan?.speculation ?? null;
  if (plan === null || speculation === null) {
    partStates.setJunctionsInState(PART_STATE.HIDDEN, []);
    partStates.setRoadwaysInState(PART_STATE.HIDDEN, []);
    return;
  }

  const speculated = changedOrViolatingParts(plan);
  partStates.setJunctionsInState(PART_STATE.HIDDEN, speculated.nodes);
  partStates.setRoadwaysInState(PART_STATE.HIDDEN, [
    ...speculated.sections,
    ...speculation.removedSections,
  ]);
}
