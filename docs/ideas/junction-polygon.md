# Junction polygon — brainstorming notes

Not a design note. A record of one discussion, written one step at a time.

Assumes every road has the same width `w`.

## The problem

- Each section is drawn as a ribbon: a strip of width `w`, centered on the
  section.
- One ribbon on its own is easy. The trouble is at nodes, where ribbons meet.

Two roads meeting at a 90° bend, both ribbons drawn all the way to the node:

    BBBBBBBB
    BBBBBBBB
    BBBBBBBB
    BBBBXXXXAAAAAAAAAAAA
    BBBBXXXXAAAAAAAAAAAA
    ....AAAAAAAAAAAAAAAA
    ....AAAAAAAAAAAAAAAA

- `A`, `B`: ground covered by one road
- `X`: covered by both → **overlap**
- `.`: covered by neither → **gap**
- The node is the point where the four blocks meet.

## The approach

- End each ribbon a short way before the node. How far before, measured
  along the road: the **setback**.
- What is left of the ribbon: the **roadway**.
- Fill the space between the roadways with one shape: the **junction
  polygon**.
- → no overlap, no gap.
- Open: how long each setback is, and what shape fills the space. Taken one
  case at a time.

## Two roads at a node

- **Gap**: the angle between two neighboring roads, measured between the
  directions they leave the node by.
  - Arc → its direction right at the node, not toward its far end.
- Two roads → two gaps, one on each side, adding up to 360°:

          B
         /
        /   60° gap
       N--------- A
          300° gap

### Gap of 180°: straight through

    BBBBBBBBBBBBAAAAAAAAAAAA
    BBBBBBBBBBBBAAAAAAAAAAAA
    BBBBBBBBBBBBAAAAAAAAAAAA
    BBBBBBBBBBBBAAAAAAAAAAAA
                ↑
                N, halfway across the road

- Both ribbons, drawn all the way to the node, end on the same line: square
  to the road, through N.
  - → no overlap, no gap.
- Setback: 0. Junction polygon: none.
- Arcs too: an arc's roadway also ends square to its direction at the node.
  - → two arcs joined smoothly meet like two straights.
- Near 180° the other two cases apply. As the gap gets close to 180°, their
  setback and polygon must shrink to this result.
  - → moving a road a little never makes the junction jump.

### Gap under 180°

The 90° bend from above, both roads set back:

    |       |
    |   B   |
    |       |
    +-------P-----------
    .       |
    .   N   |   A
    .       |
    . . . . +-----------

- `P`: where the two road edges on this side of the gap cross.
- End each roadway square across, through `P`.
  - → the roadways touch only at `P` → no overlap.
- On this side the junction polygon needs nothing more: both roadways end
  at `P`.
- The dotted side is the other gap (270°) → see "Gap over 180°".

How long the setback is, for two straights:

- `φ`: the gap
- `P` lies on the line splitting the gap in half, at distance `ρ` from N
- `P` is `w/2` from each road's centerline → `ρ·sin(φ/2) = w/2`
- the setback, measured along the road: `s = ρ·cos(φ/2)`

      s = (w/2)·cot(φ/2)

| gap `φ` | setback `s` |
| ------- | ----------- |
| 180°    | 0           |
| 90°     | 0.5 w       |
| 60°     | 0.87 w      |
| 30°     | 1.87 w      |
| 10°     | 5.7 w       |

- `φ` → 180°: `s` → 0 → matches "Gap of 180°".
- `φ` → 0°: `s` grows without limit → a sharp bend sets both roads back a
  long way, possibly further than a road is long.
  - The edit planning should refuse this: every road at a node the edit
    changes needs `s1 + s2 ≤ its length`, with `s1`, `s2` the setbacks at
    its two ends.

### Gap over 180°

- The dotted side of the 90° bend: a 270° gap.
- The other gap already fixes the setbacks.
- Question: how to close the outline between the two outer corners `+`.
- `ψ`: this gap.

**Joining the corners straight: doesn't work.**

    +-------P-----------
      \     |
        N   |   A
          \ |
            +-----------

- The line passes through `N`.
- Other gap under 90° → `N` ends up outside the road → the centerline runs
  over grass.
- Cause: the other gap sets the roads back, so the corners are far from `N`.
- The same goes for an arc joining the two corners.

**Miter** (a sharp corner, like a picture frame): extend both edges until
they meet, at `M`.

    +-------P-----------
    |       |
    |   N   |   A
    |       |
    M-------+-----------

- Same reasoning as for `P`, on the other side of `N`:

      |NM| = (w/2)/sin(ψ/2)

- `ψ` → 180°: `M` → the edge right beside `N` → matches "Gap of 180°".
- `ψ` → 360° (very sharp bend): `M` runs off without limit → a long spike.

**The touching point `T`**, used by the next two:

- The circle around `N` with radius `w/2`.
- A road's centerline passes through `N`; its outer edge is parallel, `w/2`
  to the side → the edge touches the circle at one point: `T`, right beside
  `N`.

**Bevel** (the corner cut off flat): follow both edges back to `T`, then
straight across.

    +-------P-----------
    |       |
    T   N   |   A
      \     |
        T---+-----------

- Both `T`s are on the circle → the straight piece is a chord spanning
  `ψ − 180°`:

      distance from N to the straight piece = (w/2)·cos((ψ − 180°)/2)

- `ψ` → 180°: the straight piece shrinks to nothing → matches "Gap of 180°".
- No spike.
- `ψ` → 360°: the distance → 0 → the curb nearly touches the centerline.

**Round**: follow both edges back to `T`, then along the circle to the
other `T`.

A sharp bend, not to scale:

       T-------------------+
      /                     \   B
     (   N                   P
      \                     /   A
       T-------------------+

- Far `+` corners only make the straight pieces longer; the arc stays the
  same size.
- The edge touches the circle at `T` → straight turns into arc with no
  corner.
- The arc spans `ψ − 180°` → less than half a circle for any `ψ < 360°` →
  `N` is always inside, `w/2` from the curb.
- `ψ` → 180°: the arc shrinks to nothing → matches "Gap of 180°".
- No spike.

- Open: which one.

## Three or more roads

- Sort the roads by the direction they leave `N` → each road has two
  neighbors, one on each side.
- Each gap sets both of its roads back, as in the two-road cases:
  - under 180°: to end through `P`
  - 180° or over: not at all
- A road gets a setback from each side → it takes the **longer** one.
  - With the shorter one, its roadway would still overlap the other
    neighbor.

When a road's two setbacks differ:

             /
        B   /  grass
           /
          P----------+
          :          |
     N    :  strip   |   A
          :          |
    -----------------+

- A third road `C` (below, not drawn) sets `A` back further.
- Dotted line: where `A`'s roadway would end with `B`'s setback alone.
- The strip between the dotted line and where `A`'s roadway really ends
  belongs to the junction, with grass on one side of it.
- Outline on this side: `+` → back along `A`'s edge to `P` → on to `B`.
- `P` can be an **inward corner**: a corner pointing into the shape.

      +----+
      |    |
      |    D----+     D: an inward corner
      |         |
      +---------+

- Still, every outline point can be reached from `N` in a straight line
  without leaving the junction → a triangle fan from `N` works.

## Walking around a junction

The outline, built road by road, counterclockwise around `N`:

- For each road: its right corner, then its left corner (right and left as
  seen looking from `N` along the road).
- Then the gap to the next road:
  - under 180°: back along the edge to `P`, then out along the next road's
    edge to its corner. Either part is empty when the corner already is `P`.
  - 180° or over: back along the edge to `T`, along the circle to the next
    road's `T`, then out along its edge to its corner.

A skewed T: `A` and `C` are one straight road, `B` leaves at 60°. Not to
scale.

                           /         /
                          /    B    /
                         /         /
                        +`-.      /
                       /    `-.  /
    ------------------P         P------------
                      |         |
            C         |  N      |     A
                      |         |
    ------------------+--T------+------------

| gap        | setback |
| ---------- | ------- |
| A–B, 60°   | 0.87 w  |
| B–C, 120°  | 0.29 w  |
| C–A, 180°  | none    |

- Setbacks, the longer of each road's two: `A` 0.87 w, `B` 0.87 w, `C`
  0.29 w.

1. `A`: right corner `+`, left corner `P`.
2. Gap A–B: `B`'s right corner is the same `P` → nothing to add.
3. `B`: left corner `+`.
4. Gap B–C: `B` is set back past `P` → back along `B`'s edge to `P`. `C`'s
   right corner is that `P` → nothing more.
5. `C`: left corner `+`.
6. Gap C–A: 180° → the arc at `T` has zero length → `C`'s `+`, `T` and
   `A`'s `+` lie on one line.

- Outline: `A`'s `+` → `P` → `B`'s `+` → `P` → `C`'s `+` → back to `A`'s `+`.

A gap over 180°: all three roads leave on one side of `N`. `A` goes right,
`B` at 45°, `C` up. Not to scale.

        |       |         /           /
        |       |       /           /
        |   C   |     /     B     /
        |       |   /           /
        |       | /           /
        +-------P           /
        |         \       /
        |           \   /
        |             P------------------
        |             |
        T   N         |       A
         `.           |
           `T---------+------------------

| gap        | setback |
| ---------- | ------- |
| A–B, 45°   | 1.21 w  |
| B–C, 45°   | 1.21 w  |
| C–A, 270°  | none    |

- Setbacks, the longer of each road's two: all three 1.21 w.

1. `A`: right corner `+`, left corner `P`.
2. Gap A–B: `B`'s right corner is the same `P` → nothing to add.
3. `B`: left corner `P`.
4. Gap B–C: `C`'s right corner is the same `P` → nothing to add.
5. `C`: left corner `+`.
6. Gap C–A: 270° → back along `C`'s edge to `T`, along the circle to `A`'s
   `T`, out along `A`'s edge to `A`'s `+`.

- Outline: `A`'s `+` → `P` → `P` → `C`'s `+` → `T` → arc → `T` → back to
  `A`'s `+`.

## Arcs

- The rules above stay: gaps, the longer setback, `P`, `T`, the walk.
- What needs checking is the geometry under them.

### Finding `P`

- A road's edges run parallel to its centerline, `w/2` to each side:
  - straight → two lines
  - arc with center `O` and radius `R` → two circles around `O`, radii
    `R − w/2` and `R + w/2`
    - needs `R > w/2`, or the inner edge doesn't exist
- `P`: where the two edges on the gap's side cross, as before.
  - → a line with a line, a line with a circle, or two circles
  - → no simple formula for the setback anymore
- Two lines cross at most once. A circle can cross a line or another circle
  twice.
- An edge only runs as long as its road → the second crossing usually falls
  past a road's end. Two ways it doesn't:

  Two roads between the same two nodes. The second crossing is next to `M`
  → it belongs to `M`'s junction.

          .-------------.
         /       B       \
        N                 M
         \_______A_______/

  A road bending back close to its neighbor, without touching its
  centerline → no intersection is made. A road running into another away
  from any junction: a separate problem.

            .-----.
          /         \   B
         /           \
        N-------------'-------  A

- → `P` is the crossing nearest `N`, along the road.

### Measuring the setback

Not to scale; the arcs are drawn straight.

      N . . . . . . . . Q        centerline, radius R
       \               /
        \ . . . . . . P        inner edge, radius R − w/2
         \           /
          \    θ    /
           \       /
            \     /
             \   /
               O

- A roadway's end, square to the road, lies on a line through the arc's
  center `O`.
- The end through `P` runs along the line from `O` through `P`.
  - `Q`: where that line crosses the centerline.
  - `θ`: the angle at `O` between `N` and `Q`.
- The setback is measured along the centerline, from `N` to `Q`:

      s = R·θ

- Why the centerline: a road's two setbacks come from its two edges.
  - Measured along the edges, the same `θ` gives `(R − w/2)·θ` on the inner
    edge and `(R + w/2)·θ` on the outer edge → the same setback gets two
    different lengths.
  - Measured along the centerline, both give `R·θ` → the longer setback is
    the one with the larger `θ`.

### The touching point `T`

- For the round join (see "Gap over 180°"), the outline follows a road's
  edge back to `T`, where the edge touches the circle around `N` with
  radius `w/2`.
- On an arc road the edge is itself a circle, not a line. If it crossed the
  circle around `N` instead of touching it, the curb would get a corner at
  `T`.
- Result: it still only touches, at the same point right beside `N` → the
  round join, and the bevel, work on arcs unchanged.

Why, all on the line through `O` and `N`:

    O-------------------Ti----N-----To
    |<---- R − w/2 ---->|
    |<---------- R ---------->|
    |<---------- R + w/2 ---------->|

- `Ti`, `To`: where the inner and the outer edge touch the circle around
  `N`.
- The edge facing the gap can be either one, depending on which way the arc
  bends → both are checked.
- Two circles touch at one point when the distance between their centers
  is the sum or the difference of their radii.
- `|ON| = R`. Inner edge: `R = (R − w/2) + w/2`. Outer edge:
  `R = (R + w/2) − w/2`.

### The triangle fan from `N`

Superseded: junctions are no longer drawn as a fan, see
`docs/road-tessellation.md`.

- The renderer draws the outline as a triangle fan from `N`.
- The fan matches the outline only if the straight line from `N` to every
  outline point stays inside the junction. On straight roads it does (see
  "Three or more roads").
- On an arc road it can fail, on a tight bend next to a sharp gap.

Exaggerated; the inner edge is drawn as the straight pieces the renderer
uses:

    N
    | *                  road
    |   *
    |      *
    1--------*--2
    :  grass   *  \
    :            * \
    :              *\
    :                 3

- `1`, `2`, `3`: points of the inner edge. It bends around the grass on the
  inside of the bend.
- `*`: the fan's line from `N` to `3`. Below `1–2` it runs over grass.
- → the fan triangle `N`, `2`, `3` covers that bit of grass and paves it.
- Seen from `N`, turning from `1` to `2` goes one way, but `2` to `3` turns
  back the other way → the triangle `N`, `2`, `3` is flipped over.

Possible approach:

- Accept the paved grass: it counts as part of the junction.
- Draw the junction from both sides. Three.js skips the back side of a
  triangle by default, so a flipped triangle would leave a hole.
- Alternative: a general triangulation, which follows the outline exactly.
- Or just don't care until it becomes visible. It's quite an edge case.
