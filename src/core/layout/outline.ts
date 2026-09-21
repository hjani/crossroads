import type { LineGeometry } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import type { NodeId } from "../network/types";

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
