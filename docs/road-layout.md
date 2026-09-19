# Road Layout

## Scope

- The network as it lies on the ground: a junction at every node, a roadway
  along every section.
- Derived from `RoadNetwork`, never stored.
  - `RoadNetwork`: what connects to what. Layout: how it lies on the ground.
- Pure geometry, not a drawing → the renderer (`docs/road-surface.md`) is one
  reader of it, not its owner.
- The geometry (gaps, setbacks, `P`, `T`, the walk around a node) is worked
  out in `docs/ideas/junction-polygon.md` and not repeated here.
- Out of scope: refusing edits. The layout describes any network it is given,
  however badly it fits.

## Junction

- One per node, every node: a dead end and a 180° join too.
  - → a reader never special-cases a node by how many sections meet it.
- Worked out from that node and the sections meeting it alone.
- The setback of each section meeting it: how far from the node its roadway
  ends, measured along the centerline.
  - Each gap under 180° sets its two roads back, to end square through `P`.
    A road set back from both sides takes the longer setback.
  - At most half the section's length.
    - → a section's two setbacks never overlap, and each junction still
      needs only its own node.
    - Bites as a gap → 0, where the setback grows without limit.
  - A gap whose edges don't cross ahead of the node sets nothing back.
  - Where the network can't be drawn right (cut to half, or nothing set
    back), an error is logged, with the reason.
  - Asked for a section not meeting the node → error.
- The area it covers, walked around the node gap by gap:
  - gap under 180° → reaches `P`
  - gap of 180° or over → a round join, along the circle of radius `w/2`
    around the node
  - a dead end is one gap of 360° → a round cap
- A round join stays a true arc, never broken into pieces.
  - Same rule as picking a section against its circle, not its chords.
- As a gap → 180°, its setbacks and the part of the junction in it →
  nothing → moving a road a little never makes the junction jump.

## Roadway

- One per section: the section between the setbacks at its two ends.
- A shorter section of the same kind:
  - straight → the straight between the setbacks
  - arc → the same circle, between the setbacks
- Ends square to the road, whether that end is set back or not.
- Junctions and roadways cover the road with no overlap and no gap. A
  roadway's end is the border between the two.
- Never shorter than zero: both setbacks clamped → a roadway of zero length,
  halfway along the section. Not an error.

## Derivation

- Each part (a setback, a junction, a roadway) is worked out from the network
  and from parts before it, never from one after it:
  - setbacks at a node ← the sections meeting it
  - junction ← the setbacks at its node
  - roadway ← the setbacks at its two ends
- Each is a pure function of its inputs, usable without a cache.
  - → the edit planner can ask about a network that isn't built yet.
- A setback is fixed by (node, section): a section joins two distinct nodes,
  so it meets a node at most once.

## `RoadLayout`

- One object answers for the whole layout: the junction at a node, the
  roadway along a section.
- Nothing is worked out ahead: a part is computed the first time it is asked
  for, then kept.
  - → a reader pays only for what it reads.
- Everything is dropped when the network's version changes.
  - Coarse, like the version counter itself.
  - Checked on every question → nothing to notify, nothing to subscribe to.
- A junction or roadway is a snapshot of the version it was read at, and says
  so about nothing: one kept past an edit answers as it did before, unwarned.
  - → read a part again after an edit rather than storing it.
- Junctions and roadways share the one cache: a roadway reads junctions, and
  both must come from the same version.

## Relationship to other modules

- In `src/core/layout/`, outside `RoadNetwork`: uses only its public API.
  - The model stores; width and junction rules stay out of it.
- `src/render/` draws it (`docs/road-surface.md`).
- Edits are still planned as if roads had no width (`docs/intersections.md`).
