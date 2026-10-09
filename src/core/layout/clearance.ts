import {
  distanceBetweenLines,
  nearestPointOnLine,
} from "../geometry/lineGeometry";
import { distance, SAME_POINT_METERS } from "../geometry/point";
import { sectionRadii } from "../network/queries";
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
 * The parts of a speculation taking part in a broken clearance rule, by
 * their ids in the speculative network. Both empty where the plan clears.
 */
export interface ClearanceViolations {
  readonly violatingNodes: ReadonlySet<NodeId>;
  readonly violatingSections: ReadonlySet<SectionId>;
}

/**
 * The clearing step (`docs/intersections.md`): every changed part of a
 * speculation that doesn't keep clear of every other, or breaks a practical
 * limit — with the parts it runs into. Every rule is measured to the end, so
 * no part is left out just because another one was already refused.
 *
 * `liveLayout` is the layout of the network the speculation was made from:
 * the parts the plan doesn't change are read from it rather than worked out
 * again.
 */
export function verifyClearance(
  speculation: LayoutSpeculation,
  liveLayout: RoadLayout,
): ClearanceViolations {
  const {
    speculativeNetwork,
    speculativeLayout,
    changedNodes,
    changedSections,
  } = speculation;
  const violatingNodes = new Set<NodeId>();
  const violatingSections = new Set<SectionId>();

  for (const id of changedSections) {
    // Read off the section, not its roadway: a roadway runs on its
    // section's circles.
    const section = speculativeNetwork.getSection(id);
    const radii = sectionRadii(speculativeNetwork, section);
    if (radii.some((radius) => radius < MIN_ROADWAY_RADIUS_METERS)) {
      violatingSections.add(id);
    }
  }
  for (const id of changedSections) {
    // This also rejects roadways with negative length (due to large setbacks)
    if (speculativeLayout.roadwayAlong(id).length < MIN_ROADWAY_LENGTH_METERS) {
      violatingSections.add(id);
    }
  }
  for (const id of changedNodes) {
    const junction = speculativeLayout.junctionAt(id);
    if (
      junction.boundingRadius() > MAX_JUNCTION_RADIUS_METERS ||
      !junction.coversNode()
    ) {
      violatingNodes.add(id);
    }
  }

  // The pair rules, in this order. Each leaves out what the ones before it
  // named — taken before the rule rather than updated during it, so its
  // answer doesn't depend on the order it measures its pairs in.
  const junctionAt = (node: NodeId): Junction =>
    changedNodes.has(node)
      ? speculativeLayout.junctionAt(node)
      : liveLayout.junctionAt(node);
  collectJunctionOverlaps(
    speculativeNetwork,
    junctionAt,
    changedNodes,
    excludedParts(violatingNodes, violatingSections),
    violatingNodes,
  );
  const roadwayAlong = (section: SectionId): Roadway =>
    changedSections.has(section)
      ? speculativeLayout.roadwayAlong(section)
      : liveLayout.roadwayAlong(section);
  collectRoadwaysIntoJunctions(
    speculativeNetwork,
    junctionAt,
    roadwayAlong,
    changedNodes,
    changedSections,
    excludedParts(violatingNodes, violatingSections),
    violatingNodes,
    violatingSections,
  );
  collectRoadwayOverlaps(
    speculativeNetwork,
    roadwayAlong,
    changedSections,
    excludedParts(violatingNodes, violatingSections),
    violatingSections,
  );
  return { violatingNodes, violatingSections };
}

/**
 * Parts a pair rule leaves out: a pair with one of them in it is not
 * measured.
 */
interface ExcludedParts {
  readonly nodes: ReadonlySet<NodeId>;
  readonly sections: ReadonlySet<SectionId>;
}

/**
 * The parts violating so far: a part is named by one rule at most
 * (`docs/intersections.md`).
 */
function excludedParts(
  violatingNodes: ReadonlySet<NodeId>,
  violatingSections: ReadonlySet<SectionId>,
): ExcludedParts {
  return {
    nodes: new Set(violatingNodes),
    sections: new Set(violatingSections),
  };
}

/**
 * Adds to `violatingNodes` both nodes of every pair where a changed
 * junction's circle overlaps another junction's. Each pair is tested once,
 * even where both are changed.
 */
function collectJunctionOverlaps(
  speculativeNetwork: RoadNetwork,
  junctionAt: (node: NodeId) => Junction,
  changed: ReadonlySet<NodeId>,
  excluded: ExcludedParts,
  violatingNodes: Set<NodeId>,
): void {
  const tested = new Set<NodeId>();
  for (const id of changed) {
    tested.add(id);
    if (excluded.nodes.has(id)) {
      continue;
    }
    const position = speculativeNetwork.getNode(id).position;
    const radius = junctionAt(id).boundingRadius();
    for (const other of speculativeNetwork.allNodes()) {
      if (tested.has(other.id) || excluded.nodes.has(other.id)) {
        continue;
      }
      const reach = radius + junctionAt(other.id).boundingRadius();
      if (
        distance(position, other.position) <
        reach - OVERLAP_TOLERANCE_METERS
      ) {
        violatingNodes.add(id);
        violatingNodes.add(other.id);
      }
    }
  }
}

/**
 * Adds the junction and the roadway of every pair where a roadway runs into
 * a junction it doesn't meet, and either of the two is changed. Each pair
 * is tested once:
 *
 * - every changed junction × every roadway not meeting it
 * - every changed roadway × every unchanged junction not at its ends
 */
function collectRoadwaysIntoJunctions(
  speculativeNetwork: RoadNetwork,
  junctionAt: (node: NodeId) => Junction,
  roadwayAlong: (section: SectionId) => Roadway,
  changedNodes: ReadonlySet<NodeId>,
  changedSections: ReadonlySet<SectionId>,
  excluded: ExcludedParts,
  violatingNodes: Set<NodeId>,
  violatingSections: Set<SectionId>,
): void {
  const collect = (section: Section, node: NodeId): void => {
    if (
      !excluded.sections.has(section.id) &&
      !excluded.nodes.has(node) &&
      section.from !== node &&
      section.to !== node &&
      roadwayRunsInto(roadwayAlong(section.id), junctionAt(node))
    ) {
      violatingNodes.add(node);
      violatingSections.add(section.id);
    }
  };

  for (const node of changedNodes) {
    for (const section of speculativeNetwork.allSections()) {
      collect(section, node);
    }
  }
  for (const id of changedSections) {
    const section = speculativeNetwork.getSection(id);
    for (const node of speculativeNetwork.allNodes()) {
      if (!changedNodes.has(node.id)) {
        collect(section, node.id);
      }
    }
  }
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
 * Adds to `violatingSections` both sections of every pair where a changed
 * roadway overlaps another roadway it shares no node with. Each pair is
 * tested once, even where both are changed.
 *
 * A pair where both end at excluded junctions is left out too: the
 * junctions' conflict is where theirs comes from.
 */
function collectRoadwayOverlaps(
  speculativeNetwork: RoadNetwork,
  roadwayAlong: (section: SectionId) => Roadway,
  changed: ReadonlySet<SectionId>,
  excluded: ExcludedParts,
  violatingSections: Set<SectionId>,
): void {
  const endsExcluded = (section: Section): boolean =>
    excluded.nodes.has(section.from) || excluded.nodes.has(section.to);

  const tested = new Set<SectionId>();
  for (const id of changed) {
    tested.add(id);
    if (excluded.sections.has(id)) {
      continue;
    }
    const section = speculativeNetwork.getSection(id);
    for (const other of speculativeNetwork.allSections()) {
      if (
        !tested.has(other.id) &&
        !excluded.sections.has(other.id) &&
        !(endsExcluded(section) && endsExcluded(other)) &&
        !shareNode(section, other) &&
        roadwayOverlaps(roadwayAlong(id), roadwayAlong(other.id))
      ) {
        violatingSections.add(id);
        violatingSections.add(other.id);
      }
    }
  }
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
