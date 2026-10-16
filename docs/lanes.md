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
- At most one per pair of lanes; which pairs: Which lanes connect, below.
- Several leaving one exit is a split, several reaching one entry a merge:
  no kind of their own.
- Leaves in the incoming lane's heading, arrives in the outgoing lane's →
  smooth at both ends.
- `v` wide, as its lanes.
- Exit and entry can be one point: an equal-width 180° join sets nothing
  back → a connection of zero length.

### Turn

- Each connection is straight on, a left turn, a right turn or a U-turn.
- `h`: the heading where the incoming lane exits; `e`: where the outgoing
  lane enters.
- `φ`: the signed angle from `h` to `e`, in (−180°, 180°], positive to the
  right.
  - At the lane ends, not at the node → how far the connection itself
    turns.
  - Every lane of a road has the same heading at a roadway end → all
    connections between two roads turn the same way.
- Straight on: between two roads that pick each other.
  - A road picks the outgoing road with the least `|φ|`, if within
    `STRAIGHT_ON_MAX_TURN_RADIANS` and not tied with another
    (`STRAIGHT_ON_TIE_RADIANS`); else none.
  - At a road's end its exit heading is minus its entry heading →
    `φ(B→A) = −φ(A→B)` → within the limit one way is within it both ways.
  - → at most one straight-on road per road.
  - Picked one way only, or a tie: ambiguous → a turn.
    - D–B nearly one road, A joining 30° off D: A picks B, B and D pick
      each other → D↔B straight on, A↔B a turn.
- U-turn: back onto its own road (`φ = 180°`).
- Otherwise right if `φ > 0`, left if `φ < 0`.

### Which lanes connect

![Three panels, each showing one road's connections. 1: a 3-lane road meeting a 2-lane road end to end, the lanes spread both ways. 2: a 3-lane road into a cross of 1-, 2- and 1-lane roads: lane 1 turns left, lane 2 goes straight, lane 3 goes straight and turns right. 3: the 3-lane stem of a T into 1-lane arms: the middle lane, in no window, takes the right turn of the lane on its right](images/lane-connections.svg)

- Decided per pair of roads: A in, B out, `n_A` and `n_B` lanes each way.
- Lanes numbered from the centerline on both roads, `1…n`.
  - Right-hand traffic → lane 1 is the leftmost the way it runs, on every
    road → one left-to-right order.
  - Order kept → a pair's connections never cross, whatever the turn.
  - Different pairs' connections may cross: left to conflict handling and
    traffic lights.
- Spread: the side with more lanes spread evenly over the other, in order →
  each of its lanes in exactly one connection.
  - A middle exactly on a border → toward the curb: 3 into 2 →
    `1→1, 2→2, 3→2`.
- By how many roads meet at the node:
  - One, a dead end: back onto itself, `i → i` → U-turns.
  - Two: A into the other road, spread.
    - Profile is per section → lane count changes only at nodes → a lane
      drop is a merge here.
  - Three or more, a junction: turn groups, below. No U-turns.

#### Junction

- The roads A can turn into, grouped by turn: left, straight, right.
- A group's size: `g = min(n_A, lanes of its widest road)`.
  - Two left roads of 1 and 2 lanes → 2 left lanes, not 3.
- Its window: `g` adjacent lanes of A.
  - Left: the leftmost. Right: the rightmost.
  - Straight: the middle; the leftmost with no left group, the rightmost
    with no right group. Middle tie → toward the curb.
- Each road B of a group, from the window:
  - `g ≤ n_B`: the window spread over B's lanes.
  - `g > n_B`: only `n_B` window lanes, one to one, on the turn side.
    - Never straight: at most one straight road → the widest of its group.
  - → no turn takes more of A's lanes than its road has.
- No dead lanes: a lane in no window takes the connections of its nearest
  neighbor; tie → toward the curb.
  - → the only way a pair merges at a junction.

### Shape

![Six panels, each a small network laid out by the project's code. 1: lane ends set far back by two roads at sharp angles; one curve from exit to entry cuts across the inside corner C, off the road, while straight on, a turn near K and straight on stays on it. 2: the turn close up: tangent to both lane lines, T before and after K, its center M, R − c from M to C. 3: a cross: from S, left round the far corner, right round the near one, and straight on. 4: a turn past a road: the corners on its inside, the side road's mouth between them. 5: two lanes turning side by side, lane 1 being lane 2's turn moved by v round the same M. 6: two lanes into one, lane lines parallel, no corner: lane 2 merges in a biarc](images/lane-connection-shape.svg)

- Straights and circle arcs, end to end: `ConnectionLine`, a list of pieces.
  - → shapes the geometry already measures exactly → where two paths
    conflict can be found exactly, later.
- Heading continuous at both ends and at every join; curvature may jump.
- `h`: the incoming lane's heading at its exit; `e`: the outgoing lane's at
  its entry.
- `K`: where the lane lines cross — the exit's carried on along `h`, the
  entry's carried back along `e`.
  - `a = |K − exit|`, `b = |entry − K|`, `φ` the turn.

#### Turn at a corner

- Lane lines crossing ahead of both lanes (`a > 0`, `b > 0`): straight on
  along `h`, an arc, straight on along `e`.
  - The arc: radius `R`, tangent to both lines, `T = R·tan(|φ|/2)` before
    and after `K`.
  - A straight of no length is left out.
- `R`: the largest that stays on the road.
  - Within the lane ends, `T ≤ a` and `T ≤ b`:

        R_cap = min(a, b) / tan(|φ|/2)

  - At least `CONNECTION_CLEARANCE_METERS` (`c`) from the junction's curbs:
    every curb piece and every corner of its outline.
    - Corners too: where two roadway ends meet, no curb lies between them.
    - A corner the turn has passed — between `K` and the arc — is hit: by
      distance alone it would be clear again.
      - A curb piece needs no such rule: its ends are corners.
    - A roadway end is no curb: road goes on there → a turn past a road may
      cut across its mouth.
  - Nothing fits → `R_cap`: the lane lines themselves run too close to a
    curb.
- Found by a search over `[0, R_cap]` (`largestFittingRadius`), to
  `RADIUS_TOLERANCE_METERS`.
  - Every turn tangent to both lines is the same shape, scaled about `K` →
    a larger `R` reaches only further into the inside of the turn.
  - → curbs on the inside only come closer, and a corner once passed stays
    passed; curbs on the outside only move further → `R` fits up to one
    limit, never above it.
  - One function → a closed form can replace it.
- Lane ends set far back → long straights, the turn near `K`.
- A small junction → `T` reaches `a` or `b`: the turn starts right at a lane
  end.

![The search on the long-setback corner, step by step. Left: the corner with the turns tried, R_cap, 9.3 and 7.0 m not clear, 4.7 m clear, the result 4.84 m. Right: the ten tests in order, each R tried, clear or not, and the interval [lo, hi] left, closing in on the limit R* = 4.91 m: R_cap first, then the smallest R, then eight halvings](images/lane-radius-search.svg)

#### No corner ahead

- Lane lines parallel, opposite, or crossing behind a lane end: a lane
  moving sideways, a U-turn.
- A biarc from exit to entry.

#### Side by side

- A group side by side: pairs `(i, j), (i + 1, j + 1), …` between the same
  two roads, each lane beside the one before on both roads.
- Its inner lane's connection is shaped as above: the group's rightmost
  turning right, its leftmost otherwise.
- Every other one: that connection moved `(i − i₀)·v` to its right.
  - Exits `v` apart square to `h`, entries square to `e` → it starts and ends
    on its own lanes.
  - Moving keeps every heading → still smooth; `v` apart all along → never
    crossing or overlapping.
  - One that would pass an arc's center → shaped on its own.
- The extra pair of a merge or a split is beside no other: a group alone,
  shaped on its own.
  - 3 into 2: `1→1`, `2→2` side by side, `3→2` alone.
- Only the inner lane is checked against the curbs: the others lie further
  from the inside of the turn.
  - The outside of a turn is not checked.

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
  - U-turn: `(A, +i) × (A, −i)`.

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
- Shown or hidden from the view options (`docs/ui.md`); hidden at startup.
- Each lane: its centerline as a thin line, an arrowhead at each end.
  - Pointing the way the lane runs → its direction reads at either end.
  - Entry: base on the entry point → points into the roadway.
  - Exit: tip on the exit point → points out of it.
  - → both inside the roadway.
- Each connection: its centerline as a thin line, along its shape.
- Arrowheads sized in meters (`ARROW_BASE_METERS`, `ARROW_LENGTH_METERS`)
  → grow with zoom; the line stays a pixel wide.
- A color of its own, not a part state (`docs/part-states.md`): the road's
  own gray would not show on it.

## Relationship to other modules

- In `src/core/lanes/`, after `layout/`: uses the network and the layout
  through their public API.
- `src/render/` draws it as an overlay.
- Shares `v` with the lane marks.
