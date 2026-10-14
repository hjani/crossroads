# User Interface

## Scope

- The controls around the view: DOM elements over the canvas, and which
  tool the user picked.
- DOM only. Anything drawn in the scene belongs elsewhere, however much it
  looks like interface:
  - the network → `docs/rendering.md`
  - edit previews, selection highlights → `docs/tools.md`
  - → this layer is never called an overlay: `Tool.overlay` is scene
    geometry, exactly what this is not.
- Choosing a tool is in scope; what the tool does once chosen is not.
  - A tool can still have a panel here. This layer owns the panel; the tool
    decides what goes in it.

## Tool palette

- A panel of buttons, one per tool, fixed over the canvas.
- Click → that tool becomes active and its button is marked → which tool is
  listening is visible at a glance, not remembered.
- Clicking the tool that is already active does nothing: the tool keeps
  running, and its edit in progress survives. Only a change of tool ends
  an edit.
- A planned but not yet built tool still has its button, shown as
  unavailable: it names the tool and can't be picked.
  - Why: what the program will be able to do is worth showing early, and a
    button that silently did nothing would mislead.
- The canvas stays the full window, never resized or laid out around the
  panel.
  - The panel takes screen space from the view; the screen↔ground
    conversion never learns it is there.
- This layer holds the active tool:
  - it is the only thing that switches tools
  - it picks the tool active at startup → nothing is ever listening that
    the panel doesn't show
  - the tool framework still knows which tool is active, without knowing
    its kind

## Inspect panel

- A second panel, fixed at the top-right, there while the Inspect tool is
  active.
- Says what is selected: a title naming the thing, then rows of label and
  value measuring it.
- Nothing selected → the panel stays, with one line saying so.
  - It would otherwise flicker in and out as the user clicks around, and an
    empty view never shows that the tool reports anything at all.
- Fixed width, and the values in a tabular figure → a number that changes
  moves neither the panel nor the digits beside it.
- Created and removed with the tool → nothing has to track whether it is
  shown. The tool is built when it is activated and disposed when the user
  switches away, which is exactly how long the panel is wanted.
- Knows only a title and rows of text. What to measure, and what to call it,
  is the tool's.
  - → the panel has no idea what a section or a node is, just as the palette
    has no idea what a tool is.
- Same look as the palette, from properties the two stylesheets share → one
  place to change how a panel looks.

## Tool settings

- A tool may show its settings in a panel fixed at the top center, there
  while the tool is active.

## View settings

- A panel fixed at the bottom-left, always there.
- Shows settings related to what's displayed and how.

## Input

- A panel is a sibling of the canvas, not a layer over it → the canvas
  never hears a button click, so it is never also a click in the world.
  - Neither side arbitrates for the other: the same separation as the
    camera and the tools sharing the canvas by mouse button, one level up.
- Keyboard is the exception, since the global bindings listen on the window.
  - A control that kept focus after a click would act again on a key — a
    button fires on Space or Enter, a checkbox toggles on Space → focus is
    dropped as soon as the click is handled.
  - → keys mean the same over the panel as over the canvas.

## Relationship to other modules

- In `src/ui/`. Knows nothing of the road network, Three.js or the tools: a
  panel entry is an id, a label, and something to run when clicked.
- What that something does is wired in `main.ts`, the one place that
  already knows every layer.
- Each module imports its own stylesheet, kept beside it; the bundler
  resolves it like any other import. `index.html` keeps only the page-level
  reset.
