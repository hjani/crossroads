# Road Markings

## Scope

- Paint on the road surface (`docs/road-surface.md`): a solid line along
  each curb, a dashed line down the centerline, zebra crossings at
  junctions.
- Out of scope: arrows, stop lines, markings that differ by road type.

## Markings

`w` is the road width, `ℓ` a line's width.

- Edge line: solid, set in `e` from the curb.
  - The inset keeps the line off the mesh edge.
- Along every curb: both sides of every roadway, and on through junctions.
- Centerline: dashed. Roadways only → it stops at junctions.
- One color for every marking: white.

## Fitted pattern

A mark and a gap, repeated over a stretch. `L` the stretch's length, `P`
the period (mark + gap).

- A whole number of periods, stretched to fit exactly:

      n  = round(L / P)
      P' = L / n

- The mark is centered in each period → half a gap at each end.
- `n = 0` → no marks.
- `P'` is within `1 / 2n` of `P`.

## Dash pattern

A fitted pattern along the centerline. `δ` the dash's share of a period.

- `L`: the roadway's length, less its crossings.
- The dash is a share of the period → stretches with it.
- Half a gap at each end:
  - → two roadways meeting at a 180° join: the two half gaps make one gap →
    the pattern carries on across the node.
  - → at a junction or a crossing: half a gap before it.

## Crossings

A zebra crossing at a roadway's end, where it meets a junction.

- At an end iff 3 or more sections meet at its node.
  - Per end → a roadway has one at either end, both or neither.
  - None at a dead end or a join of two.
- `D` deep along the road, starting right at the roadway's end.
- No centerline dashes on it.
- A roadway under `2D` long has none → two crossings never overlap.
- Bars run along the road: a fitted pattern across it, between the edge
  lines → `L = W = w − 2(e + ℓ)`.
  - A bar is half its period.

![A roadway's end at a junction, to scale: edge lines e in from the curb, centerline dashes with period P′ and half a gap at the end, and a crossing D deep with bars across W](images/road-markings.svg)

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
  - `t = (s − c) / P'`: distance along the dashed stretch, in dash periods.
    `s` is measured from the roadway's start, `c` is `D` with a crossing
    there, else 0.
  - `k = (u + W/2) / P'`: distance across, from the inner edge of the edge
    line, in bar periods.
    - Linear in `u` → interpolates exactly, like `u`.
  - `a`, `b`: distance from the start, and from the end, where that end has
    a crossing. Far (over `D`) where it has none.
  - A junction's vertices: `t = 0`, `a`, `b` far.

- A pixel is marked where:

      edge line:        e < halfWidth − |u| < e + ℓ
      on a crossing:    min(a, b) < D
      centerline dash:  |u| < ℓ/2  and  |fract(t) − 0.5| < δ/2
                        and not on a crossing
      crossing bar:     on a crossing  and  |fract(k) − 0.5| < 1/4
                        and  halfWidth − |u| > e + ℓ

- `t` and `k` already include the roadway's own `P'`, `a` and `b` its
  crossings → nothing per roadway is left for the shader → every roadway
  shares one mesh.

## Follows the chords, not the arc

- Values are linear inside a triangle → `u = const` is a straight line
  there.
- A roadway quad on an arc is an isosceles trapezoid → its two chords are
  parallel → the lines of constant `u` run parallel to them, and meet across
  the diagonal without a kink.
  - → a line keeps its distance from the drawn edge exactly.
  - Measured against the true arc instead, it would drift from the drawn
    edge by the sag, up to the tessellation's tolerance.
- Costs, both far under a millimeter at the tessellation's tolerance:
  - the chords are `w·cos(α/2)` apart, `α` the angle a quad covers → the
    lines are thinner by `cos(α/2)`
  - a dash end inside a quad is cut slightly slanted

## Through junctions

- A junction is drawn as a strip of quads along its outline, `d₀` deep, plus
  a fill (`docs/road-tessellation.md`).
- Each strip quad is drawn as a slice of a road: its vertices carry `side`
  and `halfWidth` like a roadway's → the same edge line rule.
- By what its outline piece `ab` borders:
  - a roadway's end → `side · halfWidth` is the distance across that
    road, as if it went on past the cut → the road's edge lines cross the
    cut unbroken and meet the curb's lines at the corners
  - curb → a road whose centerline is the piece moved in by `d₀`:

        halfWidth = d₀,  side = 1 on ab,  0 on the moved piece

    - arcs → one quad per chord → follows the chords, as a roadway does
- `halfWidth` is the same at all vertices of a quad → `u` is a distance in
  meters → `fwidth(u)` still measures a pixel.
- Fill: `side = 0`, `halfWidth = d₀` → `halfWidth − |u| = d₀` everywhere →
  no line.
  - `u` constant → `fwidth(u) = 0`: the shader's `ramp` divides by zero, as
    it already does for `t`, and comes out right.
- No centerline dashes in junctions.

## Zoom

- A line's edge is smoothed over one pixel.
- A line thinner than a pixel fades out instead of flickering.

## Relationship to other modules

- Drawn by the road surface, in its own meshes, in `src/render/`: one for
  the roadways, one for the junctions, both with the same shader.
- The dash pattern is worked out in `src/core/layout/`, from the roadway's
  length.
