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

The preview is not a sketch of where the cursor is but a drawing of the
answer the commit will act on. A tool asks what the edit would do — the
same question, of the same call, one move earlier — and draws that: the
road it would run, every junction it would create, every node already
there that it would meet, and whether the whole of it can be built. So
what is shown and what a click does cannot disagree, and an edit that
would be refused says so instead of leaving the click silent.

Which is why a refusal is a color and not a disappearance. The preview
still shows the section being aimed; it shows it as one that will not be
built.

Switching tools cancels whatever the old one had in progress and takes its
preview off the screen. A tool leaves behind neither state nor geometry
once it is no longer active.

Where a click lands is decided here. Positions reach the model exactly as
the tool intends them, so welding a point onto an existing node, or
snapping it to a grid, is this layer's decision and never the model's.

## Snapping

A point is placed in one of two modes. Snapped is the normal one; holding
the un-snap modifier gives the other for as long as it is held, so the
choice is made per point rather than set and forgotten.

Snapped, a point within a small radius of an existing node becomes that
node, so the two sections meet at one shared point. Anywhere else it is
rounded to a grid. Welding wins where both could apply: a grid point is
never a join, and a road that reaches an existing one should meet it.

Unsnapped, a point is the exact position under the cursor — over a node
as much as anywhere else. Nothing welds and nothing rounds, which is what
makes a position that no rule would produce reachable at all. The price
is that a join cannot be made in this mode; releasing the modifier is how
one is.

The node pick radius is a distance in pixels, not meters: it is how close
the cursor looks to a node, so it is the same target however far the view
is zoomed in. The grid pitch is the opposite — a distance in meters,
fixed, because a grid that changed size with the zoom would place the same
click differently depending on the view it was made from.

Where a click would land is marked whenever that is not simply the
cursor's own position, so a snap is visible before it is committed.
Unsnapped there is nothing to mark: the cursor is already the answer. The
mark is for when there is no edit to draw instead — once there is, the
preview covers the same ground and more, since where the click would land
is the last point of what it would build.

A tool never builds a section that starts and ends in the same place. It
refuses a cursor that has not left the start's node pick radius, measured
from the cursor rather than between the resolved endpoints: zoomed far
out, the radii of neighboring nodes overlap, and a cursor still on top of
the start is not a section however it snapped. Nothing is built and the
edit stays in progress.

This one refusal is the tool's alone, and it is not an edit that would
fail — it is the absence of one to ask about. Nothing is planned and
nothing is previewed, which is what separates it on screen from a section
that was aimed somewhere and turned down.

That is all the tool judges about a section's length, and it judges it in
pixels: whether the user has aimed anywhere yet. A point that resolves to
where the section started — the same node, or the same grid point — needs
no rule here, being a section of no length, which is refused for what it
would build.

A section can also be refused for being too short to be a road, or for
what it would cross — see `docs/intersections.md`, which decides both.
Nothing is built, and the edit stays in progress so the click can be made
again somewhere it works. Unlike the tool's own refusal above, there is a
plan behind this one, describing the section that was asked for, so the
preview can show what was refused rather than only that something was.

None of this reaches the model. It still receives exact positions and ids
of nodes that already exist, and decides nothing about either.

## Input bindings

- Left button — the active tool.
- Right button — pan. The browser context menu is suppressed.
- Escape — cancel the edit in progress.
- Ctrl, held — place the point exactly under the cursor, without snapping.

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
