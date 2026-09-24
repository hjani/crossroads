# Intersections

## Scope

- When a section is added: find where it crosses existing sections, split
  both, join them at a shared node.
- Whether it can be built at all: roads cover ground, so the junctions and
  roadways the edit would leave must not overlap.
- Out of scope: how a junction looks, how traffic moves through it. A
  junction is an ordinary node, drawn like any other.

## What a crossing is

Two sections' centerlines meeting at a point they don't already share.

- Both sections are split there. The new node is an ordinary node.
- Several meetings (a straight across a bend, two curves) → one junction
  each. The crossed section is cut at every one.
- Already share a node → not a crossing _at that node_ (roads drawn end to
  end, a road started from a node). The same pair can still cross elsewhere.
- Collinear overlap → no single point → not a crossing. A road drawn on
  top of another stays a second road.
- Grazing → a single point → a crossing. A shallow angle is never the reason
  to refuse; pieces that come out too short are (see Clearance).
- Centerlines only: two roads whose bands overlap without their centerlines
  meeting do not cross there.
  - → width never makes a junction, it only refuses.

## Plan, clear, then apply

- Checked only when a section is added, since nothing else can create a
  crossing. No pass over the whole network.
- Three steps:
  1. **Plan**: a standalone value saying which sections are cut, where the
     junctions land, and whether it can be built. Knows nothing of road
     width, and doesn't touch the network.
  2. **Clear**: measures the ground the plan would cover, and hands back the
     same plan, refused or not. Reads a finished plan and decides nothing
     else about it.
  3. **Apply**: carries out the plan and decides nothing new.
- The first two sit in different layers, since width belongs to the layout
  (`docs/road-layout.md`) and crossings do not.
  - → "can be built" is still one answer on the plan, not two a caller has
    to remember to ask
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

## The speculative network

- The **speculative network** is the network as the plan would leave it: the
  real one with the plan applied to a throwaway copy of it.
- Clearance is measured on its layout, never on the network as it stands.
- Built by applying the plan, not by working out what it would do → measured
  by the rules that will really run, rather than by a second guess at them.
- Belongs to the clearing step, and is discarded with it.
  - → nothing outside that step can access it in any way
- Only the parts the edit changes are laid out there. The rest is the same in
  both networks, and is read from the layout already at hand.
- What an edit changes:
  - the junction at every point the plan runs through
  - the junction at either end of every section it cuts
    - a cut shortens the section → a setback there may come out differently
  - the roadway of every section meeting a changed junction
- A cut section is gone there, replaced by the two pieces left where it was →
  the pieces are what the new parts are measured against.

## Clearance

Two parts of the layout may not overlap. `w` is the width of a
road.

- Three pairings: junction ↔ junction, junction ↔ roadway, roadway ↔
  roadway.
- A junction is measured by a circle about its node, wide enough to cover
  its outline.
  - conservative: refuses a layout that would just have fitted, never allows
    an overlap
- A junction and a roadway are clear where the roadway's centerline stays
  `R + w/2` from the node, `R` the junction's circle.
  - measured to the nearest point between the roadway's ends → its ends
    count as round, not square: conservative again
  - that extra half disc lies inside the end's own junction circle → it
    refuses nothing junction ↔ junction doesn't already
- Two roadways are clear where their centerlines stay `w` apart.
- Exempt: parts sharing a node.
  - they meet by design, and the junction rules (`docs/road-layout.md`)
    already say how
  - two roadways at a gap `ψ` end `w·cos(ψ/2)` apart → always under `w`,
    approaching it as the gap closes
- A section must be long enough for the setbacks at its two ends: its
  roadway's length ≥ 0, within 1 cm.
  - zero is allowed: the two junctions touch along one cut, with no overlap
  - already follows from the two junctions' circles being clear, and kept
    as the exact check: length ≥ chord ≥ `R₁ + R₂` ≥ `s₁ + s₂`
- Any of these → the plan cannot be built.

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
- Further apart than that → two places, and Clearance measures the junctions
  they make against each other.
- No minimum length of its own, but a short piece whose junctions come too
  close is refused by Clearance.

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

- Crossings and splitting are in `src/core/network/`, above and outside
  `RoadNetwork`:
  - a split edits several primitives (+1 node, +2 sections, −1 section)
  - the model stores, it doesn't decide
  - uses only the network's public API
  - knows nothing of road width
- Clearance is in `src/core/layout/`, above them: width and junctions live
  there, and a layer imports only the ones before it.
  - → a step of its own, between planning and applying; a tool calls the
    three in turn
- The geometry (`src/core/geometry/`) knows nothing about the network, just
  points and distances.
  Only the pair of shapes varies; where the result goes doesn't.
- Editing tools call this instead of adding a section directly. The tool
  picks the endpoints and reports refusals; this decides what the network
  does between them.
