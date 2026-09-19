import { arcFractionAt, isArcValid, pointOnArc } from "../geometry/arc";
import { isSamePoint, SAME_POINT_METERS, type Vec2 } from "../geometry/point";
import { segmentFractionAt } from "../geometry/segment";
import {
  crossingsAlong,
  nearestNode,
  nearestSection,
  nodeWithin,
  positionOf,
} from "./queries";
import { isNodeId, type Endpoint, type RoadNetwork } from "./RoadNetwork";
import {
  lineLength,
  STRAIGHT,
  type LineGeometry,
} from "../geometry/lineGeometry";
import { type NodeId, type Section, type SectionId } from "./types";

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
 * One stretch of road a plan would build: the shape it runs in, and the
 * point it reaches.
 *
 * The shape sits on the piece rather than on the plan because when it
 * is cut, the cut point can merge into an existing point and that can
 * change the geometry slightly.
 */
export interface PlannedPiece {
  readonly centerlineGeometry: LineGeometry;
  readonly to: PlannedPoint;
}

/**
 * A section that can be built, as the place it starts and the run of pieces
 * it is made of: a stretch of road each, and a junction wherever a point
 * cuts something.
 *
 * Points in the same place are already merged.
 */
export interface BuildableSectionPlan {
  readonly buildable: true;
  readonly networkVersion: number;
  readonly start: PlannedPoint;
  readonly pieces: readonly [PlannedPiece, ...PlannedPiece[]];
}

/**
 * A section that cannot be built, as the chain it would have run through.
 *
 * The chain is kept because a refusal still has something to say: where the
 * section was going, in what shape, and which junctions it was going to
 * make. Nothing here is a promise — none of it will be built — so the
 * pieces carry no guarantee either, not even that there is one. A section
 * whose ends are the same place has none, and that is a refusal like any
 * other.
 */
export interface UnbuildableSectionPlan {
  readonly buildable: false;
  readonly networkVersion: number;
  readonly start: PlannedPoint;
  readonly pieces: readonly PlannedPiece[];
}

/** What adding a section would do to the network — or that it cannot. */
export type SectionPlan = BuildableSectionPlan | UnbuildableSectionPlan;

/**
 * Every point the plan runs through, start included and in order.
 */
export function pointsOf(plan: SectionPlan): PlannedPoint[] {
  return [plan.start, ...plan.pieces.map((piece) => piece.to)];
}

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
  centerlineGeometry: LineGeometry,
): SectionPlan {
  // Non-empty from the first line and never shrinks, so the chain always
  // has a last point to measure the next one against.
  const points: [PlannedPoint, ...PlannedPoint[]] = [
    plannedPointAt(network, from),
  ];
  let buildable = true;

  const begin = positionOf(network, from);
  const end = positionOf(network, to);

  if (
    centerlineGeometry.kind === "arc" &&
    !isArcValid(begin, end, centerlineGeometry.via)
  ) {
    return refusedAsStraight(network, from, to);
  }

  if (points[0].cuts.length > 0 && !landsCleanly(network, begin)) {
    // The plan starts on a section, but a junction is not possible there.
    buildable = false;
  }

  for (const crossing of crossingsAlong(
    network,
    from,
    to,
    centerlineGeometry,
  )) {
    if (!landsCleanly(network, crossing.point)) {
      buildable = false;
    }

    const reached = points[points.length - 1].at;
    const at = pickPoint(network, crossing.point, [reached, to]);
    append(network, points, plannedCrossing(network, crossing.section, at));
  }
  const finish = plannedPointAt(network, to);
  append(network, points, finish);
  if (finish.cuts.length > 0 && !landsCleanly(network, end)) {
    // plan ends on a section, but a junction is not possible there.
    buildable = false;
  }

  // One piece per gap in the chain: the first point is where the section
  // starts, and every one after it is a piece arriving there.
  //
  // A second walk, because neither a piece's shape nor its length can be
  // settled before the chain is whole. Both are read off where the points
  // landed rather than off the crossings that sent them there: merging may
  // have moved one, and the landed places are what the pieces get built
  // between.
  const [start, ...reached] = points;
  const pieces: PlannedPiece[] = [];
  let previous = positionOf(network, start.at);

  for (const arrival of reached) {
    const at = positionOf(network, arrival.at);

    const shape = subGeometry(centerlineGeometry, begin, end, previous, at);

    if (!isBuildableLength(lineLength(previous, at, shape))) {
      buildable = false;
    }

    pieces.push({ centerlineGeometry: shape, to: arrival });
    previous = at;
  }

  const networkVersion = network.version;
  const [firstPiece, ...restPieces] = pieces;
  if (firstPiece === undefined) {
    // Everything merged into one point: the section begins and ends in the
    // same place.
    return { buildable: false, networkVersion, start, pieces };
  }
  if (!buildable) {
    return { buildable: false, networkVersion, start, pieces };
  }

  return {
    buildable: true,
    networkVersion,
    start,
    pieces: [firstPiece, ...restPieces],
  };
}

/**
 * Builds a planned section: runs a piece of road between each pair of its
 * points, and cuts what the plan says to cut.
 *
 * The road goes in first. Cutting a section means joining it to a node, and
 * building is what makes the nodes — every place the road crosses something
 * is a point of its own chain, so by the time it is whole every junction
 * has a node standing at it.
 *
 * Returns the node at the far end, so a run of roads can carry on from it.
 * Decides nothing — a plan is buildable or it is not, and this one is.
 *
 * Throws if the network has changed since the plan was made, before
 * building anything: the plan answered for a network that is gone. That is
 * the caller's bug, not a refusal.
 */
export function applySectionPlan(
  network: RoadNetwork,
  plan: BuildableSectionPlan,
): NodeId {
  if (plan.networkVersion !== network.version) {
    throw new Error(
      `Plan made at network version ${plan.networkVersion}, applied at ${network.version}`,
    );
  }

  const [firstPiece, ...restPieces] = plan.pieces;

  // Where each crossed section is cut, gathered as the road is laid. A
  // section can be met more than once, and collecting its places rather
  // than cutting at each of them is what lets it be cut once, into a run,
  // instead of being split and split again.
  const cuts = new Map<SectionId, NodeId[]>();
  const gather = (point: PlannedPoint, node: NodeId): void => {
    for (const section of point.cuts) {
      cuts.set(section, [...(cuts.get(section) ?? []), node]);
    }
  };

  const first = network.addSection(
    plan.start.at,
    firstPiece.to.at,
    firstPiece.centerlineGeometry,
  );
  gather(plan.start, first.from);
  gather(firstPiece.to, first.to);

  let prevPoint = first.to;
  for (const piece of restPieces) {
    const built = network.addSection(
      prevPoint,
      piece.to.at,
      piece.centerlineGeometry,
    );
    gather(piece.to, built.to);
    prevPoint = built.to;
  }

  for (const [section, at] of cuts) {
    cutSection(network, section, at);
  }
  return prevPoint;
}

/**
 * Cuts a section at every one of the given nodes, leaving a run of pieces
 * where it was.
 *
 * The nodes are put in the order the section reaches them, so the pieces
 * follow it end to end and each runs in its own share of its shape. One
 * that is already an end of the section cuts nothing and drops out, which
 * is how a road meeting another where it already ends joins it instead.
 */
function cutSection(
  network: RoadNetwork,
  id: SectionId,
  at: readonly NodeId[],
): void {
  const section = network.getSection(id);
  const from = network.getNode(section.from).position;
  const to = network.getNode(section.to).position;

  const places = at
    .filter((node) => node !== section.from && node !== section.to)
    .map((node) => {
      const place = network.getNode(node).position;
      return {
        node,
        place,
        along: fractionAlong(section.centerlineGeometry, from, to, place),
      };
    })
    .sort((left, right) => left.along - right.along);

  if (places.length === 0) {
    return;
  }

  // Every piece goes in before the original comes out: the network discards
  // a node the moment its last section leaves, so removing first would take
  // the section's own endpoints with it.
  let previousNode = section.from;
  let previousPlace = from;
  for (const { node, place } of places) {
    network.addSection(
      previousNode,
      node,
      subGeometry(section.centerlineGeometry, from, to, previousPlace, place),
    );
    previousNode = node;
    previousPlace = place;
  }
  network.addSection(
    previousNode,
    section.to,
    subGeometry(section.centerlineGeometry, from, to, previousPlace, to),
  );
  network.removeSection(id);
}

/**
 * Where along a section's own shape a place falls, 0 at `begin` and 1 at
 * `end` — measured round the curve of an arc, so the order it puts places
 * in is the order the road reaches them.
 */
function fractionAlong(
  centerlineGeometry: LineGeometry,
  begin: Vec2,
  end: Vec2,
  place: Vec2,
): number {
  return centerlineGeometry.kind === "arc"
    ? arcFractionAt(begin, end, centerlineGeometry.via, place)
    : segmentFractionAt(place, begin, end);
}

/**
 * The shape a part of a section runs in: `centerlineGeometry` spans `begin` to
 * `end`, and the answer covers the stretch of it between `from` and `to`.
 *
 * A straight is the same straight however it is divided. An arc leaves an
 * arc, fixed by the position halfway along that stretch — halfway being the
 * one place on an arc that is neither of its ends whatever the sweep.
 *
 * The stretch is bounded by wherever its ends actually landed, which for a
 * point merged onto a neighbor is a little off the curve. That is the
 * point: those places are what the part gets built between, so they are
 * what its shape has to answer to, and it leaves the part a hair off the
 * circle it came from as `docs/intersections.md` describes.
 */
function subGeometry(
  centerlineGeometry: LineGeometry,
  begin: Vec2,
  end: Vec2,
  from: Vec2,
  to: Vec2,
): LineGeometry {
  if (centerlineGeometry.kind !== "arc") {
    return STRAIGHT;
  }

  const { via } = centerlineGeometry;
  const middle =
    (arcFractionAt(begin, end, via, from) +
      arcFractionAt(begin, end, via, to)) /
    2;
  return { kind: "arc", via: pointOnArc(begin, end, via, middle) };
}

/**
 * Just a refused plan with the two ends connected by a straight.
 */
function refusedAsStraight(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
): UnbuildableSectionPlan {
  const start = plannedPointAt(network, from);
  const pieces: PlannedPiece[] = isSamePoint(
    positionOf(network, from),
    positionOf(network, to),
  )
    ? []
    : [{ centerlineGeometry: STRAIGHT, to: plannedPointAt(network, to) }];
  return { buildable: false, networkVersion: network.version, start, pieces };
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
  const end = endAt(network, network.getSection(section), place);
  return end === null ? { at, cuts: [section] } : { at: end, cuts: [] };
}

/**
 * Plans a point for the plan to run through. An existing node, a new node on
 * open ground, or a crossing if on a section.
 */
function plannedPointAt(network: RoadNetwork, place: Endpoint): PlannedPoint {
  if (isNodeId(place)) {
    return { at: place, cuts: [] };
  }

  const road = nearestSection(network, place, SAME_POINT_METERS);
  return road === null
    ? { at: place, cuts: [] }
    : plannedCrossing(network, road.id, place);
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
 *
 * Each of them once, though. A road grazed rather than crossed is met
 * twice in the same place, and that is one junction on it with one cut to
 * make — asking for it twice would ask for a piece of it running from the
 * junction back to itself.
 */
function append(
  network: RoadNetwork,
  points: [PlannedPoint, ...PlannedPoint[]],
  point: PlannedPoint,
): void {
  const last = points[points.length - 1];
  if (
    !isSamePoint(positionOf(network, point.at), positionOf(network, last.at))
  ) {
    points.push(point);
    return;
  }

  points[points.length - 1] = {
    // A node the network already has says the place better than a position
    // does, since building at the position would leave a second node beside
    // it. Where neither is a node the two are the same position anyway.
    at: isNodeId(last.at) ? last.at : point.at,
    cuts: union(last.cuts, point.cuts),
  };
}

/**
 * The two lists as one, in the order they came and with nothing twice.
 */
function union<T>(first: readonly T[], second: readonly T[]): T[] {
  return [...first, ...second.filter((item) => !first.includes(item))];
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
  if (isSamePoint(place, network.getNode(section.from).position)) {
    return section.from;
  }
  if (isSamePoint(place, network.getNode(section.to).position)) {
    return section.to;
  }
  return null;
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

/** Whether a piece is long enough to be a road. */
function isBuildableLength(length: number): boolean {
  return length >= MIN_SECTION_LENGTH_METERS;
}
