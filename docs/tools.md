# Editing Tools

## Scope

The layer that turns pointer input into edits of the road network: the
framework that decides which tool is active and what it hears, and the
tools themselves.

Camera navigation is not a tool — it stays available whatever is being
edited, and is described in `docs/camera-controls.md`. Drawing the network
itself is not part of this either (`docs/rendering.md`); drawing a preview
of an edit in progress is.

## What it does

Exactly one tool is active at a time. It receives pointer and key input,
decides what the user meant, and applies the result to the network. The
network is edited from nowhere else.

Input reaches a tool in screen pixels, as the browser reports it. A tool
is also given the viewport it is working in — the camera and the canvas —
and with it a conversion in both directions between a pixel position and a
point on the XZ ground plane, so that math is written once rather than per
tool. A tool then works in whichever space the decision belongs to: a road
endpoint is a position on the ground, while a pick radius or a drag
threshold is a distance in pixels, and must not change with zoom.

Presses, moves and releases arrive separately rather than as finished
clicks, so a tool can act on a drag — moving a node, dragging out a curve
— without the framework having to guess which gesture was meant.

A tool may draw a preview of the edit it is building: a rubber-band
section, a highlighted node. It is scene decoration, discarded when the
edit is committed or cancelled, and nothing about it reaches the model.

Switching tools cancels whatever the old one had in progress and takes its
preview off the screen. A tool leaves behind neither state nor geometry
once it is no longer active.

Where a click lands is decided here. Positions reach the model exactly as
the tool intends them, so welding a point onto an existing node, or
snapping it to a grid, is this layer's decision and never the model's.

## Snapping

An endpoint placed within a small radius of an existing node becomes that
node, so the two sections meet at one shared point. Outside that radius
it is the exact position under the cursor — the network stays gridless,
and nothing rounds a position that was not deliberately snapped.

The radius is a distance in pixels, not meters. It is how close the
cursor looks to a node, so it is the same target however far the view is
zoomed in.

The node an endpoint would weld to is shown while the cursor is near it,
before the first click as well as during an edit in progress, so where a
click will land is visible before it is made.

A tool never builds a section that starts and ends in the same place. The
test is the cursor's distance from where the section started, not the
distance between the two endpoints it resolved to: zoomed far out, the
radii of neighboring nodes overlap, and a cursor still within reach of
the start is refused even when another node is also in range. Nothing is
built and the edit stays in progress. This is the tool's judgement to
make — the model rejects a section between one node and itself, but
accepts a zero-length one between two coincident nodes.

None of this reaches the model. It still receives exact positions and ids
of nodes that already exist, and decides nothing about either.

## Input bindings

- Left button — the active tool.
- Right button — pan. The browser context menu is suppressed.
- Escape — cancel the edit in progress.

Middle-button gestures stay unclaimed, for an orbiting camera later.

Panning is available mid-edit, so a section can be started, the view
moved, and the section finished.

## Relationship to other modules

Lives in `src/input/`, next to the camera controls it shares the canvas
with. Both listen to the same element and neither arbitrates for the
other — they are separated by which button they respond to.

Reads and edits the core model through its public API, with no special
access to it. Edits arrive as ordinary calls, which is what keeps the
model gridless.

Previews are Three.js objects, built by `src/render/` and owned by the
tool that shows them. `main.ts` gives this layer the camera, the canvas
and a place in the scene, and nothing else connects the two.
