# CrossRoads — Progress

Quick status for picking up where we left.

## Current status

M0 through M4 are done — M3 came ahead of the curves because a second tool
needs a way to be chosen, and because nothing could be deleted. Current:
**M5 — Placing sections**
Next step: start or end a section on an existing road, which the smart arc
tool then builds on

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

- [ ] start or end a section on an existing road, not only on a node
- [ ] `docs/tools.md` — design note for the smart arc tool (reasoning in
      `docs/ideas/smart-arc.md`)
- [ ] smart arc tool: click a node and mark the directions a road could
      leave it by, one per section meeting it. No plan yet
- [ ] add bisector directions, for branching into the gap between two
      roads
- [ ] add perpendicular directions at a node with a single section
- [ ] add the plain straight as a direction of its own, for a fork at any
      angle
- [ ] directions at a start placed on a road rather than a node: the
      road's heading there forward and back, plus the two perpendiculars.
      Needs a section's tangent at a fraction
- [ ] core: the arc through a point, a direction there, and a second point
- [ ] place the second point and plan a section per direction, the ones
      aimed away from it dropped. Full `SectionPlan`s, drawn with their
      junction marks and refusals, but passive — nothing is built yet
- [ ] hovering a planned arc marks it as the one a click would build
- [ ] click a planned arc to build it
- [ ] directions from the far end as well as the start, drawn dimmer
- [ ] optional: fit the arc to the cursor path, for when neither end
      offers a direction

### M6 — Two-lane visuals (stretch)
- [ ] extrude road ribbons from centerlines

## Backlog

Wanted, but not part of a milestone yet.

- [ ] level of detail for arc tessellation
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

- [ ] a modifier that fixes the sweep at a quarter circle, deriving the
      control point instead of placing it: two such arcs exist between the
      ends, and the one on the cursor's side of the chord is planned
- [ ] the arc tool should not chain. Placing the control point commits the
      arc and drops straight back into the chord, with the far end already
      standing as the next start; it should return to the state it began in

## Deferred cleanups

Not blocking anything; do them when they start to bite.

- [ ] weigh a `crossings.ts` owning where two shapes meet, instead of each
      pairing sitting in the module whose shape it names — segment–segment
      in `segments.ts`, the two involving an arc in `arcs.ts`, and the
      dispatch between them in `queries.ts`. The cost is that `arcs.ts`
      would have to publish `arcRun` and the angular helpers it keeps
      private, so the question is whether that representation is worth
      being part of the module's face
- [ ] one named set of ground-plane layer offsets, replacing the heights
      each drawable picks for itself (`NetworkView`, `SectionPlanView`,
      `NodeHighlight`, `SectionHighlight`). Eight of them now, and which
      sits above which is the whole point. Worth doing with the colors
      below: same complaint, same files
- [ ] the same for the colors, which each drawable also picks for itself.
      The rule the scene is heading for: **color says what state something
      is in; shape and size say what kind of thing it is.** Color is the
      scarcer channel and state is what has to be readable at a glance,
      so a node does not also need its own hue — it is a fat point on a
      layer above the lines. Six states:
      - `EXISTING` `0xdddddd` — the network as it is
      - `AIMED` `0xffdd44` — what a click would land on or act on
      - `SELECTED` `0x66ccff`
      - `IN_PROGRESS` `0xcc88ff` — a gesture with no verdict yet
      - `PLANNED` `0x66ee88` — what the edit would create
      - `REFUSED` `0xff5555` — what it would create, and will not

      `SelectionTool` already names its two this way, pending a shared
      home for all five. One remapping is a decision rather than
      bookkeeping. The mark on where a click lands already takes the plan's
      two node colors, so it follows whatever those become — and
      `SectionPlanView`'s existing-node marks become `AIMED` rather than
      `EXISTING`: they
      are the nodes a chain would weld onto, and `EXISTING` would erase
      the made-vs-met distinction those marks exist for. What it costs is
      the nodes' orange — they become `EXISTING` like the sections,
      leaving size and layer to keep a busy junction legible. That is the
      thing to look at when it lands; the fallback is a brighter tone for
      nodes *within* the class rather than another color. Scene colors
      only — `src/ui/toolPalette.css` is a different layer in a different
      medium
- [ ] revisit the two intersection tolerances once sections have width —
      how close two junctions may sit follows from how wide the roads are
      (`SAME_POINT_METERS`, `MIN_SECTION_LENGTH_METERS`). A section that
      crosses nothing but passes close by a node needs an answer then too:
      with width it is running into that junction, however clear of it the
      centerlines are
- [ ] decide how shallow a crossing is still a crossing — near-parallel
      sections currently cross like any other, and the junction they make
      moves a long way for a small change in either road
- [ ] stamp `network.version` on a plan and check it before applying, so a
      plan made against a network that has since changed is caught rather
      than half-built. Nothing plans further ahead than the click that
      applies it today; the moment something does — undo, a plan held
      across a tool switch, anything else editing the network — the ids in
      an old plan are already someone else's. A mismatch is a caller bug,
      so it throws rather than refusing: the plan said it was buildable
- [ ] stop re-tessellating and rebuilding the aimed mark on every pointer
      move, when it is usually the same section as the move before
- [ ] stop rebuilding `SectionPlanView`'s geometry on every pointer move.
      Three buffers are disposed and reallocated each time the cursor
      moves, where `NodeHighlight` writes into a preallocated attribute and
      sets `needsUpdate`. The point count is not what costs — the per-move
      churn is, and a fixed-capacity attribute with `setDrawRange` would
      match the neighbors. It bites when a second thing starts redrawing
      per move, or on a machine where this one is already felt
