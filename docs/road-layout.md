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
  - Each gap sets its two roads back as its join says (below). A road set
    back from both sides takes the longer setback.
  - Not limited by the section's length → a junction needs only its own
    node, not the sections' lengths.
    - As a gap → 0, the setback grows without limit.
  - No setback because of an error → error is logged, with the
    reason.
  - Asked for a section not meeting the node → error.
- Roads of different widths may meet; each keeps its own width up to its
  roadway's end.
- The area it covers, walked around the node gap by gap. Each gap is joined
  one of two ways:
  - corner: the two curbs on the gap's side cross ahead of the node on both
    roads, at `P` → both roads end square through `P`
  - round, where they don't: along the circle around the node, its radius
    the wider road's `w/2`
    - the wider road's curb touches the circle → not set back
    - the narrower road's curb crosses it at `X` → ends square through `X`
    - equal widths → `X` is where that curb touches too → nothing set back
  - equal widths → round from 180°; different widths → already under
    180°, the more so the more the widths differ
  - a dead end is one gap of 360° → a round cap
- A round join stays a true arc, never broken into pieces.
  - Same rule as picking a section against its circle, not its chords.
- Moving a road a little never makes the junction jump:
  - equal widths: as a gap → 180°, its setbacks and its part of the
    junction → nothing
  - where a gap turns from corner to round, `P` and `X` are the same point

## Roadway

- One per section: the section between the setbacks at its two ends.
- As wide as its section's road.
- A shorter section of the same kind:
  - straight → the straight between the setbacks
  - arc → the same circle, between the setbacks
- Ends square to the road, whether that end is set back or not.
- Junctions and roadways cover the road with no overlap and no gap. A
  roadway's end is the border between the two.
- Knows its length: the section's, less the setback at each end. A setback is
  measured along the centerline, so this holds whatever shape it takes.
- Negative where the two setbacks overlap: the section is too short for its
  junctions, and an edit leaving it so is refused (`docs/intersections.md`,
  Clearance).
  - The outline then runs backwards. Ugly but harmless: only a refused
    plan's network gets there.
- Knows which of its ends has a crossing (`docs/road-markings.md`).

## Outline

- Every part says what ground it covers, as an outline. Each kind says it the
  way that kind is shaped:
  - junction → as described above in the Junction chapter
  - roadway → a band defined by its centerline and the width of the road
- An outline names the network part it belongs to.
- Each piece of a junction's outline says what it borders: a curb or a
  roadway's end.
- Says what ground the part covers, not how to tesselate or render it.

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
- The whole layout can be iterated.


## Relationship to other modules

- In `src/core/layout/`, outside `RoadNetwork`: uses only its public API.
- `src/render/` draws it (`docs/road-surface.md`).
- Edits are validated against it via `clearance` (`docs/intersections.md`).
