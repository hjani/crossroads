# Road Surface

## Scope

- Draws roads as asphalt: a ribbon per section, a polygon per junction
  joining the ribbons meeting there.
- Visuals only. Edits are still planned as if roads had no width
  (`docs/intersections.md`) → a network the planner accepts can still draw
  wrong (see Limits).
- The geometry (gaps, cuts, `P`, `T`, the walk around a node) is worked out
  in `docs/ideas/junction-polygon.md` and not repeated here.
- Out of scope: marks and previews. They stay lines along the centerline
  (`docs/tools.md`).

## Width

- One width `w` for every road: 8 m, a global constant.
- In meters, not pixels → the surface follows from the network alone →
  rebuilt on an edit and on nothing else.

## Ribbons

- A section's ribbon: the strip `w/2` either side of its centerline.
- Ends square to the road, at a cut and at an uncut end alike.
- A cut section is a shorter section of the same kind:
  - straight → the straight between the cuts
  - arc → the same circle, between the cuts
  - → drawn by the same code as an uncut section
- Arc: both edges are circles around the arc's center, broken into pieces
  at the same angles → a strip of quads square to the road.
  - The outer edge sets how fine: at a given angle step it strays furthest
    from its curve.
- The centerline stays. A ribbon is a second drawing of a section, not a
  replacement for the line.

## Junctions

- Worked out per node, from that node and the sections meeting it alone.
- Each gap under 180° asks its two roads for a cut through `P`; a road is
  cut at the longer ask, measured along its centerline.
- Outline, walked around the node:
  - gap under 180° → through `P`
  - gap of 180° or over → a round join, along the circle of radius `w/2`
    around the node
  - a dead end is one gap of 360° → a round cap
- As a gap → 180°, its cut and its part of the outline → nothing → moving a
  road a little never makes the junction jump.
- Drawn as a triangle fan from the node, at the ribbons' height and in their
  color → ribbons and polygon meet edge to edge, no overlap.

## Limits

Drawn wrong, never an error. Nothing here refuses an edit.

- Cuts at a road's two ends longer than the road → no ribbon; the two
  junction polygons overlap.
- Two roads leaving a node the same way (a gap of 0) → the cut grows without
  limit → clamped to the road's length.
- Arc radius under `w/2` → the inner edge doesn't exist → the ribbon folds
  over itself.
- A tight arc beside a sharp gap → the fan paves a sliver of grass. Accepted.

## Relationship to other modules

- Cuts and junction outlines: `src/core/`, in a module of their own.
  - One module: walking the outline needs every road's cut first.
  - Pure 2D geometry with exact answers → tested like the rest of core.
- The outline is a shape of the network, not a drawing → other readers use
  it too (picking a junction).
  - → the round join stays a true arc; only the renderer breaks it into
    pieces. Same rule as picking a section against its circle, not its
    chords.
  - → the triangle fan, and the grass it can pave, is how the outline is
    drawn, not what the junction is.
- Ribbons and junction meshes: `src/render/`, a view of its own beside the
  wireframe (`docs/rendering.md`), not an extension of it.
  - Learns of edits from the version counter; the whole surface is rebuilt
    when it changes.
  - A layer under the network's lines.
- Color: `EXISTING`, now an asphalt gray, shared with the wireframe.
  - Zoomed in, the lines and nodes sink into the asphalt.
  - Zoomed out, where 8 m is under a pixel, their fixed pixel size keeps the
    network visible.
