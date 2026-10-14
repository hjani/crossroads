import type { TurnKind } from "./connection";

/**
 * Which lanes connect, worked out on numbers alone: no geometry, no ids. A
 * lane is its number `i`, counted from 1 out from the centerline (the `i` of
 * lane `(section, ±i)`); a road is its count of lanes. See `docs/lanes.md`,
 * Which lanes connect.
 */

/** Lane `incoming` of the road in connects to lane `outgoing` of the road out. */
export type LanePair = readonly [incoming: number, outgoing: number];

/**
 * A turn from road A to road B at a junction: which way, and how many lanes
 * the B has.
 */
export interface Turn {
  /** Never a U-turn: a junction has none. */
  readonly kind: TurnKind;
  readonly lanes: number;
}

/**
 * Lanes `1…m` in to lanes `1…n` out, the side with more lanes spread evenly
 * over the other, in order: each of its lanes in exactly one pair. In the
 * wider side's lane order.
 *
 * `M = max(m, n)`, `m' = min(m, n)`; lane `k + 1` of the wider side,
 * `k = 0…M − 1`, pairs with lane `j + 1` of the narrower:
 *
 * - each side spans the road as `[0, 1]`: wider lanes `1/M` across,
 *   narrower lanes `1/m'`
 * - the middle of wider lane `k + 1`: `(k + ½) / M`
 * - it lies in narrower lane `j + 1` for `j = ⌊(k + ½) / M · m'⌋`;
 *   times `2/2`, integers only:
 *
 *       j = ⌊(2k + 1)·m' / 2M⌋
 *
 * - exact: a whole quotient comes out whole, any other is at least `1/2M`
 *   off one
 * - a middle on a border (`2M` divides `(2k + 1)·m'`) lands on the higher
 *   lane → toward the curb: 3 into 2 → `1→1, 2→2, 3→2`
 * - `m = n` → `j = ⌊k + ½⌋ = k`: lane for lane
 * - `2k + 1 < 2M` → `j < m'`: always a lane
 * - `j` never falls as `k` grows → no two pairs cross
 */
export function spreadPairs(m: number, n: number): LanePair[] {
  const wide = Math.max(m, n);
  const narrow = Math.min(m, n);
  const pairs: LanePair[] = [];
  for (let k = 0; k < wide; k++) {
    const j = Math.floor(((2 * k + 1) * narrow) / (2 * wide));
    pairs.push(m >= n ? [k + 1, j + 1] : [j + 1, k + 1]);
  }
  return pairs;
}

/**
 * At a junction, the lane pairs of each turn road A can make, A having `n`
 * lanes in: one list per turn, in the order of `turns`. See `docs/lanes.md`,
 * Junction.
 *
 * - group: A's turns of one kind — left, straight or right
 * - `g`: its size, `min(n, lanes of its widest road)`
 * - `s`: how many of A's lanes lie left of its window (`windowStart`) → the
 *   window is A's lanes `s + 1…s + g`
 * - a turn into road B, `n_B` lanes:
 *   - `g ≤ n_B` → `spreadPairs(g, n_B)`, A's lanes moved up by `s`
 *   - `g > n_B` → `n_B` window lanes, one to one, on the turn side: the
 *     first `n_B` turning left, the last `n_B` turning right
 *   - never straight on: the only turn in its group → `g ≤ n_B`
 * - a lane of A in no window → no dead lane (`fillDeadLanes`)
 */
export function junctionPairs(n: number, turns: readonly Turn[]): LanePair[][] {
  const widest = new Map<TurnKind, number>();
  for (const { kind, lanes } of turns) {
    widest.set(kind, Math.max(widest.get(kind) ?? 0, lanes));
  }

  const pairs = turns.map(({ kind, lanes }) => {
    const g = Math.min(n, widest.get(kind) ?? lanes);
    const s = windowStart(kind, g, n, widest);
    if (g <= lanes) {
      return spreadPairs(g, lanes).map(([i, j]): LanePair => [s + i, j]);
    }
    const first = kind === "right" ? s + g - lanes : s;
    return Array.from({ length: lanes }, (_, j): LanePair => [
      first + j + 1,
      j + 1,
    ]);
  });
  return fillDeadLanes(n, pairs);
}

/**
 * `pairs`, one list per turn, with every lane of A, `1…n`, in at least one:
 * a lane in none takes the pairs of its nearest lane in some, a tie toward
 * the curb (the higher number). Each list in lane order.
 */
function fillDeadLanes(n: number, pairs: readonly LanePair[][]): LanePair[][] {
  const used = new Set(pairs.flat().map(([i]) => i));
  const nearestUsed = (i: number): number => {
    for (let d = 1; d < n; d++) {
      if (used.has(i + d)) {
        return i + d;
      }
      if (used.has(i - d)) {
        return i - d;
      }
    }
    throw new Error("A junction where road A makes no turn");
  };

  return pairs.map((list) => {
    const filled = [...list];
    for (let i = 1; i <= n; i++) {
      if (used.has(i)) {
        continue;
      }
      const donor = nearestUsed(i);
      for (const [from, to] of list) {
        if (from === donor) {
          filled.push([i, to]);
        }
      }
    }
    return filled.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  });
}

/**
 * `s`: how many of A's `n` lanes lie left of a group's window, the window
 * `g` lanes wide; `groups` holds every kind of turn A makes.
 *
 * - left → `0`: the leftmost lanes
 * - right → `n − g`: the rightmost
 * - straight → `0` with no left group, `n − g` with no right group, else
 *   the middle, a tie toward the curb:
 *
 *       s = ⌈(n − g) / 2⌉
 */
function windowStart(
  kind: TurnKind,
  g: number,
  n: number,
  groups: ReadonlyMap<TurnKind, unknown>,
): number {
  switch (kind) {
    case "left":
      return 0;
    case "right":
      return n - g;
    case "straight":
      if (!groups.has("left")) {
        return 0;
      }
      if (!groups.has("right")) {
        return n - g;
      }
      return Math.ceil((n - g) / 2);
    case "uTurn":
      throw new Error("A junction has no U-turns");
  }
}
