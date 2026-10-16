/** Dash + gap along the centerline, in meters. See `docs/road-markings.md`. */
export const DASH_PERIOD_METERS = 4.5;
/** Bar + gap across a crossing, in meters. */
export const BAR_PERIOD_METERS = 1;
/**
 * How far a turn arrow's tip stays back from its section's crossing ahead,
 * in meters: `g`.
 */
export const TURN_ARROW_GAP_METERS = 1;
/** A turn arrow's length, tail to tip, in meters: `A`. */
export const TURN_ARROW_LENGTH_METERS = 3;

/**
 * The period a pattern is stretched to, so a whole number of them fits its
 * length exactly — or null when it is too short for one.
 *
 * `L = lengthMeters`, `P = periodMeters`:
 *
 * - the nearest whole number of periods, stretched or squeezed to fill `L`:
 *
 *       n  = round(L / P)
 *       P' = L / n
 *
 * - `L / P' = n` → the pattern ends on a period boundary at both ends; a
 *   mark is centered in its period → half a gap at each end
 * - `n ≤ 0` → null: `L < P/2`, and the negative lengths of a refused plan
 */
export function fittedPeriodOf(
  lengthMeters: number,
  periodMeters: number,
): number | null {
  const n = Math.round(lengthMeters / periodMeters);
  return n > 0 ? lengthMeters / n : null;
}
