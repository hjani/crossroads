/** Dash + gap along the centerline, in meters. See `docs/road-markings.md`. */
export const DASH_PERIOD_METERS = 2;

/**
 * The period a roadway's dashes are stretched to, so a whole number of them
 * fits its length exactly — or null when it is too short for one.
 *
 * `L = lengthMeters`, `P = DASH_PERIOD_METERS`:
 *
 * - the nearest whole number of periods, stretched or squeezed to fill `L`:
 *
 *       n  = round(L / P)
 *       P' = L / n
 *
 * - `L / P' = n` → the pattern ends on a period boundary at both ends; a
 *   dash is the middle half of a period → half a gap at each end
 * - `n ≤ 0` → null: `L < P/2`, and the negative lengths of a refused plan
 */
export function dashPeriodOf(lengthMeters: number): number | null {
  const n = Math.round(lengthMeters / DASH_PERIOD_METERS);
  return n > 0 ? lengthMeters / n : null;
}
