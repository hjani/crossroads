import type { Vec2 } from "./point";

/**
 * Where two stretches of road meet, whatever shape either of them is. Its own
 * file so that straights and arcs both answer in it without either module
 * depending on the other.
 */

/** Where two stretches of road meet, and how far along each of them that is. */
export interface Crossing {
  readonly point: Vec2;
  /** 0 at the first stretch's start, 1 at its end. */
  readonly alongA: number;
  readonly alongB: number;
}

/**
 * The same crossing, told from the other stretch's point of view.
 *
 * Which of the two is `alongA` is the caller's question, not the geometry's:
 * a meeting between a straight and a bend is one piece of math whichever of
 * them is the one being planned.
 */
export function fromTheOtherSide(crossing: Crossing): Crossing {
  return {
    point: crossing.point,
    alongA: crossing.alongB,
    alongB: crossing.alongA,
  };
}
