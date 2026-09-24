import {
  distanceBetweenLines,
  nearestPointOnLine,
} from "../geometry/lineGeometry";
import { distance, SAME_POINT_METERS } from "../geometry/point";
import { applySectionPlan, type SectionPlan } from "../network/edits";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, Section, SectionId } from "../network/types";
import type { Junction } from "./junction";
import { RoadLayout } from "./RoadLayout";
import type { Roadway } from "./roadway";

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
  const sections = affectedSections(speculative, nodes);
  for (const id of sections) {
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
  const roadwayAlong = (section: SectionId): Roadway =>
    sections.has(section)
      ? speculativeLayout.roadwayAlong(section)
      : layout.roadwayAlong(section);
  if (
    roadwaysRunIntoJunctions(
      speculative,
      junctionAt,
      roadwayAlong,
      nodes,
      sections,
    )
  ) {
    return { ...plan, buildable: false };
  }
  if (roadwaysOverlap(speculative, roadwayAlong, sections)) {
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
 * Whether a roadway runs into a junction it doesn't meet, where either of
 * the two is changed. Each pair is tested once:
 *
 * - every changed junction × every roadway not meeting it
 * - every changed roadway × every unchanged junction not at its ends
 */
function roadwaysRunIntoJunctions(
  speculative: RoadNetwork,
  junctionAt: (node: NodeId) => Junction,
  roadwayAlong: (section: SectionId) => Roadway,
  changedNodes: ReadonlySet<NodeId>,
  changedSections: ReadonlySet<SectionId>,
): boolean {
  const runsInto = (section: Section, node: NodeId): boolean =>
    section.from !== node &&
    section.to !== node &&
    roadwayRunsInto(roadwayAlong(section.id), junctionAt(node));

  for (const node of changedNodes) {
    for (const section of speculative.allSections()) {
      if (runsInto(section, node)) {
        return true;
      }
    }
  }
  for (const id of changedSections) {
    const section = speculative.getSection(id);
    for (const node of speculative.allNodes()) {
      if (!changedNodes.has(node.id) && runsInto(section, node.id)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether a roadway's band overlaps a junction's circle.
 *
 * Let `c` and `R` be the junction's center and bounding radius, `w` the
 * road's width, and `q` the point of the roadway's centerline nearest `c`,
 * between its two ends.
 *
 * - every point within `w/2` of the centerline is a band with round ends,
 *   which covers the true, square-ended one → conservative
 * - that band and the circle overlap where `c` comes closer to the
 *   centerline than the two reaches added up:
 *
 *       |c − q| < R + w/2
 */
function roadwayRunsInto(roadway: Roadway, junction: Junction): boolean {
  const { from, to, centerlineGeometry, widthMeters } = roadway.outline;
  const c = junction.center();
  const q = nearestPointOnLine(from, to, centerlineGeometry, c);
  const reach = junction.boundingRadius() + widthMeters / 2;
  return distance(c, q) < reach - OVERLAP_TOLERANCE_METERS;
}

/**
 * Whether a changed roadway overlaps another roadway it shares no node with.
 * Each pair is tested once, even where both are changed.
 */
function roadwaysOverlap(
  speculative: RoadNetwork,
  roadwayAlong: (section: SectionId) => Roadway,
  changed: ReadonlySet<SectionId>,
): boolean {
  const tested = new Set<SectionId>();
  for (const id of changed) {
    tested.add(id);
    const section = speculative.getSection(id);
    for (const other of speculative.allSections()) {
      if (
        !tested.has(other.id) &&
        !shareNode(section, other) &&
        roadwayOverlaps(roadwayAlong(id), roadwayAlong(other.id))
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether two roadways' bands overlap: their centerlines come closer than
 * their two half-widths added up.
 */
function roadwayOverlaps(a: Roadway, b: Roadway): boolean {
  const lineA = a.outline;
  const lineB = b.outline;
  const apart = distanceBetweenLines(
    lineA.from,
    lineA.to,
    lineA.centerlineGeometry,
    lineB.from,
    lineB.to,
    lineB.centerlineGeometry,
  );
  const reach = lineA.widthMeters / 2 + lineB.widthMeters / 2;
  return apart < reach - OVERLAP_TOLERANCE_METERS;
}

function shareNode(a: Section, b: Section): boolean {
  return (
    a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to
  );
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
