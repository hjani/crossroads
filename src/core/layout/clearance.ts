import {
  distanceBetweenLines,
  nearestPointOnLine,
} from "../geometry/lineGeometry";
import { distance, SAME_POINT_METERS } from "../geometry/point";
import { sectionRadius } from "../network/queries";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, Section, SectionId } from "../network/types";
import type { Junction } from "./junction";
import type { RoadLayout } from "./RoadLayout";
import type { Roadway } from "./roadway";
import type { LayoutSpeculation } from "./speculation";

/**
 * How far two parts may overlap, in meters: room for rounding, so two
 * junctions that just touch are not refused at random.
 */
const OVERLAP_TOLERANCE_METERS = SAME_POINT_METERS;

/**
 * The widest a junction's bounding circle may be, in meters: a practical
 * limit.
 */
const MAX_JUNCTION_RADIUS_METERS = 25;

/** The shortest a roadway may be, in meters: a practical limit. */
const MIN_ROADWAY_LENGTH_METERS = 30;

/** The tightest a roadway may curve, in meters: a practical limit. */
const MIN_ROADWAY_RADIUS_METERS = 10;

/**
 * The clearing step (`docs/intersections.md`): whether every changed part
 * of a speculation keeps clear of every other, and within the practical
 * limits.
 *
 * `liveLayout` is the layout of the network the speculation was made from:
 * the parts the plan doesn't change are read from it rather than worked out
 * again.
 */
export function verifyClearance(
  speculation: LayoutSpeculation,
  liveLayout: RoadLayout,
): boolean {
  const {
    speculativeNetwork,
    speculativeLayout,
    changedNodes,
    changedSections,
  } = speculation;

  for (const id of changedSections) {
    // Read off the section, not its roadway: a roadway runs on its
    // section's circle.
    const section = speculativeNetwork.getSection(id);
    const radius = sectionRadius(speculativeNetwork, section);
    if (radius !== null && radius < MIN_ROADWAY_RADIUS_METERS) {
      return false;
    }
  }
  for (const id of changedSections) {
    // This also rejects roadways with negative length (due to large setbacks)
    if (speculativeLayout.roadwayAlong(id).length < MIN_ROADWAY_LENGTH_METERS) {
      return false;
    }
  }
  for (const id of changedNodes) {
    const radius = speculativeLayout.junctionAt(id).boundingRadius();
    if (radius > MAX_JUNCTION_RADIUS_METERS) {
      return false;
    }
  }
  const junctionAt = (node: NodeId): Junction =>
    changedNodes.has(node)
      ? speculativeLayout.junctionAt(node)
      : liveLayout.junctionAt(node);
  if (junctionsOverlap(speculativeNetwork, junctionAt, changedNodes)) {
    return false;
  }
  const roadwayAlong = (section: SectionId): Roadway =>
    changedSections.has(section)
      ? speculativeLayout.roadwayAlong(section)
      : liveLayout.roadwayAlong(section);
  return (
    !roadwaysRunIntoJunctions(
      speculativeNetwork,
      junctionAt,
      roadwayAlong,
      changedNodes,
      changedSections,
    ) && !roadwaysOverlap(speculativeNetwork, roadwayAlong, changedSections)
  );
}

/**
 * Whether a changed junction's circle overlaps any other junction's. Each
 * pair is tested once, even where both are changed.
 */
function junctionsOverlap(
  speculativeNetwork: RoadNetwork,
  junctionAt: (node: NodeId) => Junction,
  changed: ReadonlySet<NodeId>,
): boolean {
  const tested = new Set<NodeId>();
  for (const id of changed) {
    tested.add(id);
    const position = speculativeNetwork.getNode(id).position;
    const radius = junctionAt(id).boundingRadius();
    for (const other of speculativeNetwork.allNodes()) {
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
  speculativeNetwork: RoadNetwork,
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
    for (const section of speculativeNetwork.allSections()) {
      if (runsInto(section, node)) {
        return true;
      }
    }
  }
  for (const id of changedSections) {
    const section = speculativeNetwork.getSection(id);
    for (const node of speculativeNetwork.allNodes()) {
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
  speculativeNetwork: RoadNetwork,
  roadwayAlong: (section: SectionId) => Roadway,
  changed: ReadonlySet<SectionId>,
): boolean {
  const tested = new Set<SectionId>();
  for (const id of changed) {
    tested.add(id);
    const section = speculativeNetwork.getSection(id);
    for (const other of speculativeNetwork.allSections()) {
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
