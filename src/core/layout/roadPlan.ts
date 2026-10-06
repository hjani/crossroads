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
import type { NodeId, RoadProfile, SectionId } from "../network/types";
import { verifyClearance, type ClearanceViolations } from "./clearance";
import type { RoadLayout } from "./RoadLayout";
import { speculateLayout, type LayoutSpeculation } from "./speculation";

/**
 * What adding a road would do (`docs/intersections.md`): the network's
 * section plan, whether it can be built, the speculation if available, and
 * the parts a refusal is about.
 *
 * A buildable road plan always holds a buildable section plan and a
 * speculation, and no violations.
 */
export type RoadPlan =
  | {
      readonly buildable: true;
      readonly sectionPlan: BuildableSectionPlan;
      readonly speculation: LayoutSpeculation;
      readonly violations: ClearanceViolations;
    }
  | {
      readonly buildable: false;
      readonly sectionPlan: SectionPlan;
      /** Null where the plan was refused before speculating. */
      readonly speculation: LayoutSpeculation | null;
      /** Empty where the plan was refused before speculating. */
      readonly violations: ClearanceViolations;
    };

const NO_VIOLATIONS: ClearanceViolations = {
  violatingNodes: new Set(),
  violatingSections: new Set(),
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
  profile: RoadProfile,
): RoadPlan {
  const sectionPlan = planSection(network, from, to, geometry, profile);
  const allowed = allowsRoadway(
    positionOf(network, from),
    positionOf(network, to),
    geometry,
    profile.width,
  );
  if (!allowed || !sectionPlan.buildable) {
    return {
      buildable: false,
      sectionPlan,
      speculation: null,
      violations: NO_VIOLATIONS,
    };
  }

  const speculation = speculateLayout(network, sectionPlan);
  const violations = verifyClearance(speculation, layout);
  const clear =
    violations.violatingNodes.size === 0 &&
    violations.violatingSections.size === 0;
  return { buildable: clear, sectionPlan, speculation, violations };
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
  const built = applySectionPlan(network, plan.sectionPlan);
  return built[built.length - 1].to;
}

/**
 * The parts a plan's speculation changes, and the parts in violation.
 *
 * Violations can name parts the edit doesn't change.
 */
export function changedOrViolatingParts(plan: RoadPlan): {
  readonly nodes: ReadonlySet<NodeId>;
  readonly sections: ReadonlySet<SectionId>;
} {
  const { speculation, violations } = plan;
  if (speculation === null) {
    return { nodes: new Set(), sections: new Set() };
  }
  return {
    nodes: new Set([...speculation.changedNodes, ...violations.violatingNodes]),
    sections: new Set([
      ...speculation.changedSections,
      ...violations.violatingSections,
    ]),
  };
}

/**
 * Whether this geometry is suitable for creating a Roadway at all.
 */
function allowsRoadway(
  from: Vec2,
  to: Vec2,
  geometry: LineGeometry,
  width: number,
): boolean {
  if (geometry.kind !== "arc") return true;

  const circle = arcCircle(from, to, geometry.via);
  return circle === null || circle.radius > width / 2;
}
