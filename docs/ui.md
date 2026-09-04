# User Interface

## Scope

The controls around the view: elements built as DOM over the canvas, and the
state of which tool the user picked.

Only the DOM ones. Anything drawn in the scene belongs elsewhere however
much it looks like interface — the network is `docs/rendering.md`, a preview
of an edit or a selection highlight is `docs/tools.md`. It is also why this
layer is never called an overlay: `Tool.overlay` is scene geometry, the very
thing this is not.

What a tool does once chosen is not part of this either. Choosing it is.

## What it does

A panel of buttons, one per tool, sits fixed over the canvas. Clicking one
makes that tool the active one and marks the button, so which tool is
listening is readable at a glance rather than remembered.

Clicking the tool that is already active is not a switch, and nothing
happens: the tool goes on running, and an edit it had in progress survives
the click. Only a change of tool ends one.

A tool that is planned but not built yet still has its place in the panel,
shown as unavailable: the entry names it and refuses to be picked. What the
program will be able to do is worth showing before it can do it, and a
button that silently did nothing would say the wrong thing.

The panel is fixed over the canvas, which stays the full window and is never
resized or laid out around. It takes screen space from the view, not from
the viewport's idea of its own size — nothing in the screen↔ground
conversion learns that the panel is there.

Which tool is active is this layer's to hold. It is the only thing that ever
switches tools, and it picks the one active at startup, so nothing is ever
listening that the panel is not showing. The tool framework goes on knowing
which tool is active without knowing which kind it is.

## Input

The panel is a sibling of the canvas, not a layer over it: a click on a
button is never also a click in the world, because the canvas never hears
it. Neither side arbitrates for the other — the same separation as the
camera and the tools sharing the canvas by mouse button, one level up.

Keyboard is the exception, since the global bindings listen on the window. A
button that kept focus after being clicked would fire again on Space or
Enter, so focus is dropped as soon as the click is acted on, and the keys go
on meaning over the panel what they mean over the canvas.

## Relationship to other modules

Lives in `src/ui/`. Knows nothing of the road network, of Three.js, or of
the tools themselves: an entry in the panel is an id, a label, and something
to run when it is clicked. What that something does is wired in `main.ts`,
the one place that already knows every layer.

Each module here carries its own stylesheet beside it and imports it; the
bundler resolves that like any other import. `index.html` keeps only the
page-level reset.
