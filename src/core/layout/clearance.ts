import { distance, SAME_POINT_METERS } from "../geometry/point";
import { applySectionPlan, type SectionPlan } from "../network/edits";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, SectionId } from "../network/types";
import type { Junction } from "./junction";
import { RoadLayout } from "./RoadLayout";

/**
 * How far two parts may overlap, in meters: room for rounding, so two
 * junctions that just touch are not refused at random.
 */
const OVERLAP_TOLERANCE_METERS = SAME_POINT_METERS;

/**
 * The clearing step (`docs/intersections.md`): whether the ground a plan
 * would cover is clear, measured on the speculative network.
 *
 * `layout` is `network`'s own, live layout: the parts the plan doesn't
 * change are read from it rather than worked out again.
 *
 * Hands back the same plan, refused where it isn't clear. A plan refused
 * already comes back as it is: it can't be applied, so there is nothing to
 * measure.
 */
export function verifyClearance(
  network: RoadNetwork,
  layout: RoadLayout,
  plan: SectionPlan,
): SectionPlan {
  if (!plan.buildable) {
    return plan;
  }

  const speculative = network.clone();
  applySectionPlan(speculative, plan);
  const speculativeLayout = new RoadLayout(speculative);

  const nodes = affectedNodes(network, speculative);
  for (const id of affectedSections(speculative, nodes)) {
    // Negative where the setbacks at its two ends overlap.
    if (speculativeLayout.roadwayAlong(id).length < -OVERLAP_TOLERANCE_METERS) {
      return { ...plan, buildable: false };
    }
  }
  const junctionAt = (node: NodeId): Junction =>
    nodes.has(node)
      ? speculativeLayout.junctionAt(node)
      : layout.junctionAt(node);
  if (junctionsOverlap(speculative, junctionAt, nodes)) {
    return { ...plan, buildable: false };
  }
  return plan;
}

/**
 * Whether a changed junction's circle overlaps any other junction's. Each
 * pair is tested once, even where both are changed.
 */
function junctionsOverlap(
  speculative: RoadNetwork,
  junctionAt: (node: NodeId) => Junction,
  changed: ReadonlySet<NodeId>,
): boolean {
  const tested = new Set<NodeId>();
  for (const id of changed) {
    tested.add(id);
    const position = speculative.getNode(id).position;
    const radius = junctionAt(id).boundingRadius();
    for (const other of speculative.allNodes()) {
      if (tested.has(other.id)) {
        continue;
      }
      const reach = radius + junctionAt(other.id).boundingRadius();
      if (
        distance(position, other.position) <
        reach - OVERLAP_TOLERANCE_METERS
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The ends of every section the real network doesn't have: the plan's own
 * pieces and the pieces of what it cut → the plan's points and the far ends
 * of the cut sections. Their junctions are the ones the edit changed.
 */
function affectedNodes(
  real: RoadNetwork,
  speculative: RoadNetwork,
): Set<NodeId> {
  const existing = new Set(Array.from(real.allSections(), (s) => s.id));
  const nodes = new Set<NodeId>();
  for (const section of speculative.allSections()) {
    if (!existing.has(section.id)) {
      nodes.add(section.from);
      nodes.add(section.to);
    }
  }
  return nodes;
}

/**
 * Every section meeting one of the nodes. Their roadways are the ones the
 * edit changed.
 */
function affectedSections(
  speculative: RoadNetwork,
  nodes: ReadonlySet<NodeId>,
): Set<SectionId> {
  const sections = new Set<SectionId>();
  for (const node of nodes) {
    for (const section of speculative.sectionsAt(node)) {
      sections.add(section);
    }
  }
  return sections;
}
