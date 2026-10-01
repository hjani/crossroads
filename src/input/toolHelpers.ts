import {
  changedOrViolatingParts,
  type RoadPlan,
} from "../core/layout/roadPlan";
import { PART_STATE, type PartStates } from "../render/PartStates";
import type { RoadNetworkHighlight } from "../render/RoadNetworkHighlight";
import type { Placement } from "./sectionPointPlacement";

/**
 * Pieces shared by the tools that have no better home yet.
 */

/**
 * Marks what an end placed here would weld onto: a junction or a roadway.
 * Nothing where there's nothing nearby, or for `null`, where no end is being
 * placed.
 */
export function showWeldTarget(
  partStates: PartStates,
  highlight: RoadNetworkHighlight,
  placed: Placement | null,
): void {
  const nodes = placed?.kind === "node" ? [placed.node] : [];
  const sections = placed?.kind === "section" ? [placed.section] : [];
  partStates.setJunctionsInState(PART_STATE.AIMED, nodes);
  partStates.setRoadwaysInState(PART_STATE.AIMED, sections);
  if (sections.length > 0) {
    highlight.show({ sections });
  } else {
    highlight.hide();
  }
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
