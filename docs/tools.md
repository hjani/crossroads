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

A tool taking several points has a stage where there is not yet an edit to
ask about. What it draws there is neither of those two answers, and takes a
color of its own to say so.

A tool has to expect the camera to move at any moment, unannounced and
between any two events it hears — panning and zooming are not its own and
happen whatever it is in the middle of.

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
node, so the two sections meet at one shared point. Failing that, a point
within a small radius of a road lands on it, where the road crosses the
nearest grid line. Anywhere else it is rounded to a grid. Welding wins
where both could apply: a grid point is never a join, and a road that
reaches an existing one should meet it.

Unsnapped, nothing is rounded but welding still applies: a point near a
node is that node, near a road it is the nearest place on the road, and
anywhere else it is the exact position under the cursor. A point near the
network that must not join it is placed by zooming in.

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

## Placing an arc

An arc is placed with three points: its two ends, and then the position it
passes through between them. The ends come first so the last point changes
only how the road bends — and since the arc is built through that position,
it runs under the cursor placing it.

The third point is not an endpoint. It snaps to the grid and unsnaps with
the modifier like any other placed point, but it never welds onto a node
or a road:
it settles the shape rather than marking a place on the road.

There is no section to plan until the third point is placed, so what is
drawn before that takes the in-progress color. After it the plan is drawn
like any other — planned where it can be built, refused where it cannot,
three points in a line among the refusals for having no circle through
them.

Cancelling drops the whole arc rather than stepping back a point.

## Selection

Selecting is a tool like any other, and while it is active nothing is
built: it reads the network and changes none of it.

A click catches a node or a section: the nearest node within the node pick
radius, or failing that the nearest section within a radius of its own —
distance to the road as it runs, so a click beside the middle of a long one
finds it, and a click past either end falls back to being near that end.
That distance is measured against the shape the model holds, not against
the pieces the section is drawn with, so what a click catches does not
depend on how finely anything was drawn. Both radii are in pixels, for the
same reason the welding one is: how close the cursor *looks* to something
should not change with the zoom.

A node wins outright rather than the two being weighed on distance. It
sits on the sections meeting it, so on distance it would never be the
nearer thing — and the end of a section is where most of the reasons to
click one are.

What a click would catch is marked before the click, the same rule that
marks where a point would land and draws what an edit would do. It is the
same question asked a move earlier, so the mark and the click cannot
disagree. Clicking clear of everything selects nothing, which is how a
selection is dropped without leaving the tool; cancelling drops it too.

A selected section marks itself and the nodes at either end. A selected
node marks itself and every section meeting it — but not the nodes at
those sections' far ends, which are where the selection stops rather than
part of it. The aimed mark is that thing alone: a section is the road, a
node the one mark. So what is selected is told from what is under the
cursor twice over — by color, and by only a selection reaching past the
thing it names. Either mark on a section follows the shape that section is
drawn in, so it sits on the road rather than beside it.

What is aimed at goes unmarked while it is exactly what is selected, there
being nothing worth painting over the selection to say. A section meeting
the selected node is still marked, since clicking it would change the
selection.

A selection is a tool's own state, so it does not survive a tool switch,
like anything else a tool is holding.

Deleting removes what is selected, and with it whatever the model is left
holding for its sake alone. A section goes on its own, taking an endpoint
only where that was its last section; a node takes every section meeting
it, and the far end of each of those where the same rule applies. So what
is deleted is exactly what the selection marked, plus the nodes that were
only there because of it. Nothing else is touched — a node left with two
sections and a kink where a junction used to be is a node like any other.

The selection is empty afterwards, since what it named is gone. What the
cursor is aimed at is asked again without it having moved, deleting being
one of the ways the answer changes underneath it.

## Input bindings

- Left button — the active tool.
- Right button — pan. The browser context menu is suppressed.
- Escape — cancel the edit in progress.
- Delete, Backspace — remove the selection.
- Ctrl, held — place the point without rounding it; welding still applies.

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
