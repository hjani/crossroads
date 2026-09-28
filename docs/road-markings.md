# Road Markings

## Scope

- Paint on the road surface (`docs/road-surface.md`): a solid line along
  each curb, a dashed line down the centerline.
- Out of scope: arrows, stop lines, markings that differ by road type.

## Markings

In meters. `w` is the road width.

- Edge line: 0.1 wide, 0.1 in from the curb.
  - The gap keeps the line off the mesh edge.
- Along every curb: both sides of every roadway, and on through junctions.
- Centerline: dashed, 0.1 wide, 1.5 dash, 3 gap. Roadways only → it stops at
  junctions.
- One color for every marking: white.

## Dash pattern

Per roadway. `L` its length, `P = 4.5` the period (dash + gap).

- A whole number of periods, stretched to fit exactly:

      n  = round(L / P)
      P' = L / n

- Half a gap at each end: a dash is the middle third of each period.
  - → two roadways meeting at a 180° join: the two half gaps make one gap →
    the pattern carries on across the node.
  - → at a junction: about 1.5 of gap before it.
- `n = 0` → no dashes.
- Built roadways are at least 30 m (`docs/intersections.md`) → `n ≥ 7`,
  and `P'` is within `1 / 2n ≈ 7%` of `P`.

## Drawn in the shader

Markings are not geometry of their own: the fragment shader colors each
pixel of the surface from values its vertices carry, interpolated across
each triangle.

- Every vertex carries where it is on its road:
  - `side`: `±1`, which edge of the roadway it is on.
  - `halfWidth`: `w/2`, the same at every vertex of a roadway.
  - → `u = side · halfWidth`, worked out in the vertex shader: signed
    distance from the centerline, interpolated for each pixel.
    - Width only in `halfWidth` → a width that varies by road needs no
      change.
  - `t = s / P'`: distance along the roadway, in periods. `s` is measured
    from the roadway's start.

- A pixel is marked where:

      edge line:             0.1 < halfWidth − |u| < 0.2
      centerline dash:       |u| < 0.05  and  |fract(t) − 0.5| < 1/6

- `t` already includes the roadway's own `P'` → nothing per roadway is left
  for the shader → every roadway shares one mesh.

## Follows the chords, not the arc

- Values are linear inside a triangle → `u = const` is a straight line
  there.
- A roadway quad on an arc is an isosceles trapezoid → its two chords are
  parallel → the lines of constant `u` run parallel to them, and meet across
  the diagonal without a kink.
  - → a line keeps its distance from the drawn edge exactly.
  - Measured against the true arc instead, it would drift from the drawn
    edge by the sag, up to 5 cm: half the line's width.
- Costs, both far under a millimeter at the tessellation's tolerance:
  - the chords are `w·cos(α/2)` apart, `α` the angle a quad covers → the
    lines are thinner by `cos(α/2)`
  - a dash end inside a quad is cut slightly slanted

## Through junctions

- A junction is drawn as a fan from its node `N`: one triangle `N, a, b` per
  outline piece `ab` (`docs/road-surface.md`).
- Each triangle is drawn as a slice of a road: its vertices carry `side` and
  `halfWidth` like a roadway's → the same edge line rule.
- By what `ab` borders:
  - a roadway's end → that roadway, carried on to `N`:

        halfWidth = w/2,              side = ±1 at a, b,  0 at N

  - curb → a road with its centerline through `N`, parallel to `ab`:

        halfWidth = dist(N, line ab), side =  1 at a, b,  0 at N

    - straight edge → `dist = w/2` → the real road's values
    - round join → one triangle per chord → follows the chords, as a roadway
      does
- `halfWidth` is the same at all three vertices → `u` is a distance in
  meters → `fwidth(u)` still measures a pixel.
- Two neighboring triangles' lines meet on the line from `N` to their shared
  corner.
  - At `P`: `N` is `w/2` from both edges, `P` is 0 from both → that line is
    the bisector → the lines meet in a clean miter.
  - On an arc road only nearly.
- No centerline dashes in junctions.

## Zoom

- A line's edge is smoothed over one pixel.
- A line thinner than a pixel fades out instead of flickering.

## Relationship to other modules

- Drawn by the road surface view, in the surface's own meshes, in
  `src/render/`: one for the roadways, one for the junctions, both with the
  same shader.
  - → rebuilt with the surface, on an edit and on nothing else.
- The dash pattern is worked out in `src/core/layout/`, from the roadway's
  length.
