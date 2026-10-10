import { isSamePoint, SAME_POINT_METERS, type Vec2 } from "../geometry/point";
import {
  crossingsAlong,
  nearestSection,
  nodeWithin,
  positionOf,
} from "./queries";
import { isNodeId, type Endpoint, type RoadNetwork } from "./RoadNetwork";
import {
  isLineGeometryValid,
  lineFractionAt,
  STRAIGHT,
  subLineGeometry,
  type LineGeometry,
} from "../geometry/lineGeometry";
import {
  type NodeId,
  type RoadProfile,
  type Section,
  type SectionId,
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
  /** The planned road's profile, the same for every piece. */
  readonly profile: RoadProfile;
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
  /** The planned road's profile, the same for every piece. */
  readonly profile: RoadProfile;
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
 * Unbuildable where there is no section to build: an arc with no circle, or
 * ends in the same place. With nothing crossed, the single piece is the
 * whole section.
 */
export function planSection(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
  centerlineGeometry: LineGeometry,
  profile: RoadProfile,
): SectionPlan {
  // Non-empty from the first line and never shrinks, so the chain always
  // has a last point to measure the next one against.
  const points: [PlannedPoint, ...PlannedPoint[]] = [
    plannedPointAt(network, from),
  ];

  const begin = positionOf(network, from);
  const end = positionOf(network, to);

  if (!isLineGeometryValid(begin, end, centerlineGeometry)) {
    return refusedAsStraight(network, from, to, profile);
  }

  for (const crossing of crossingsAlong(
    network,
    from,
    to,
    centerlineGeometry,
  )) {
    const reached = points[points.length - 1].at;
    const at = pickPoint(network, crossing.point, [reached, to]);
    append(network, points, plannedCrossing(network, crossing.section, at));
  }
  append(network, points, plannedPointAt(network, to));

  // One piece per gap in the chain: the first point is where the section
  // starts, and every one after it is a piece arriving there.
  //
  // A second walk, because a piece's shape can't be settled before the
  // chain is whole. It is read off where the points landed rather than off
  // the crossings that sent them there: merging may have moved one, and the
  // landed places are what the pieces get built between.
  const [start, ...reached] = points;
  const pieces: PlannedPiece[] = [];
  let previous = positionOf(network, start.at);

  for (const arrival of reached) {
    const at = positionOf(network, arrival.at);
    const shape = subLineGeometry(begin, end, centerlineGeometry, previous, at);
    pieces.push({ centerlineGeometry: shape, to: arrival });
    previous = at;
  }

  const networkVersion = network.version;
  const [firstPiece, ...restPieces] = pieces;
  if (firstPiece === undefined) {
    // Everything merged into one point: the section begins and ends in the
    // same place.
    return { buildable: false, networkVersion, start, pieces, profile };
  }

  return {
    buildable: true,
    networkVersion,
    start,
    pieces: [firstPiece, ...restPieces],
    profile,
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
 * Returns the sections built for the road, start to end — the last one's
 * `to` is where a run of roads carries on. Cutting leaves them standing: it
 * only cuts sections the network had before.
 * Decides nothing — a plan is buildable or it is not, and this one is.
 *
 * Throws if the network has changed since the plan was made, before
 * building anything: the plan answered for a network that is gone. That is
 * the caller's bug, not a refusal.
 */
export function applySectionPlan(
  network: RoadNetwork,
  plan: BuildableSectionPlan,
): readonly [Section, ...Section[]] {
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
    plan.profile,
  );
  gather(plan.start, first.from);
  gather(firstPiece.to, first.to);

  const built: [Section, ...Section[]] = [first];
  for (const piece of restPieces) {
    const section = network.addSection(
      built[built.length - 1].to,
      piece.to.at,
      piece.centerlineGeometry,
      plan.profile,
    );
    gather(piece.to, section.to);
    built.push(section);
  }

  for (const [section, at] of cuts) {
    cutSection(network, section, at);
  }
  return built;
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
  const geometry = section.centerlineGeometry;

  const places = at
    .filter((node) => node !== section.from && node !== section.to)
    .map((node) => {
      const place = network.getNode(node).position;
      return {
        node,
        place,
        along: lineFractionAt(from, to, geometry, place),
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
      subLineGeometry(from, to, geometry, previousPlace, place),
      section.profile,
    );
    previousNode = node;
    previousPlace = place;
  }
  network.addSection(
    previousNode,
    section.to,
    subLineGeometry(from, to, geometry, previousPlace, to),
    section.profile,
  );
  network.removeSection(id);
}

/**
 * Just a refused plan with the two ends connected by a straight.
 */
function refusedAsStraight(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
  profile: RoadProfile,
): UnbuildableSectionPlan {
  const start = plannedPointAt(network, from);
  const pieces: PlannedPiece[] = isSamePoint(
    positionOf(network, from),
    positionOf(network, to),
  )
    ? []
    : [{ centerlineGeometry: STRAIGHT, to: plannedPointAt(network, to) }];
  return {
    buildable: false,
    networkVersion: network.version,
    start,
    pieces,
    profile,
  };
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
