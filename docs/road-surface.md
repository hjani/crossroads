# Road Surface

## Scope

- Draws the road layout (`docs/road-layout.md`) as asphalt: a ribbon per
  roadway, and each junction filled in.
- Visuals only. Edits are still planned as if roads had no width
  (`docs/intersections.md`) → a network the planner accepts can still draw
  wrong (see Limits).
- Out of scope: marks and previews. Tools draw them over the surface.

## Ribbons

- A roadway's ribbon: the strip `w/2` either side of its centerline.
- A roadway is a section of the same kind → drawn by the same code whether it
  is set back or not.
- Arc: both edges are circles around the arc's center, broken into pieces
  at the same angles → a strip of quads square to the road.
  - The outer edge sets how fine: at a given angle step it strays furthest
    from its curve.
- The centerline stays. A ribbon is a second drawing of a section, not a
  replacement for the line.

## Junctions

- Drawn as a triangle fan from the node, at the ribbons' height and in their
  color → ribbons and junctions meet edge to edge, no overlap.
- Round joins are broken into pieces here, not in the layout.
  - → the fan, and the grass it can pave, is how a junction is drawn, not
    what it is.

## Limits

Drawn wrong, never an error. Nothing here refuses an edit.

- A setback clamped to half its section → the junction still reaches `P`,
  past the halfway point → overlaps what lies beyond it.
- Arc radius under `w/2` → the inner edge doesn't exist → the ribbon folds
  over itself.
- A tight arc beside a sharp gap → the fan paves a sliver of grass. Accepted.

## Relationship to other modules

- Reads the layout; knows no setback or junction rules of its own.
  - The layout is in meters, not pixels → the surface is rebuilt on an edit
    and on nothing else.
- A view of its own in `src/render/`, beside the wireframe
  (`docs/rendering.md`), not an extension of it.
  - Learns of edits from the version counter; the whole surface is rebuilt
    when it changes.
  - A layer under the network's lines.
- Color: `EXISTING`, now an asphalt gray, shared with the wireframe.
  - Zoomed in, the lines and nodes sink into the asphalt.
  - Zoomed out, where 8 m is under a pixel, their fixed pixel size keeps the
    network visible.
