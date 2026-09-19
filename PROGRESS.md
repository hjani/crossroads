# CrossRoads — Progress

Quick status for picking up where we left.

## Current status

M0 through M7 are done — M3 came ahead of the curves because a second tool
needs a way to be chosen, and because nothing could be deleted. Current:
**M8 — Inspect tool**
Next step: the inspect panel itself, holding placeholder content

## Milestones

### M0 — Scaffold
- [x] `package.json` created
- [x] `npm install` (vite, typescript, three, @types/three)
- [x] `tsconfig.json`
- [x] `index.html` + Vite entry
- [x] `src/main.ts` — hello Three.js scene (renderer, orthographic camera, render loop, resize handling)
- [x] `npm run dev` verified in browser
- [x] `CLAUDE.md` written
- [x] git repo initialized
- [x] `docs/camera-controls.md` design note
- [x] camera pan/zoom (mouse, touchpad, keyboard)

### M1 — Straight sections
- [x] `docs/road-network.md` design note
- [x] core data model (nodes/edges)
- [x] click-to-place straight sections
- [x] snap to existing nodes, so sections can be joined (input layer, independent of grid snapping)
- [x] `docs/rendering.md` design note
- [x] wireframe rendering
- [x] grid snapping, with Ctrl held to place a point unsnapped (input
      layer, not baked into model)

### M2 — Intersections
- [x] `docs/intersections.md` design note
- [x] line–line crossing detection
- [x] split sections / insert shared node
- [x] render intersection points — a junction is an ordinary node, so
      `NetworkView` already draws it
- [x] split the edit in two: one call plans it, another applies a plan.
      The plan is immutable and says whether it can be built, so applying
      one implements it rather than re-deciding it — and the tool can ask
      the same question a move earlier, to show what a click would do
- [x] mark every junction the section in progress would create, so the
      whole edit is visible before it is committed — in a color that
      separates a node about to be made from one already there
- [x] show an unfeasible edit in the preview (rubber band in red), so a
      refused section says why nothing happened instead of being silent.
      A refused plan carries its chain, so the preview draws the section
      that was turned down rather than going blank

### M3 — Editing UI
- [x] `docs/ui.md` design note — the controls around the view are a layer
      the project does not have yet: DOM over the canvas rather than
      widgets in the scene, in its own `src/ui/`, so `src/render/` stays
      about the network
- [x] tool palette: a panel of buttons over the canvas, one per tool,
      marking the one that is selected. An entry whose tool does not exist
      yet shows its place and refuses to be picked
- [x] hand the palette the tools: clicking an entry is
      `ToolManager.setActiveTool`, and the palette picks the tool at
      startup, where `main.ts` used to hardcode the one tool there is
- [x] selection tool: click a section to select it, highlighting it and
      the nodes at either end
- [x] click a node to select that instead, highlighting it and every
      section meeting it — but not the nodes at those sections' far ends,
      which are not part of what is selected
- [x] Delete removes the selection: a section on its own, or a node
      together with every section meeting it. Removing the sections is
      the whole of it either way, since `RoadNetwork` discards a node the
      moment its last section leaves

### M4 — Curved sections
- [x] circular-arc section type
- [x] render arc sections, before there is any way to place one by hand —
      an arc is tessellated to a polyline fine enough that no piece strays
      further from the curve than a tolerance in meters, and `main.ts`
      seeds a few so there is something to look at until a tool can place
      one
- [x] select an arc — picking measures against the arc's circle rather than
      the chords it is drawn with, and the marks follow the same shape the
      section is drawn in
- [x] arcs that cross: line–arc and arc–arc intersections, and a cut that
      leaves two arcs rather than two straights
- [x] interactive placement / curvature control

### M5 — Section placement usability

Place sections with less aiming: start one anywhere on the network, and
let the tool work out the curve.

- [x] start or end a section on an existing road, not only on a node. An
      end within a centimeter of a road cuts it; the tools weld onto a road
      within the pick radius, rounded to where it crosses a grid line
- [x] `docs/tools.md` — design note for the smart arc tool (reasoning in
      `docs/ideas/smart-arc.md`), written once the workflow had settled
- [x] smart arc tool: click a node and mark the natural directions a road
      could leave it by, one per section meeting it. No plan yet
- [x] add bisector directions, for branching into the gap between two
      roads
- [x] add perpendicular directions: a pair per section meeting the node,
      so a road can branch off any junction at a right angle
- [x] directions at a start placed on a road rather than a node: the
      road's heading there forward and back, plus the two perpendiculars
- [x] core: the arc through a point, a direction there, and a second point
- [x] place the second point and plan a section per direction, dropping
      the ones that turn further than three quarters of a circle. Full
      `SectionPlan`s, drawn with their junction marks and refusals, but
      passive — nothing is built yet
- [x] choose the direction with a flick: where the cursor first leaves a
      capture circle around the start, wider than the pick radius, locks
      the direction aimed most nearly that way. Only that one is planned
      from then on, out to the cursor, and it plans nothing where it would
      turn too far. The lock is released back inside the pick radius, not
      the capture circle, so a short section keeps its flick. Every
      direction's plan is still there as a debug view, toggled with C
- [x] click to build the planned arc, instead of fixing the far end. It
      chains like the straight tool: the far end starts the next arc, whose
      continuing direction is the tangent of the one just built
- [x] start on open ground, which offers no direction: the flick keeps its
      own heading, rounded to 15°. Replaces fitting the arc to the cursor
      path

### M6 — Backlog cleanup

Deferred cleanups the ribbons would make worse — more layers, more colors,
more drawn on every pointer move — plus the plan version check.

- [x] one named set of ground-plane layer offsets (`src/render/layers.ts`),
      replacing the heights each drawable picked for itself
- [x] the same for the colors (`src/render/colors.ts`). **Color says what
      state something is in; shape, size and layer say what kind of thing
      it is**, so the network's nodes and sections share one color. Five
      states:
      - `EXISTING` `0xdddddd` — the network as it is
      - `AIMED` `0xffdd44` — hovered: what a click would interact with
      - `SELECTED` `0x66ccff` — the selection of an existing item
      - `PLANNED` `0x66ee88` — what the edit would create
      - `REFUSED` `0xff5555` — what it would create, and will not

      The arc tool's chord and control-point marks were dropped rather than
      kept in an in-progress color of their own. Scene colors only —
      `src/ui/toolPalette.css` is a different layer in a different medium
- [x] hover the road an end would weld onto, in every section tool. Each
      tool tells a `SectionHighlight` what to mark, since selecting and
      welding pick by different rules
- [x] stamp `network.version` on a plan and check it before applying, so a
      plan made against a network that has since changed is caught rather
      than half-built. Nothing plans further ahead than the click that
      applies it today; the moment something does — undo, a plan held
      across a tool switch, anything else editing the network — the ids in
      an old plan are already someone else's. A mismatch is a caller bug,
      so it throws rather than refusing: the plan said it was buildable
- [x] stop re-tessellating and rebuilding the aimed mark on every pointer
      move, when it is usually the same section as the move before.
      `SectionHighlight` keeps what it last drew and skips the rebuild for
      the same ids on the same `network.version`

### M7 — Two-lane visuals (stretch)

Roads as single-color ribbons, 8 m wide (a global constant), set back at
junctions and joined there by junction polygons. Visuals only — edits are
still planned as if roads had no width. Geometry:
`docs/ideas/junction-polygon.md`.

- [x] `docs/road-surface.md` design note: how ribbons, setbacks and junction
      polygons fit the architecture. The geometry is linked, not repeated
- [x] rename `tessellate` / `polylineBetween` to `centerline` /
      `centerlineBetween` — a ribbon is a second way to draw a section, not a
      replacement for the line
- [x] draw straight sections as ribbons, overlapping at nodes; arcs not drawn
      yet. The whole mesh is rebuilt when `network.version` changes.
      `EXISTING` becomes an asphalt gray
- [x] draw arcs as ribbons, tessellated along the outer edge; the inner edge
      reuses its angles. `tessellate.ts` cuts every section into slices
      across the road, and the view only fills triangles between them. The
      surface is double-sided, so triangle winding doesn't matter
- [x] `docs/road-layout.md` design note: the network on the ground, a
      junction per node and a roadway per section, derived from the network
      and cached by `RoadLayout`. `docs/road-surface.md` now only draws it
- [x] set straight sections back at junctions, as if no arc were there. The
      setbacks are core geometry, with tests
- [x] set back at junctions with arcs too. Every gap goes through one path:
      cross the two gap-side edges, taken whole (lines, or circles around an
      arc's center). Legs leaving the same way are ordered by curvature.
      Where a network can't be drawn right, the reason is logged
- [x] junction polygon over gaps under 180°. A `Junction` keeps its gaps,
      each with the corner point its edges cross at, and walks them into a
      closed ring of outline pieces; `RoadSurfaceView` fans that from the
      node. A wider gap is closed by a straight between the two corners,
      until the round join replaces it
- [x] round join over gaps wider than 180°
- [x] `RoadLayout` (`docs/road-layout.md`); `RoadSurfaceView` reads through it.
      A junction is worked out once per edit rather than once per reader, and
      the roadways are cut by the very junctions drawn beside them

### M8 — Inspect tool

Roads cover ground now, so picking them by their centerline aims at
something that is no longer what the user sees. Picking goes by the area a
road covers, says so with an outline rather than a wireframe, and the tool
becomes Inspect, with a panel saying what the selected thing is.

- [x] rename the selection tool to Inspect, its class and its palette entry
- [x] `docs/ui.md`: the inspect panel, a second DOM panel, shown while
      Inspect is active
- [ ] the panel itself: holding placeholder content
- [ ] a selected section in the panel: its id, its length from node to node,
      and its roadway's length
- [ ] a selected node: its id and how many sections meet it
- [ ] pick by area: a click inside a roadway picks that section, a click
      inside a junction picks that node
- [ ] keep current logic that within some pixel distance of a road wireframe
      or junction point, they can be always selected, even when zoomed out
- [ ] outline what is selected instead of marking its centerline: a section's
      roadway, a node's junction. Hovered and selected alike. Whether a
      translucent fill goes inside the outline is open, and so is whether a
      selected junction still reaches out to the sections meeting it, as the
      wireframe mark does today
- [ ] `docs/tools.md`: rewrite `## Selection` as `## Inspect` — the tool's
      name, picking by area, outlines instead of centerline marks. Left to
      the end, since every step above changes what the section says

### M9 — Planning using road width

Edits account for road width, and refuse what M7 can only draw wrong — such
as a road too short for the setbacks at its two ends.

- [ ] minimum arc radius of 10 m, global. Fits the 8 m road; once width can
      vary, `max(10 m, w/2)`

## Backlog

Wanted, but not part of a milestone yet.

- [ ] rebuild only what changed in the road surface, and decide how the view
      learns what that is.
- [ ] level of detail for arc tessellation
- [ ] refuse a straight drawn between two points on the same straight road:
      both ends cut the road, and the new section lies on top of the piece
      between them. An arc does the same only if its control point lands on
      the road's own circle
- [ ] straight tool: offer the smart arc tool's directions at the start, and
      pull the section onto one when the cursor is close to it. Unlike an
      arc's, the far end then moves off the cursor, so it needs a guide drawn
      along the direction to show why
- [ ] evaluate a UI framework for `src/ui/`. The panels are hand-written
      DOM, which is fine while they issue commands and starts to hurt when
      one has to reflect model state that changes elsewhere — the first
      panel that displays a selection is when to look. Signal-based ones
      first (Solid, Svelte, or Preact signals): they track which values a
      piece of UI read and update only that, which is the nearest thing on
      the web to a WPF binding. The layer knows nothing of the network,
      Three.js or the tools, so the change would be confined to `src/ui/`
      and a few lines of `main.ts`

## Deferred, probably to be dropped

Written down so the decision is not made again from scratch.

- empty now

## Deferred cleanups

Not blocking anything; do them when they start to bite.

- [ ] weigh `crossing.ts` owning where two shapes meet, not just the
      `Crossing` it already holds, instead of each pairing sitting in the
      module whose shape it names — segment–segment in `segment.ts`, the two
      involving an arc in `arc.ts`, and the dispatch between them in
      `queries.ts`. The cost is that `arc.ts` would have to publish `arcRun`
      and the angular helpers it keeps private, so the question is whether
      that representation is worth being part of the module's face
- [ ] revisit the two intersection tolerances once sections have width —
      how close two junctions may sit follows from how wide the roads are
      (`SAME_POINT_METERS`, `MIN_SECTION_LENGTH_METERS`). A section that
      crosses nothing but passes close by a node needs an answer then too:
      with width it is running into that junction, however clear of it the
      centerlines are
- [ ] decide how shallow a crossing is still a crossing — near-parallel
      sections currently cross like any other, and the junction they make
      moves a long way for a small change in either road
- [ ] stop rebuilding `SectionPlanView`'s geometry on every pointer move.
      Three buffers are disposed and reallocated each time the cursor
      moves, where `NodeHighlight` writes into a preallocated attribute and
      sets `needsUpdate`. The point count is not what costs — the per-move
      churn is, and a fixed-capacity attribute with `setDrawRange` would
      match the neighbors. It bites when a second thing starts redrawing
      per move, or on a machine where this one is already felt
