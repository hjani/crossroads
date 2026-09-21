# Editing Tools

## Scope

- Turns pointer input into edits of the road network: the framework
  (which tool is active, what it hears) and the tools themselves.
- Not in scope:
  - camera navigation: not a tool, available whatever is being edited →
    `docs/camera-controls.md`
  - drawing the network → `docs/rendering.md`. Drawing a preview of an edit
    in progress _is_ in scope.

## What it does

- Exactly one tool is active at a time. It receives pointer and key input,
  decides what the user meant, and edits the network. Nothing else edits
  the network.
- Input arrives in screen pixels, as the browser reports it.
  - The tool is also given its viewport (camera + canvas), with conversion
    both ways between pixels and the XZ ground plane → that math is written
    once, not per tool.
  - A tool works in the space the decision belongs to:
    - road endpoint → position on the ground
    - pick radius, drag threshold → pixels, must not change with zoom
- Presses, moves and releases arrive separately, not as finished clicks → a
  tool can act on a drag (moving a node, dragging out a curve) without the
  framework guessing the gesture.
- Where a click lands is decided here. The model gets positions exactly as
  the tool intends → welding onto a node and snapping to a grid are this
  layer's decisions, never the model's.

### Preview

- A tool may draw a preview of the edit it is building: a rubber-band
  section, a highlighted node.
  - Scene decoration only: discarded on commit or cancel, nothing of it
    reaches the model.
- The preview draws the answer the commit will act on, not where the cursor
  is. The tool asks the same question, of the same call, one move earlier,
  and draws:
  - the road it would run
  - every junction it would create
  - every existing node it would meet
  - whether the whole of it can be built
  - → what is shown and what a click does can't disagree, and a refused
    edit says so instead of leaving the click silent.
- A refusal is a color, not a disappearance: the section being aimed is
  still shown, as one that won't be built.

### Keeping up with the view

- The camera can move between any two events a tool hears: panning and
  zooming aren't the tool's, and happen whatever it is in the middle of.
- A camera move, or a modifier pressed with the cursor standing still,
  changes what is under the cursor with no pointer event to say so.
- → the framework notifies the active tool after every event it hands it
  and after every change of view, with where the pointer was last seen and
  which modifiers are held.
  - It only reports that something happened. What that means (usually a
    redraw) is the tool's to decide.

### Switching tools

- Cancels whatever the old tool had in progress and takes its preview off
  the screen.
- An inactive tool leaves behind no state and no geometry.

## Snapping

Each point is placed in one of two modes:

- **Snapped**: the normal one.
- **Unsnapped**: while the un-snap modifier is held → chosen per point, not
  set and forgotten.

Snapped, first match wins:

1. within a small radius of a node → that node (the sections share one
   point)
2. within a small radius of a road → on the road, where it crosses the
   nearest grid line
3. anywhere else → rounded to the grid

- Welding beats the grid: a grid point is never a join, and a road that
  reaches an existing one should meet it.

Unsnapped, nothing is rounded, but welding still applies:

- near a node → that node
- near a road → the nearest place on the road
- anywhere else → the exact position under the cursor
- A point near the network that must not join it → zoom in to place it.

Units:

- Node pick radius: pixels → it is how close the cursor _looks_ to a node →
  the same target at any zoom.
- Grid pitch: meters, fixed → a grid that changed with zoom would place the
  same click differently depending on the view.

Landing mark:

- Where a click would land is marked whenever that isn't just the cursor
  position → a snap is visible before it is committed.
- Unsnapped → nothing to mark: the cursor is already the answer.
- Only while there is no edit to draw. Once there is, the preview covers it:
  where the click lands is the last point of what it would build.

### Refusals

**The tool's own: the cursor hasn't left the start.**

- A tool never builds a section that starts and ends in the same place. It
  refuses a cursor still inside the start's node pick radius.
  - Measured from the cursor, not between the resolved endpoints: zoomed far
    out, the radii of neighboring nodes overlap, and a cursor still on the
    start is not a section however it snapped.
- Nothing is built; the edit stays in progress.
- Not an edit that would fail, but no edit to ask about → nothing planned,
  nothing previewed. That is how it differs on screen from a section that
  was aimed and turned down.
- The only length the tool judges, in pixels: has the user aimed anywhere
  yet.
  - A point resolving to the start (same node, same grid point) needs no
    rule here: a section of no length is refused for what it would build.

**From `docs/intersections.md`: too short to be a road, or what it would
cross.**

- Nothing is built; the edit stays in progress so the click can be made
  again somewhere it works.
- Unlike the tool's own refusal, there is a plan behind it, describing the
  section asked for → the preview shows what was refused, not only that
  something was.

None of this reaches the model: it still receives exact positions and ids
of existing nodes, and decides nothing about either.

## Placing an arc

- Three points: the two ends, then a position the arc passes through.
  - Ends first → the last point only changes how the road bends, and since
    the arc is built through it, it runs under the cursor placing it.
- The third point is not an endpoint:
  - it snaps to the grid and unsnaps with the modifier like any other point
  - it never welds onto a node or a road: it sets the shape, not a place on
    the road
- Before the third point there is no section to plan → only the ends are
  marked.
- After it → the plan is drawn like any other: planned where buildable,
  refused where not. Three points in a line are refused: no circle through
  them.
- Cancel drops the whole arc, not the last point.

## Placing a smart arc

Why: a three-point arc meets the roads at its ends at whatever angle its
points give → a smooth join has to be hunted for by eye. The smart arc takes
its direction from its start: the join is given, only the far end is left to
place.

- A click places the start, by the same rules as any section end.
- The start offers the directions a road would naturally leave it by:
  - at a node: each road carried on past it, the middle of each gap between
    roads, square to each road
  - along a road: its heading both ways, square to it
  - on open ground: none
- The cursor is the far end; a flick picks the direction:
  - where the cursor first leaves a capture circle around the start (wider
    than the pick radius) → the offered direction nearest the way it went
  - on open ground → that way itself, rounded to 15°
  - the pick holds until the cursor is back inside the pick radius → a short
    road keeps it
  - no pick yet → nothing planned
- The road leaving the start in the picked direction and reaching the far
  end is planned and drawn like any other edit, unless it would turn more
  than ¾ of a circle.
- A click builds it, and its far end starts the next arc → a run of curves
  joins smoothly without aiming any join.
- Cancel ends the run and keeps what was built.

## Selection

A tool like any other. While it is active nothing is built: it reads the
network and changes none of it.

**What a click catches**

- The nearest node within the pick radius; failing that, the nearest
  section within the same radius.
  - Distance to the road as it runs → a click beside the middle of a long
    section finds it; a click past either end falls back to being near that
    end.
  - Measured against the shape the model holds, not the drawn pieces → what
    a click catches doesn't depend on how finely anything was drawn.
  - Radius in pixels, like the welding one: how close the cursor _looks_
    should not change with zoom.
- A node wins outright, not weighed on distance:
  - it sits on its sections, so on distance it would never be the nearer
    thing
  - a section's end is where most reasons to click one are
- What a click would catch is marked before the click: the same question
  asked one move earlier, like the landing mark and the edit preview → mark
  and click can't disagree.
- Clicking clear of everything selects nothing → drops the selection
  without leaving the tool. Cancel drops it too.

**Marks**

- Selected section → itself + the nodes at both ends.
- Selected node → itself + every section meeting it, but not the nodes at
  those sections' far ends (the selection stops there).
- Aimed → the thing alone: a section is the road, a node its one mark.
- → selected and aimed differ twice over: by color, and by only a selection
  reaching past the thing it names.
- Either mark on a section follows the shape it is drawn in → it sits on the
  road, not beside it.
- The thing itself also gets its area tinted in the mark's color: a node its
  junction, a section its roadway.
  - The thing alone, even for a selection → what is tinted is exactly what
    a click there picks.
  - On top of the lines, not instead of them: zoomed out, a road is under a
    pixel and only the lines still show.
- The aimed thing is unmarked while it is exactly the selection: nothing
  worth painting over it.
  - A section meeting the selected node is still marked: clicking it would
    change the selection.
- A selection is tool state → it doesn't survive a tool switch.

**Deleting**

- Removes the selection, and whatever the model held only for its sake:
  - section → itself, plus an end node only where this was its last section
  - node → every section meeting it, plus each far end under the same rule
- → deleted = exactly what the selection marked + the nodes that were only
  there because of it.
- Nothing else is touched: a node left with two sections and a kink where a
  junction used to be is a node like any other.
- Afterwards the selection is empty, and what the cursor aims at is asked
  again without the cursor moving (deleting changes the answer underneath
  it).

## Input bindings

- Left button: the active tool.
- Right button: pan. The browser context menu is suppressed.
- Escape: cancel the edit in progress.
- Delete, Backspace: remove the selection.
- Ctrl, held: place the point without rounding it; welding still applies.
- C: smart arc, show the plan for every offered direction (debug view).
- Middle button: unclaimed, kept for an orbiting camera later.
- Panning works mid-edit: start a section, move the view, finish it.

## Relationship to other modules

- In `src/input/`, next to the camera controls it shares the canvas with.
  - Both listen to the same element; neither arbitrates for the other.
    They are separated by mouse button.
- Reads and edits the core model through its public API only, with no
  special access. Edits are ordinary calls → the model stays gridless.
- Previews are Three.js objects, built by `src/render/` and owned by the
  tool showing them.
- `main.ts` gives this layer the camera, the canvas and a place in the
  scene. Nothing else connects the two.
