# Lanes

## Scope

- Where cars drive: lanes along roadways, connections across junctions.
  Together, the lane graph.
- Derived from the layout (`docs/road-layout.md`), never stored.
  - Layout: what ground the road covers. Lane graph: where on it cars drive.
- The network stays the graph a route is found on; the lane graph is what
  is driven along it.
- Originating from brainstorming idea: `docs/ideas/lanes.md`.
- Out of scope: cars, conflicts between paths, routing, crossings, lanes set
  by the player.

## Lanes

- One per lane each way in the section's road profile
  (`docs/road-network.md`).
- Every lane is `v` wide: the inner lane width of the lane marks
  (`docs/road-markings.md`).
  - One constant, in core; the marks read it from there.
- Lane `i`, counted from 1 out from the centerline: its middle `(i − ½)·v`
  from the section's centerline.
  - What's left at the curb, `w/2 − n·v`, is not a lane: room for parking,
    trees, a sidewalk.
  - Profiles are presets, each fitting its lanes → `w ≥ 2·n·v` is not
    checked at run time.
- Right-hand traffic: seen along `from → to`, lanes running that way lie
  right of the centerline, lanes running `to → from` left of it.
- Its centerline: its roadway's, offset sideways → the same kind of shape:
  - straight → the parallel straight
  - arc of radius `R` → the concentric arc, `R ± d`
  - biarc → each piece offset, `J` moved square to the road → still
    tangent at `J`
  - An arc that leaves no inner edge is refused (`docs/intersections.md`) →
    every lane, lying inside the road, has its arc.
- Runs along its roadway, end to end → both its ends lie on the roadway's
  ends.
  - Entry: the end it starts at. Exit: the end it runs into.
  - A roadway's end is the border with the junction → a lane's end too.
  - Not where a car stops: that depends on rules, not only on geometry.

## Connections

- Across a junction, from an incoming lane's exit to an outgoing lane's
  entry.
  - Incoming: running into the junction's node. Outgoing: running out of
    it.
- At most one per pair of lanes.
- Several leaving one exit is a split, several reaching one entry a merge:
  no kind of their own.
  - Profile is per section → lane count changes only at nodes → fewer lanes
    past a 180° join is a merge.
- A dead end connects too: U-turns → no node is a special case.
- Leaves in the incoming lane's heading, arrives in the outgoing lane's →
  smooth at both ends.
- `v` wide, as its lanes.
- Exit and entry can be one point: an equal-width 180° join sets nothing
  back → a connection of zero length.

## Identity

- Lane: `(section, ±i)`.
  - `+i` runs `from → to`, `−i` runs `to → from`.
  - Counted from 1 → the sign always says the direction.
  - Derived from its section alone → nothing stored; lasts as long as the
    section.
- Connection: `(A, ±i) × (B, ±j)`.
  - Its node: the one `(A, ±i)` runs into.
    - A section meets a node at most once → that node is never in doubt.
  - Valid only if `(B, ±j)` runs out of that node → a wrong sign is a bug,
    not another meaning.
  - U-turn: `(A, +i) × (A, −j)`.

## Lane graph

- Lanes and connections, linked: a lane leads into the connections leaving
  its exit, a connection into its outgoing lane.
  - → a path alternates lane, connection, lane; a zero-length connection
    too.
- A place on it: a lane or a connection, and `s`, the distance along it
  from its start, in meters.
  - As the markings measure along a roadway (`docs/road-markings.md`).

## `LaneGraph`

- One object answers for the whole lane graph: the lanes along a section,
  the connections at a node.
- A part is worked out the first time it is asked for, then kept; all is
  dropped when the network's version changes → as `RoadLayout`
  (`docs/road-layout.md`).
  - Reads the layout of the same version.
- Each part is a pure function of the layout parts it comes from:
  - lanes ← their roadway
  - connections at a node ← its junction and the lanes ending at it

## Overlay

- A debug view of the live lane graph, drawn over the road surface.
- Each lane: its centerline as a thin line, an arrowhead at each end.
  - Pointing the way the lane runs → its direction reads at either end.
  - Entry: base on the entry point → points into the roadway.
  - Exit: tip on the exit point → points out of it.
  - → both inside the roadway.
- Arrowheads sized in meters (`ARROW_BASE_METERS`, `ARROW_LENGTH_METERS`)
  → grow with zoom; the line stays a pixel wide.
- A color of its own, not a part state (`docs/part-states.md`): the road's
  own gray would not show on it.

## Relationship to other modules

- In `src/core/lanes/`, after `layout/`: uses the network and the layout
  through their public API.
- `src/render/` draws it as an overlay.
- Shares `v` with the lane marks.
