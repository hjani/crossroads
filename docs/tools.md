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
  - Scene decoration and part states (`docs/part-states.md`) only:
    discarded on commit or cancel, nothing of it reaches the model.
- The preview draws the answer the commit will act on, not where the cursor
  is. The tool asks the same question, of the same call, one move earlier,
  and draws:
  - the region the edit changes, laid out on the speculative network
    (`docs/intersections.md`), in place of the live one
    - tinted: the road it would run — its own roadways and the junctions at
      its points — and every part in violation
    - the rest of the region — the halves of a road it cuts — plain
    - a plan refused before speculating has none → a band `w` wide
      along its centerline instead

  - whether the whole of it can be built
  - → what is shown and what a click does can't disagree, and a refused
    edit says so instead of leaving the click silent.
- A refusal is a color, not a disappearance: the section being aimed is
  still shown, as one that won't be built.

### Marking a junction

- A junction can be small, or enclose no ground at all → its tint alone may
  show nothing.
- → a tool marking a junction, or a place one would be made, draws a mark
  around it, in the mark's color.
- Just outside `r`: the junction's bounding circle, about its node.
  - no junction to measure — a place not yet built → `r = w/2`

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

Placing a point works in one of two modes:

- **Snapped**: the normal one.
- **Unsnapped**: while the un-snap modifier is held.

Placement first tries to weld onto an existing node or section, first match wins:

1. within a small pixel radius of a node → that node
2. inside a junction area → the node of the junction
3. inside a roadway → the section of the roadway
4. within a small pixel radius of a section → that section

When welded to a section, the weld point is always on the centerline, at the position:

- when **snapped**: where it crosses the nearest grid line.
- when **unsnapped**: the nearest point of the section

That point may fall inside one of the section's own junctions → welds onto that
node instead.

When no welding, placement is at:

- when **snapped**: the nearest grid point
- when **unsnapped**: the exact cursor position

Units:

- Node pick radius: pixels → it is how close the cursor _looks_ to a node →
  the same target at any zoom.
- Grid pitch: meters, fixed → a grid that changed with zoom would place the
  same click differently depending on the view.

End marks:

- Where a click would land is marked, as a junction ("Marking a junction")
  → a snap or a weld is visible before it is committed.
  - aimed: it welds onto a junction or a roadway
  - otherwise the plan's color: planned, or refused
- A placed end stays marked, in the plan's color → aimed only while it is
  still a choice.
- No plan yet → planned.
- Sized as a new node, also on an existing junction → the same size
  throughout, and the junction may change once the plan is built.
- A click that would do nothing lands nowhere → not marked (see "Refusals").
- Drawn by the tool, not the preview: the plan doesn't know which of its
  ends were welded.

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
- The preview draws the junctions and roadways that were refused, in the
  refused color.
  - Unlike the tool's own refusal above, there is a plan to draw.

None of this reaches the model: it still receives exact positions and ids
of existing nodes, and decides nothing about either.

## Road width

- The section tools build roads according to the settings object, 
  which is shared across the tools.

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
- A plan for every offered direction can be drawn beside it, as a debug view.
  - Displayed as centerlines only.
- A click builds it, and its far end starts the next arc → a run of curves
  joins smoothly without aiming any join.
- Cancel ends the run and keeps what was built.

## Inspect

A tool like any other, and the one that builds nothing: it names what the
cursor is on and measures what is selected. Delete is its only edit.

**What a click catches**

First to answer wins:

1. a node within the pick radius
2. the part of the layout the click is inside → a junction picks its node, a
   roadway its section
3. a section within the pick radius

- Area is the answer; the radii cover what it can't reach.
  - a junction may enclose no ground — two roads meeting in line
  - zoomed out, a road is under a pixel: too thin to aim inside
- The order: a node sits inside its junction, a section's centerline runs on
  through it → asked on distance first, either would steal the junction's
  clicks.
- Radius in pixels, its own number, not the one the section tools weld
  within.
- Measured against the model and the layout, never the drawn pieces.
- What a click would catch is marked before the click → mark and click can't
  disagree.
- Clicking clear of everything selects nothing. Cancel drops it too.

**Marks**

- The thing is marked by its area, tinted: a node its junction, a section
  its roadway → what is tinted is what a click there picks.
  - A node also gets a junction mark ("Marking a junction") → one enclosing
    no ground still shows.
- Aimed and selected alike mark the thing alone → they differ by color only.
- The aimed mark is dropped while it is exactly the selection.
  - a section meeting the selected node is still marked: clicking it would
    change the selection
- A selection is tool state → it doesn't survive a tool switch.

**What the panel says**

- Node → its id, how many sections meet it.
- Section → its id, its length, its roadway's length, its radius (a straight
  has none).
- The panel is `docs/ui.md`'s; what is worth measuring is this tool's.

**Deleting**

- Removes the selection, and whatever the model held only for its sake:
  - section → itself, plus an end node only where this was its last section
  - node → every section meeting it, plus each far end under the same rule
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
