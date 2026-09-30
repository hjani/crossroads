import type { RoadPlan } from "../core/layout/roadPlan";
import { pointsOf } from "../core/network/edits";
import { isNodeId } from "../core/network/RoadNetwork";
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
 * Marks the existing junctions a plan meets: planned where it can be built,
 * refused where not. Nothing for `null`, where there is no plan.
 */
export function showPlanStates(
  partStates: PartStates,
  plan: RoadPlan | null,
): void {
  const met =
    plan === null
      ? []
      : pointsOf(plan.sectionPlan)
          .map((point) => point.at)
          .filter(isNodeId);
  partStates.setJunctionsInState(
    PART_STATE.PLANNED,
    plan?.buildable === true ? met : [],
  );
  partStates.setJunctionsInState(
    PART_STATE.REFUSED,
    plan?.buildable === false ? met : [],
  );
}
