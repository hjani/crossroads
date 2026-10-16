import type { Vec2 } from "../core/geometry/point";
import type { Turns } from "../core/lanes/turnArrows";
import { TURN_ARROW_LENGTH_METERS } from "../core/layout/markings";

/**
 * Turn arrow shapes (`docs/road-markings.md`, Turn arrows, Shape), in the
 * arrow's own frame, in meters: the tip at the origin, `x` forward, `z` to
 * the right. Plain points, no Three.js, so a documentation picture can draw
 * the same outlines.
 */

/** Polygons that may overlap: the arrow is everything they cover. */
export type ArrowShape = readonly (readonly Vec2[])[];

/**
 * How wide the shaft is at the tail, and at its top: where the straight head
 * or a turn's curve starts. A curve is as wide as the shaft's top.
 */
const SHAFT_TAIL_WIDTH_METERS = 0.24;
const SHAFT_TOP_WIDTH_METERS = 0.14;

/**
 * The straight head: base to tip, and across its base. A turn head is the
 * same turned 90°: its base along the road.
 */
const HEAD_LENGTH_METERS = 1;
const HEAD_WIDTH_METERS = 0.5;

/**
 * How far back from the tip a branch leaves the shaft: from the tip, so the
 * arrow's length changes only its shaft below.
 */
const BRANCH_START_METERS = 2;
/** How far off the shaft a branch heads as it leaves it, in radians. */
const BRANCH_START_ANGLE = Math.PI / 6;
/** The radius a branch curves on, along its middle. */
const BRANCH_RADIUS_METERS = 0.55;
/** A branch's head, as a share of a turn head. */
const BRANCH_HEAD_SCALE = 0.7;

/** The radius the shaft's end curves on into a turn head, with no straight. */
const TURN_RADIUS_METERS = 0.45;

/** How far a turn head's base reaches back over its curve: no seam shows. */
const HEAD_OVERLAP_METERS = 0.02;
/** Straight pieces a curve is drawn with. */
const CURVE_SEGMENTS = 12;

/**
 * The shape showing `turns`, which are never all false:
 *
 * - straight among them: the straight arrow, and a branch per turn
 * - turns only: a shaft whose end curves into a turn head per turn
 * - left: right mirrored
 */
export function arrowShape(turns: Turns): ArrowShape {
  const sides = [...(turns.right ? [1] : []), ...(turns.left ? [-1] : [])];
  if (turns.straight) {
    return [
      straightOutline(),
      ...sides.flatMap((side) => mirrored(side, rightBranch())),
    ];
  }
  return [
    turnShaftOutline(),
    ...sides.flatMap((side) => mirrored(side, rightTurnEnd())),
  ];
}

/** A shaft from the tail, narrowing up to the straight head on its end. */
function straightOutline(): Vec2[] {
  const tail = -TURN_ARROW_LENGTH_METERS;
  const base = -HEAD_LENGTH_METERS;
  const shaftTail = SHAFT_TAIL_WIDTH_METERS / 2;
  const shaftTop = SHAFT_TOP_WIDTH_METERS / 2;
  const head = HEAD_WIDTH_METERS / 2;
  return [
    { x: tail, z: -shaftTail },
    { x: base, z: -shaftTop },
    { x: base, z: -head },
    { x: 0, z: 0 },
    { x: base, z: head },
    { x: base, z: shaftTop },
    { x: tail, z: shaftTail },
  ];
}

/**
 * A shaft from the tail, narrowing up to where its end curves: a turn's
 * curve ends square under a turn head's middle, whose front corner is on the
 * tip's line (`rightTurnEnd`).
 */
function turnShaftOutline(): Vec2[] {
  const tail = -TURN_ARROW_LENGTH_METERS;
  const top = -HEAD_LENGTH_METERS / 2 - TURN_RADIUS_METERS;
  const shaftTail = SHAFT_TAIL_WIDTH_METERS / 2;
  const shaftTop = SHAFT_TOP_WIDTH_METERS / 2;
  return [
    { x: tail, z: -shaftTail },
    { x: top, z: -shaftTop },
    { x: top, z: shaftTop },
    { x: tail, z: shaftTail },
  ];
}

/**
 * A branch to the right: leaving the shaft `BRANCH_START_METERS` back from
 * the tip, already `BRANCH_START_ANGLE` off it, curving until it points right,
 * into a turn head `BRANCH_HEAD_SCALE` its size.
 */
function rightBranch(): Vec2[][] {
  const start = { x: -BRANCH_START_METERS, z: 0 };
  const { band, end } = curve(start, BRANCH_START_ANGLE, BRANCH_RADIUS_METERS);
  return [band, turnHead(end, BRANCH_HEAD_SCALE)];
}

/**
 * The shaft's end curving right: a quarter turn, up from the shaft's top
 * (`turnShaftOutline`), into a full turn head.
 */
function rightTurnEnd(): Vec2[][] {
  const start = { x: -HEAD_LENGTH_METERS / 2 - TURN_RADIUS_METERS, z: 0 };
  const { band, end } = curve(start, 0, TURN_RADIUS_METERS);
  return [band, turnHead(end, 1)];
}

/**
 * A band `SHAFT_TOP_WIDTH_METERS` wide along an arc turning right, from
 * `start` heading `β₀` off `x` until it heads along `z`; `end`: where its
 * middle ends.
 *
 * Heading `β` off `x` toward `z`: `(cos β, sin β)`, its right
 * `(−sin β, cos β)`; `r` the radius.
 *
 * - turning right → the center is to the right of the start:
 *
 *       C = start + r·(−sin β₀, cos β₀)
 *
 * - the point heading `β`, at `ρ` from the center, is to the left of it:
 *
 *       C + ρ·(sin β, −cos β)
 *
 * - the band's edges: `ρ = r ± w/2`; its middle ends at `β = 90°`:
 *
 *       end = (C.x + r, C.z)
 */
function curve(
  start: Vec2,
  startAngle: number,
  r: number,
): { band: Vec2[]; end: Vec2 } {
  const C = {
    x: start.x - r * Math.sin(startAngle),
    z: start.z + r * Math.cos(startAngle),
  };
  // `distance` is `ρ`, `angle` is `β`.
  const edge = (distance: number): Vec2[] =>
    Array.from({ length: CURVE_SEGMENTS + 1 }, (_, i) => {
      const angle =
        startAngle + ((Math.PI / 2 - startAngle) * i) / CURVE_SEGMENTS;
      return {
        x: C.x + distance * Math.sin(angle),
        z: C.z - distance * Math.cos(angle),
      };
    });
  const halfWidth = SHAFT_TOP_WIDTH_METERS / 2;
  return {
    band: [...edge(r + halfWidth), ...edge(r - halfWidth).reverse()],
    end: { x: C.x + r, z: C.z },
  };
}

/**
 * A turn head pointing right, `scale` the size of a full one: its base along
 * the road, centered on `end`, reaching back over the curve.
 */
function turnHead(end: Vec2, scale: number): Vec2[] {
  const halfBase = (scale * HEAD_LENGTH_METERS) / 2;
  const base = end.z - HEAD_OVERLAP_METERS;
  return [
    { x: end.x - halfBase, z: base },
    { x: end.x, z: base + scale * HEAD_WIDTH_METERS },
    { x: end.x + halfBase, z: base },
  ];
}

/** `polygons` as they are on the right (`side` 1), mirrored on the left (−1). */
function mirrored(side: number, polygons: Vec2[][]): Vec2[][] {
  return polygons.map((polygon) =>
    polygon.map(({ x, z }) => ({ x, z: side * z })),
  );
}
