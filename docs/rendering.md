# Network Rendering

## Scope

Turning the road network into something visible: sections drawn as lines,
nodes drawn as points, kept in step with the model as it is edited.

Hit-testing, hover and selection highlighting, and previews of a section
being drawn are not part of it. Those belong to the tool layer, even though
they will draw into the same scene.

## What it does

The whole network is drawn: every section along the shape it has, every
node as a point. A node shared by several sections shows as one point.

A straight section is the line between its endpoints. An arc is drawn as a
run of short straight pieces standing in for the curve, enough of them that
none strays further from the true arc than a stated tolerance. That
tolerance is a distance on the ground rather than on screen, so what is
drawn follows from the network alone — the same reason the drawing is
rebuilt on an edit and on nothing else.

The drawing follows the model. Any edit is reflected without the editor
having to say what changed, and an unedited network costs nothing per
frame.

Lines and points sit a hair above the ground plane, so they are not lost to
z-fighting with the reference grid. Their apparent thickness is constant in
screen space — zooming does not thicken the network.

## Relationship to other modules

Lives in `src/render/`. Reads the road network and never edits it; all
mutation goes through the editing tools. The core model stays free of
Three.js, and this layer is the only place that knows both.

It is driven from `main.ts`, which owns the scene, camera and render loop.
The view owns only its own scene objects and the GPU resources behind them,
and releases them when they are replaced.

It learns that the model changed from the version counter, not from being
told. That keeps the editing tools free of any obligation to notify a view,
and leaves room for more than one view of the same network — road ribbons,
intersection markers — none of which is an extension of this one.
