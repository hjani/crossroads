# Network Rendering

## Scope

- Makes the road network visible, kept in step with the model as it is edited.
- Not in scope: hit-testing, hover and selection highlights, previews of a
  section being drawn. Those belong to the tool layer, even though they draw
  into the same scene.

## What it does

- Draws the whole network: every section along its shape, every node as a
  point. A node shared by several sections is one point.
- Straight → the line between its ends.
- Arc → a run of short straight pieces, none further from the true arc than
  a stated tolerance.
  - The tolerance is in meters, not pixels → the drawing follows from the
    network alone → rebuilt on an edit and on nothing else.
- Working out that shape is shared with anything else that draws a section.
  - A tool marking a section gets the same positions at the same tolerance
    → the mark follows the road instead of cutting across it.
  - What a mark means, and when it is shown, stays the tool's.
- Follows the model: any edit shows up without the editor saying what
  changed. An unedited network costs nothing per frame.
- Lines and points sit a hair above the ground plane → no z-fighting with
  the reference grid.
- Thickness is constant in screen space: zooming doesn't thicken the
  network.

## Relationship to other modules

- In `src/render/`. Reads the road network, never edits it; all mutation
  goes through the editing tools.
- The only layer that knows both the core model and Three.js → the core
  stays free of Three.js.
- Driven from `main.ts`, which owns the scene, camera and render loop.
- Owns only its own scene objects and the GPU resources behind them, and
  releases them when they are replaced.
- Learns that the model changed from the version counter, not by being told:
  - → the editing tools have no duty to notify a view
  - → room for more than one view of the same network (road ribbons,
    intersection markers), none of them an extension of this one
