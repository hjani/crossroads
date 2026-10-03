/** Dash + gap along the centerline, in meters. See `docs/road-markings.md`. */
export const DASH_PERIOD_METERS = 4.5;
/** Bar + gap across a crossing, in meters. */
export const BAR_PERIOD_METERS = 1;

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
