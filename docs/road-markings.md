# Road Markings

## Scope

- Paint on the road surface (`docs/road-surface.md`): a solid line along
  each curb, a dashed line down the centerline.
- Out of scope: arrows, stop lines, markings that differ by road type.

## Markings

In meters. `w` is the road width.

- Edge line: 0.1 wide, 0.1 in from the curb.
  - The gap keeps the line off the mesh edge.
- Along both sides of every roadway.
- Centerline: dashed, 0.1 wide, 1 dash, 1 gap. Roadways only → it stops at
  junctions.
- One color for every marking: white.

## Dash pattern

Per roadway. `L` its length, `P = 2` the period (dash + gap).

- A whole number of periods, stretched to fit exactly:

      n  = round(L / P)
      P' = L / n

- Half a gap at each end: a dash is the middle half of each period.
  - → two roadways meeting at a 180° join: the two half gaps make one gap →
    the pattern carries on across the node.
  - → at a junction: about 0.5 of gap before it.
- `n = 0` → no dashes.
- Built roadways are at least 30 m (`docs/intersections.md`) → `n ≥ 15`,
  and `P'` is within `P / 2L ≈ 3%` of `P`.

## Drawn in the shader

Markings are not geometry of their own: the fragment shader colors each
pixel of the surface from values its vertices carry, interpolated across
each triangle.

- Every vertex carries where it is on its road:
  - `u`: signed distance from the centerline. `±w/2` at a roadway's
    vertices.
  - `t = s / P'`: distance along the roadway, in periods. `s` is measured
    from the roadway's start.

- A pixel is marked where:

      edge line, roadway:    0.1 < w/2 − |u| < 0.2
      centerline dash:       |u| < 0.05  and  |fract(t) − 0.5| < 0.5

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

## Zoom

- A line's edge is smoothed over one pixel.
- A line thinner than a pixel fades out instead of flickering.

## Relationship to other modules

- Drawn by the road surface view, in the surface's own mesh, in
  `src/render/`.
  - → rebuilt with the surface, on an edit and on nothing else.
- The dash pattern is worked out in `src/core/layout/`, from the roadway's
  length.
