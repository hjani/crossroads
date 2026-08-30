# Camera Controls

## Scope

Viewport navigation only — moving and zooming the top-down view.

Explicitly **not** in scope: any interaction that acts on the road network
(placing sections, selecting, dragging nodes). That is a separate tool-mode
layer, even though it will share the same pointer input.

## Architecture

Lives in `src/input/`. Has no knowledge of the road network data model — it
only ever touches the camera.

Sits behind a `CameraControls` abstraction that `main.ts` drives once per
frame. `main.ts` holds one set of controls without knowing which kind, so a
different navigation style (trackball, orbit, free 3D) can replace this one
without changes outside `src/input/`.

The first implementation assumes a top-down orthographic camera. Aspect
ratio and canvas resizing stay owned by `main.ts`, not by the controls.

## Behavior

Overall feel: Google Maps.

**Pan**
- Dragging moves the ground with the cursor — the point grabbed stays under
  the cursor for the whole drag, at any zoom level.
- Mouse: press and drag.
- Touchpad: two-finger scroll.
- Keyboard: arrow keys and WASD. Movement is continuous while held, and pan
  speed does not vary with frame rate.

**Zoom**
- Mouse: wheel.
- Touchpad: pinch.
- Keyboard: `+` and `-`. Continuous while held, like keyboard pan.
- Zooms toward the center of the screen — *not* toward the cursor.
- Clamped to a minimum and maximum so the view cannot be lost.
- Each zoom step feels like the same proportional change regardless of the
  current zoom level.

The camera stays top-down and axis-aligned throughout; it never rotates or
tilts.

## Deferred

Considered, deliberately not done yet:

- **Zoom toward cursor** — the more natural map behavior, but not needed to
  build and test road placement.
- **Trackball / orbit / free 3D camera** — the reason navigation sits behind
  a swappable abstraction.
- **Touch gestures** on a real touchscreen — the input approach is chosen to
  accommodate it later.
- **Inertia / momentum** after a drag or keyboard pan.
- **Rotation** of the view.
