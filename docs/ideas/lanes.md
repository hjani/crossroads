# Lanes — brainstorming notes

Not a design note: options explored and where the discussion leaned, kept
so the reasoning does not have to be found again. Nothing here is built.

## Two graphs

- Network → used for routing: which sections lead where.
- Lane graph, read from the layout → used for driving: lanes along roadways,
  connections across junctions.
- Routing on the network alone can find a route the lanes can't drive (a
  banned turn, no connection).
  - → route over sections plus the turns each junction allows, read from
    its connections.
  - Not needed while every section into a node connects to every section
    out of it → routing on the network alone, until a turn can be missing.

## Lanes

- One per lane each way in the section's profile, along its roadway.
- Centerline: the section's, offset → a `LineGeometry`.
  - straight → straight, arc `R` → concentric arc `R ± d`
- Width `v`: one global, the inner lane width the lane marks use.
  - One source, in core; the shader reads it from there.
- Lane `i` at `±(i − ½)·v` from the centerline, counted outward.
  - What's left at the curb, `w/2 − n·v`, is not a lane: room for parking,
    trees, a sidewalk.
  - Profiles are presets, not freely configured → each fits its lanes,
    `w ≥ 2·n·v`, by construction; nothing checks it at run time.
- Runs to the roadway's end, as the roadway does.
  - Stop line: a distance along the lane, not its end.
  - Considered: the lane ending at the stop line, its connection running
    over the crossing. Dropped:
    - the lane would no longer be just its roadway, offset
    - where cars stop depends on rules (yield, lights), not only on
      geometry; a 180° join has no crossing
- A position on any path: `s` from its start, as the markings measure →
  a car is at (path, `s`).

## Connections

- From a lane running into a node to a lane running out of it, across the
  junction.
- At most one per pair of lanes.
- Merge: two or more connections into one lane. Split: two or more out of
  one. No kind of their own.
  - Profile is per section → lane count changes only at nodes → 2 lanes
    to 1 at a 180° join is a merge.
- Dead end: U-turn connections → a junction is still never a special case.
- Matches position and heading at both ends → one straight or arc rarely
  can; a biarc or a Bézier.
- Width `v`, as its lanes.
  - Lane widths ever differing → from its exit lane's to its entry lane's,
    along it.

## Conflicts

- Two paths needing the same ground → a car reserves the conflict before
  entering it.
  - → deadlock avoidance needed then.
- Between stretches, not whole paths: (A, `[a₁, a₂]`) × (B, `[b₁, b₂]`).
  - Left turn against straight traffic: the straight traffic goes on once
    the turning car has left its stretch, still turning.
- Stretch of A: where A comes within `(w_a + w_b)/2` of B's centerline.
  - Crossing at θ → about `(w_a + w_b) / (2 sin θ)` long.
  - Merge, θ → 0 → reaches back to where the two meet → crossing and merge
    are one rule.
- Paths: lanes, connections, later crosswalks.
  - → a zebra crossing becomes a conflict on the lane's stretch under it,
    with no change to the lane.
- Not in a first step: no cars yet.

## Identity and edits

- Lane: `(section, ±i)`. `+` runs `from → to`, `−` runs `to → from`,
  `i = 1` next to the centerline.
  - Right-hand traffic → `+` lanes lie right of `from → to`.
    - Left-hand would only mirror that sign; not wanted.
  - Fully derived from the section → nothing stored.
- Connection: `(A, ±i) × (B, ±j)`.
  - Node implied: the one A's lane runs into.
  - Valid only if A's lane runs in and B's runs out → a wrong sign is a
    bug, not another meaning.
  - U-turn: `(A, +1) × (A, −1)`.
- A cut gives a section new ids → whatever is stored against lanes (a
  configuration, a car's position) must follow.
  - A change description, emitted when an edit is applied: what was
    removed, what added ("5 became 7 and 8").
  - Also what the renderer needs to rebuild only what changed.
  - An applied plan already knows it (`removedSections`).

## Configuration

- Lane arrows, banned turns: chosen by the player → stored, not derived →
  not in the layout.
- In the network (a cut carries it, as it does the profile), or in a store
  of its own that follows the change description.
  - Leaning: a store of its own.

## Left open

- Connection shape: biarc or Bézier.
- The rule for the default connections: which lanes turn where.
- Deadlock avoidance.
