import { arcCircle, arcLength } from "./arcs";
import { distance, isSamePoint, SAME_POINT_METERS } from "./points";
import {
  crossingsAlong,
  nearestNode,
  nodeWithin,
  positionOf,
  positionOfNode,
} from "./queries";
import { isNodeId, type Endpoint, type RoadNetwork } from "./RoadNetwork";
import {
  STRAIGHT,
  type NodeId,
  type Section,
  type SectionGeometry,
  type SectionId,
  type Vec2,
} from "./types";

/**
 * Edits that span more than one section.
 *
 * Outside `RoadNetwork` on purpose: the model stores nodes and sections and
 * keeps them structurally valid, while these compose its public calls into
 * a change that means something — a crossing becomes a junction. Nothing
 * here is privileged, and a caller could make the same calls itself.
 *
 * Deciding and doing are separate calls. Planning answers what a section
 * would build and whether it can be built, and touches nothing; applying a
 * plan carries it out and decides nothing. So the same question can be
 * asked of a section that is only being dragged around, and the answer it
 * gave is the one that lands.
 */

/**
 * The shortest a section may be, in meters.
 *
 * Not a tolerance but a judgment: anything shorter is not a road, it is
 * the residue of a click that nearly hit something. Every piece an edit
 * would leave is measured against it — the whole section included, when it
 * crosses nothing to be cut at.
 */
export const MIN_SECTION_LENGTH_METERS = 1;

/** A place a planned section runs through: where it starts, where it
 * crosses something, where it ends. */
export interface PlannedPoint {
  /** The place itself: an existing node the section meets, or a position
   * where one is to be made. */
  readonly at: Endpoint;
  /**
   * The sections cut in two here, in the order they are cut — usually one,
   * none where the place is a node already, and several where roads that
   * pass within a centimeter of each other are crossed at what is, on the
   * ground, one point.
   */
  readonly cuts: readonly SectionId[];
}

/**
 * A section that can be built, as the chain of points it runs through:
 * a piece of road between each pair of them, and a junction wherever a
 * point cuts something.
 *
 * Points in the same place are already merged, so no two are, and there is
 * one piece per gap. What to build is the chain's shape and nothing else.
 *
 * The type says there are at least two points — a start and an end — which
 * is what makes the section a section. `[T, T, ...T[]]` is a tuple type
 * with a rest element: the compiler knows the first two are there, so
 * reading them needs no check.
 */
export interface BuildableSectionPlan {
  readonly buildable: true;
  readonly points: readonly [PlannedPoint, PlannedPoint, ...PlannedPoint[]];
  /** How the section runs between its points — carried so a plan describes
   * the whole of what would be built, shape included. */
  readonly geometry: SectionGeometry;
}

/**
 * A section that cannot be built, as the chain it would have run through.
 *
 * The chain is kept because a refusal still has something to say: where
 * the section was going, and which junctions it was going to make. Nothing
 * here is a promise — none of it will be built — so the points carry no
 * guarantee either, not even that there are two of them. A section whose
 * ends are the same place collapses to one, and that is a refusal like any
 * other.
 */
export interface UnbuildableSectionPlan {
  readonly buildable: false;
  readonly points: readonly PlannedPoint[];
  /** The shape it was going to run in, so a refusal can be drawn as the
   * section that was asked for rather than as the line between its ends. */
  readonly geometry: SectionGeometry;
}

/** What adding a section would do to the network — or that it cannot. */
export type SectionPlan = BuildableSectionPlan | UnbuildableSectionPlan;

/**
 * Works out what adding a section from `from` to `to` would build, without
 * building any of it.
 *
 * Unbuildable unless the network it would leave is worth having: every
 * piece the section is cut into is a road, and every crossing falls
 * somewhere a junction can go. With nothing crossed, the single piece is
 * the whole section.
 *
 * The chain is walked to the end whether or not it can be built, and
 * judged once it is whole. A refusal is a verdict on the section, not the
 * point a walk gave up at — so it comes back describing the section that
 * was asked for rather than the part of it that was reached, and anything
 * showing the user what a click would do has all of it to draw.
 */
export function planSection(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
  geometry: SectionGeometry,
): SectionPlan {
  // Non-empty from the first line and never shrinks, so the chain always
  // has a last point to measure the next one against.
  const points: [PlannedPoint, ...PlannedPoint[]] = [{ at: from, cuts: [] }];
  let buildable = true;

  // Lengths are measured along the crossing points themselves, rather than
  // along the points being planned: those sit within a centimeter of them,
  // near enough to build at and not to measure with.
  const begin = positionOf(network, from);
  const end = positionOf(network, to);
  let measuredFrom = begin;

  // An arc is the circle through its ends and its third position, and three
  // positions in a line have none. A refusal rather than a thrown error,
  // because a third position dragged from one side of the road to the other
  // crosses the line every time, and the user is aiming through it.
  if (geometry.kind === "arc" && arcCircle(begin, end, geometry.via) === null) {
    buildable = false;
  }

  for (const crossing of crossingsAlong(network, from, to, geometry)) {
    if (!isBuildableLength(pieceLength(measuredFrom, crossing.point, geometry))) {
      buildable = false;
    }
    if (!landsCleanly(network, crossing.point)) {
      buildable = false;
    }
    measuredFrom = crossing.point;

    const reached = points[points.length - 1].at;
    const at = pickPoint(network, crossing.point, [reached, to]);
    append(network, points, plannedCrossing(network, crossing.section, at));
  }

  if (!isBuildableLength(pieceLength(measuredFrom, end, geometry))) {
    buildable = false;
  }
  append(network, points, { at: to, cuts: [] });

  const [start, next, ...rest] = points;
  if (next === undefined) {
    // Everything merged into one point: the section begins and ends in the
    // same place, and there is no piece of road between them. Not caught
    // by the piece lengths above, which read a gap of nothing as no piece
    // to build rather than as one too short to be a road.
    return { buildable: false, points, geometry };
  }
  if (!buildable) {
    return { buildable: false, points, geometry };
  }

  return { buildable: true, points: [start, next, ...rest], geometry };
}

/**
 * Builds a planned section: cuts what the plan says to cut, and runs a
 * piece of road between each pair of its points.
 *
 * Returns the node at the far end, so a run of roads can carry on from it.
 * Decides nothing — a plan is buildable or it is not, and this one is.
 */
export function applySectionPlan(
  network: RoadNetwork,
  plan: BuildableSectionPlan,
): NodeId {
  const [start, next, ...rest] = plan.points;

  // The first point has no piece before it, so it only supplies the end
  // the second is joined to. After that each piece carries on from the
  // node the one before it left.
  // Every piece runs in the section's own shape. Which is only right while
  // there is one piece to an arc — an arc cut in two needs a third position
  // for each half, and neither of them is the one the whole arc was given.
  // It holds for now, since an arc crosses nothing to be cut at.
  const first = applyCuts(network, start);
  let far = network.addSection(first, applyCuts(network, next), plan.geometry).to;
  for (const point of rest) {
    far = network.addSection(far, applyCuts(network, point), plan.geometry).to;
  }
  return far;
}

/**
 * Splits a section at a point, and returns the node its halves meet at.
 *
 * A point that is the same place as one of the section's own endpoints
 * splits nothing and gives back that endpoint's node, so a road meeting
 * another where it already ends joins it rather than cutting it.
 */
function splitSection(
  network: RoadNetwork,
  id: SectionId,
  at: Endpoint,
): NodeId {
  const section = getSection(network, id);

  const end = endAt(network, section, positionOf(network, at));
  if (end !== null) {
    return end;
  }

  // Both halves go in before the original comes out: the network discards a
  // node the moment its last section leaves, so removing first would take
  // the endpoints with it.
  const half = network.addSection(section.from, at, STRAIGHT);
  network.addSection(half.to, section.to, STRAIGHT);
  network.removeSection(id);
  return half.to;
}

/**
 * Cuts what a point of the chain cuts, and gives back the end the pieces of
 * road either side of it attach to.
 *
 * Each cut is made at the node the one before it left, so several sections
 * cut in one place meet at one node rather than at a row of them. A point
 * that cuts nothing is simply the place it already was.
 */
function applyCuts(network: RoadNetwork, point: PlannedPoint): Endpoint {
  let at = point.at;
  for (const cut of point.cuts) {
    at = splitSection(network, cut, at);
  }
  return at;
}

/**
 * What a crossing makes of the section it crosses: a junction cutting it in
 * two, or the end it already has in that place.
 *
 * The second is how a road running through an existing junction crosses
 * every section meeting there and cuts none of them.
 */
function plannedCrossing(
  network: RoadNetwork,
  section: SectionId,
  at: Endpoint,
): PlannedPoint {
  const place = positionOf(network, at);
  const end = endAt(network, getSection(network, section), place);
  return end === null ? { at, cuts: [section] } : { at: end, cuts: [] };
}

/**
 * Adds a point to the chain, or merges it into the last one if that is the
 * same place — where a crossing lands on an end of the new section, on a
 * junction it has already been through, or on another crossing a centimeter
 * away.
 *
 * Merging is what leaves the chain with one piece of road per gap: two
 * points in the same place would ask for a piece between them and there is
 * none to build. Their cuts are kept, all of them: sections crossed within
 * a centimeter of each other are one junction, and dropping either would
 * leave a road running through another uncut.
 */
function append(
  network: RoadNetwork,
  points: [PlannedPoint, ...PlannedPoint[]],
  point: PlannedPoint,
): void {
  const last = points[points.length - 1];
  if (!isSamePoint(positionOf(network, point.at), positionOf(network, last.at))) {
    points.push(point);
    return;
  }

  points[points.length - 1] = {
    // A node the network already has says the place better than a position
    // does, since building at the position would leave a second node beside
    // it. Where neither is a node the two are the same position anyway.
    at: isNodeId(last.at) ? last.at : point.at,
    cuts: [...last.cuts, ...point.cuts],
  };
}

/**
 * Which place a point of the chain is: one of the candidates, if it is
 * there, and otherwise a node already in that place or a position for a new
 * one.
 *
 * The candidates are the ends of the new section — the point the chain has
 * reached and the point it is heading for — and they win because they are
 * positions the user placed, and are not necessarily nodes yet. Failing
 * them, an existing node is used, so that two roads crossing the new one
 * within a centimeter of each other meet it at one node rather than at two
 * beside each other.
 */
function pickPoint(
  network: RoadNetwork,
  where: Vec2,
  candidates: readonly Endpoint[],
): Endpoint {
  for (const candidate of candidates) {
    if (isSamePoint(where, positionOf(network, candidate))) {
      return candidate;
    }
  }
  return nodeWithin(network, where, SAME_POINT_METERS)?.id ?? where;
}

/** The section's own end in that place, if either of them is there. */
function endAt(
  network: RoadNetwork,
  section: Section,
  place: Vec2,
): NodeId | null {
  if (isSamePoint(place, positionOfNode(network, section.from))) {
    return section.from;
  }
  if (isSamePoint(place, positionOfNode(network, section.to))) {
    return section.to;
  }
  return null;
}

/** Throws for an unknown section, as `positionOfNode` does for a node. */
function getSection(network: RoadNetwork, id: SectionId): Section {
  const section = network.getSection(id);
  if (section === undefined) {
    throw new Error(`Unknown section ${id}`);
  }
  return section;
}

/**
 * Whether a crossing falls somewhere a junction can go: on an existing
 * node, or clear of every one of them.
 *
 * In between is a miss — the user was aiming at that node — and it is also
 * where a junction would leave a stub behind, since a node that close is
 * the end of some road. Asking for the nearest node covers the ends of the
 * section being crossed along with every other one.
 */
function landsCleanly(network: RoadNetwork, point: Vec2): boolean {
  const near = nearestNode(network, point, MIN_SECTION_LENGTH_METERS);
  return near === null || isSamePoint(near.position, point);
}

/**
 * How far a piece of the section runs between two of its points, in meters
 * — along the curve of an arc rather than across it, so a bend is measured
 * as the road a driver takes.
 *
 * An arc is only ever asked for the whole of itself, crossing nothing to be
 * cut at, which is what makes its own third position the right one to
 * measure by. A piece of an arc would need a third position of its own.
 */
function pieceLength(from: Vec2, to: Vec2, geometry: SectionGeometry): number {
  return geometry.kind === "arc"
    ? arcLength(from, to, geometry.via)
    : distance(from, to);
}

/**
 * A length is either no piece at all — the same place twice, where a
 * crossing lands on a point the section already has — or long enough to be
 * a road. In between is the near miss nothing sensible can be made of.
 */
function isBuildableLength(length: number): boolean {
  return length <= SAME_POINT_METERS || length >= MIN_SECTION_LENGTH_METERS;
}
