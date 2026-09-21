import type { LineGeometry } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { NodeId, SectionId } from "../network/types";

/**
 * The ground a part that different items of the layout cover.
 */

/**
 * One piece of a junction's outline: a point on it, and how the outline
 * arrives there from the point before.
 *
 * A piece carries no start of its own. The ring is closed, so the first piece
 * starts where the last one ends.
 */
export interface OutlinePiece {
  readonly point: Vec2;
  readonly incomingGeometry: LineGeometry;
}

/**
 * The ground a junction covers: a closed ring around the node it sits at.
 *
 * `center` is inside the shape by construction — every piece of the ring is
 * reached from the node — so a reader filling the area can fan from it
 * without asking the network where the node is.
 */
export interface JunctionOutline {
  readonly kind: "junction";
  readonly node: NodeId;
  readonly center: Vec2;
  readonly pieces: readonly OutlinePiece[];
}

/**
 * The ground a roadway covers: a band `widthMeters` wide along its
 * centerline, ending square to the road at each end.
 *
 * The centerline and the width fix the edges between them, so the edges are
 * not named beside them — one curve written down twice could disagree with
 * itself.
 */
export interface RoadwayOutline {
  readonly kind: "roadway";
  readonly section: SectionId;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly centerlineGeometry: LineGeometry;
  readonly widthMeters: number;
}

/** The ground any one part of the layout covers. */
export type Outline = JunctionOutline | RoadwayOutline;
