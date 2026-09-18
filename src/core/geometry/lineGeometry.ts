import type { Vec2 } from "./point";

/**
 * The shapes a line on the ground can take.
 */

/** How a line runs between two positions. */
export type LineGeometry = StraightGeometry | ArcGeometry;

export interface StraightGeometry {
  readonly kind: "straight";
}

/**
 * The straight shape, which has nothing to vary and so needs only one of
 * it. Saying `STRAIGHT` rather than writing the shape out also leaves the
 * places that assume straightness searchable for the day they stop.
 */
export const STRAIGHT: StraightGeometry = { kind: "straight" };

/**
 * A circular arc, fixed by a position it passes through between its ends.
 *
 * Three positions that are not in a line lie on one circle, so `via` settles
 * the radius, which way the line bends, and whether it takes the short or
 * the long way round — the far side of the circle is just a `via` on the far
 * side of the chord. The circle is derived from the three and never stored,
 * so a moving end leaves nothing out of step.
 *
 * The ends already fix all but one degree of freedom, so a position is more
 * than an arc needs: several `via`s describe the same arc. Comparing shapes
 * means comparing the circles they work out to, not the stored positions.
 *
 * Symmetric — the arc from A to B through V is the arc from B to A through V.
 */
export interface ArcGeometry {
  readonly kind: "arc";
  readonly via: Vec2;
}
