# CrossRoads — Progress

Quick status for picking up where we left.

## Current status

M0, M1 and M2 are done. Current: **M3 — Editing UI**, which arrived ahead
of the curves because a second tool needs a way to be chosen, and because
nothing can be deleted yet. Then **M4 — Curved sections**
Next step: `docs/ui.md` design note

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
- [ ] `docs/ui.md` design note — chrome is a layer the project does not
      have yet: DOM over the canvas rather than widgets in the scene, in
      its own `src/ui/`, so `src/render/` stays about the network
- [ ] tool palette: choose the active tool by clicking it, which is
      `ToolManager.setActiveTool` and nothing more. `main.ts` currently
      hardcodes the one tool there is
- [ ] selection tool: click a section to select it, highlighting it and
      the nodes at either end
- [ ] click a node to select that instead, highlighting it and every
      section meeting it — but not the nodes at those sections' far ends,
      which are not part of what is selected
- [ ] Delete removes the selection: a section on its own, or a node
      together with every section meeting it. Removing the sections is
      the whole of it either way, since `RoadNetwork` discards a node the
      moment its last section leaves

### M4 — Curved sections
- [ ] circular-arc section type
- [ ] interactive curvature control
- [ ] extend intersection detection to arcs

### M5 — Two-lane visuals (stretch)
- [ ] extrude road ribbons from centerlines

## Backlog

Wanted, but not part of a milestone yet.

Nothing right now — the inspection tool moved into M3 as the selection
tool.

## Deferred cleanups

Not blocking anything; do them when they start to bite.

- [ ] one named set of ground-plane layer offsets, replacing the heights
      each drawable picks for itself (`NetworkView`, `SectionPlanView`,
      `NodeHighlight`). Six of them now, and which sits above which is
      the whole point — a selection highlight has to find its own place
      among them, so M3 is when this bites
- [ ] the same for the colors, which each drawable also picks for itself.
      An edit has a rule — green for what it would create, red for what
      it would create but cannot, blue for what is already there — and
      the rule lives only in comments. `NodeHighlight` does not follow
      it either: it is blue on a grid point, where nothing exists yet
- [ ] revisit the two intersection tolerances once sections have width —
      how close two junctions may sit follows from how wide the roads are
      (`SAME_POINT_METERS`, `MIN_SECTION_LENGTH_METERS`). A section that
      crosses nothing but passes close by a node needs an answer then too:
      with width it is running into that junction, however clear of it the
      centerlines are
- [ ] decide how shallow a crossing is still a crossing — near-parallel
      sections currently cross like any other, and the junction they make
      moves a long way for a small change in either road
