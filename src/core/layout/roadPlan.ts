import { arcCircle } from "../geometry/arc";
import type { LineGeometry } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import {
  applySectionPlan,
  planSection,
  type BuildableSectionPlan,
  type SectionPlan,
} from "../network/edits";
import { positionOf } from "../network/queries";
import type { Endpoint, RoadNetwork } from "../network/RoadNetwork";
import type { NodeId } from "../network/types";
import { verifyClearance } from "./clearance";
import { ROAD_WIDTH_METERS, type RoadLayout } from "./RoadLayout";
import { speculateLayout, type LayoutSpeculation } from "./speculation";

/**
 * What adding a road would do (`docs/intersections.md`): the network's
 * section plan, whether it can be built, and the speculation if available.
 *
 * A buildable road plan always holds a buildable section plan and a
 * speculation.
 */
export type RoadPlan =
  | {
      readonly buildable: true;
      readonly sectionPlan: BuildableSectionPlan;
      readonly speculation: LayoutSpeculation;
    }
  | {
      readonly buildable: false;
      readonly sectionPlan: SectionPlan;
      /** Null where the plan was refused before speculating. */
      readonly speculation: LayoutSpeculation | null;
    };

/**
 * Plans a road from `from` to `to` on the network, then verifies that the
 * plan would not violate layout rules.
 */
export function planRoad(
  network: RoadNetwork,
  layout: RoadLayout,
  from: Endpoint,
  to: Endpoint,
  geometry: LineGeometry,
): RoadPlan {
  const sectionPlan = planSection(network, from, to, geometry);
  const allowed = allowsRoadway(
    positionOf(network, from),
    positionOf(network, to),
    geometry,
  );
  if (!allowed || !sectionPlan.buildable) {
    return { buildable: false, sectionPlan, speculation: null };
  }

  const speculation = speculateLayout(network, sectionPlan);
  return verifyClearance(speculation, layout)
    ? { buildable: true, sectionPlan, speculation }
    : { buildable: false, sectionPlan, speculation };
}

/**
 * Builds a road plan that can be built. Tools apply plans only through this.
 *
 * Returns the node at the far end so tools can directly chain from it.
 */
export function applyRoadPlan(
  network: RoadNetwork,
  plan: Extract<RoadPlan, { buildable: true }>,
): NodeId {
  return applySectionPlan(network, plan.sectionPlan);
}

/**
 * Whether this geometry is suitable for creating a Roadway at all.
 */
function allowsRoadway(from: Vec2, to: Vec2, geometry: LineGeometry): boolean {
  if (geometry.kind !== "arc") return true;

  const circle = arcCircle(from, to, geometry.via);
  return circle === null || circle.radius > ROAD_WIDTH_METERS / 2;
}
