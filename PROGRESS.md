# CrossRoads — Progress

Quick status for picking up where we left.

## Current status

M0 and M1 are done. Next up: **M2 — Intersections**
Next step: line–line crossing detection

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
- [ ] line–line crossing detection
- [ ] split sections / insert shared node
- [ ] render intersection points

### M3 — Curved sections
- [ ] circular-arc section type
- [ ] interactive curvature control
- [ ] extend intersection detection to arcs

### M4 — Two-lane visuals (stretch)
- [ ] extrude road ribbons from centerlines

## Deferred cleanups

Not blocking anything; do them when they start to bite.

- [ ] one named set of ground-plane layer offsets, replacing the heights
      each drawable picks for itself (`NetworkView`, `SectionPreview`,
      `NodeHighlight`) — worth doing when the next overlay is added
