# CrossRoads — Progress

Quick status for picking up where we left.

## Current status

M0, M1 and M2 are done. Next up: **M3 — Curved sections**
Next step: `docs/` design note for the arc section type

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

### M3 — Curved sections
- [ ] circular-arc section type
- [ ] interactive curvature control
- [ ] extend intersection detection to arcs

### M4 — Two-lane visuals (stretch)
- [ ] extrude road ribbons from centerlines

## Backlog

Wanted, but not part of a milestone yet.

- [ ] show an unfeasible edit in the preview (rubber band in red), so a
      refused section says why nothing happened instead of being silent
- [ ] mark every junction the section in progress would create, so the
      whole edit is visible before it is committed — in a color that
      separates a node about to be made from one already there
- [ ] inspection tool: select a node and highlight every section meeting
      at it

## Deferred cleanups

Not blocking anything; do them when they start to bite.

- [ ] one named set of ground-plane layer offsets, replacing the heights
      each drawable picks for itself (`NetworkView`, `SectionPreview`,
      `NodeHighlight`) — worth doing when the next overlay is added
- [ ] revisit the two intersection tolerances once sections have width —
      how close two junctions may sit follows from how wide the roads are
      (`SAME_POINT_METERS`, `MIN_SECTION_LENGTH_METERS`). A section that
      crosses nothing but passes close by a node needs an answer then too:
      with width it is running into that junction, however clear of it the
      centerlines are
- [ ] decide how shallow a crossing is still a crossing — near-parallel
      sections currently cross like any other, and the junction they make
      moves a long way for a small change in either road
