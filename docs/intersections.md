# Intersections

## Scope

- When a section is added: find where it crosses existing sections, split
  both, join them at a shared node.
- Out of scope: how a junction looks, how traffic moves through it. A
  junction is an ordinary node, drawn like any other.

## What a crossing is

Two sections' geometry meeting at a point they don't already share.

- Both sections are split there. The new node is an ordinary node.
- Several meetings (a straight across a bend, two curves) → one junction
  each. The crossed section is cut at every one.
- Already share a node → not a crossing _at that node_ (roads drawn end to
  end, a road started from a node). The same pair can still cross elsewhere.
- Collinear overlap → no single point → not a crossing. A road drawn on
  top of another stays a second road.
- Grazing → a single point → a crossing. A shallow angle is never the reason
  to refuse; pieces that come out too short are (see Tolerances).

## Plan, then apply

- Checked only when a section is added, since nothing else can create a
  crossing. No pass over the whole network.
- Two steps:
  1. **Plan**: a standalone value saying which sections are cut, where the
     junctions land, and whether it can be built. Doesn't touch the network.
  2. **Apply**: carries out the plan and decides nothing new.
- A plan can be made without applying it → a tool can preview a section
  while it is still being dragged, and what lands is exactly what was shown.
- A plan is valid only for the network it was made on. Applying it after
  the network changed is an error (not a refusal), and nothing is built.
- A refusal is a full plan too: the whole section and the junctions it
  would have made, so it can be displayed. Only a buildable plan guarantees
  something to build.
  - Exception: an arc whose third point is in line with its ends has no
    circle → its refusal is the straight between the ends, no junctions.
- All or nothing: every piece and junction lands together. A refusal comes
  before anything is created → nothing to roll back.

## Tolerances

In meters, never pixels: the result must not depend on zoom (same reason
the grid pitch is fixed).

- **1 cm: same place.** A crossing within 1 cm of a node, or of another
  crossing, _is_ that point.
  - → a road ending on a road is a T-junction, not a near miss
  - → a road drawn through a node reuses it
  - → a road across two roads 5 mm apart makes one junction cutting all
    three (6 sections), not two nodes side by side
  - The new section's own ends too: within 1 cm of a road → on it, and cut it.
- **1 m: minimum road.** Any piece shorter than this is refused (it comes
  from a click that just missed its target).
  - Also applies to the whole section when it cuts nothing, or a stub in
    open ground would stand.
- **Between the two** → refused, not guessed. The edit stays in progress so
  the user can click again.
- Both are placeholders: once roads have width, junction spacing follows
  from it.

## Splitting

- Same kind on both sides: straight → 2 straights, arc → 2 arcs following
  the original bend.
- Not exactly the same circle: the node sits where the tolerances put it,
  possibly slightly off the road (the second of two roads 5 mm apart gets a
  5 mm kink), and each half is the arc through its actual ends.
  - The difference is far too small to see at road-section lengths.
  - Rejected: moving the node to fit the arc, which would let geometry
    decide where junctions go.

## Relationship to other modules

- In `src/core/network/`, above and outside `RoadNetwork`:
  - a split edits several primitives (+1 node, +2 sections, −1 section)
  - the model stores, it doesn't decide
  - uses only the network's public API
- The geometry (`src/core/geometry/`) knows nothing about the network, just
  points and distances.
  Only the pair of shapes varies; where the result goes doesn't.
- Editing tools call this instead of adding a section directly. The tool
  picks the endpoints and reports refusals; this decides what the network
  does between them.
