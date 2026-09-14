# Camera Controls

## Scope

- Viewport navigation only: moving and zooming the top-down view.
- **Not** in scope: anything that acts on the road network (placing
  sections, selecting, dragging nodes). That is the tool layer, even though
  it shares the same pointer input.

## Architecture

- In `src/input/`. Knows nothing of the road network; only touches the
  camera.
- Behind a `CameraControls` abstraction that `main.ts` drives once per frame.
  - `main.ts` doesn't know which kind it holds → another navigation style
    (trackball, orbit, free 3D) can replace it with no changes outside
    `src/input/`.
- The first implementation assumes a top-down orthographic camera.
- Aspect ratio and canvas resizing stay with `main.ts`, not the controls.

## Behavior

Overall feel: Google Maps. The camera stays top-down and axis-aligned; it
never rotates or tilts.

**Pan**

- The point grabbed stays under the cursor for the whole drag, at any zoom.
- Mouse: press and drag.
- Touchpad: two-finger scroll.
- Keyboard: arrow keys and WASD. Continuous while held; speed doesn't depend
  on frame rate.

**Zoom**

- Mouse: wheel.
- Touchpad: pinch.
- Keyboard: `+` and `-`. Continuous while held, like keyboard pan.
- Toward the center of the screen, _not_ toward the cursor.
- Clamped to a minimum and maximum → the view can't be lost.
- Each step is the same proportional change at any zoom level.
