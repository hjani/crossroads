import type { ScreenPoint, Viewport } from "../render/Viewport";
import type { CameraControls } from "./CameraControls";

/** Right button. */
const PAN_BUTTON = 2;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;

/** Zoom change per unit of wheel delta, applied exponentially. */
const WHEEL_ZOOM_SENSITIVITY = 0.01;
const PINCH_ZOOM_SENSITIVITY = 0.01;

/** Wheel events smaller than this are assumed to come from a touchpad. */
const MOUSE_WHEEL_MIN_DELTA = 40;

const KEYBOARD_PAN_PIXELS_PER_SECOND = 600;

/** Exponential zoom rate while a zoom key is held. */
const KEYBOARD_ZOOM_RATE = 1.5;

const PAN_KEYS: Record<string, { x: number; y: number }> = {
  arrowleft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
};

/** `=` and `_` are the unshifted forms of `+` and `-`. */
const ZOOM_KEYS: Record<string, number> = {
  "+": 1,
  "=": 1,
  "-": -1,
  _: -1,
};

/**
 * Google-Maps-style navigation for a top-down orthographic camera:
 * right-drag or scroll to pan, wheel or pinch to zoom about the cursor.
 *
 * The viewport's camera is assumed to look straight down, so screen right
 * is world +X and screen down is world +Z.
 */
export class PanZoomControls implements CameraControls {
  private readonly heldKeys = new Set<string>();
  private dragPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  /**
   * Pointer input is taken from `domElement`, keyboard input and focus
   * loss from `window` — keys are not aimed at any particular element.
   */
  constructor(
    private readonly viewport: Viewport,
    private readonly domElement: HTMLElement,
    private readonly window: Window,
  ) {
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("pointermove", this.onPointerMove);
    this.domElement.addEventListener("pointerup", this.onPointerUp);
    this.domElement.addEventListener("pointercancel", this.onPointerUp);
    this.domElement.addEventListener("wheel", this.onWheel, { passive: false });
    this.domElement.addEventListener("contextmenu", this.onContextMenu);
    this.window.addEventListener("keydown", this.onKeyDown);
    this.window.addEventListener("keyup", this.onKeyUp);
    this.window.addEventListener("blur", this.onBlur);
  }

  update(deltaSeconds: number): void {
    this.updateKeyboardPan(deltaSeconds);
    this.updateKeyboardZoom(deltaSeconds);
  }

  private updateKeyboardPan(deltaSeconds: number): void {
    let x = 0;
    let y = 0;
    for (const key of this.heldKeys) {
      const direction = PAN_KEYS[key];
      if (direction) {
        x += direction.x;
        y += direction.y;
      }
    }
    if (x === 0 && y === 0) return;

    const distance = KEYBOARD_PAN_PIXELS_PER_SECOND * deltaSeconds;
    const length = Math.hypot(x, y);
    this.panCameraByPixels((x / length) * distance, (y / length) * distance);
  }

  private updateKeyboardZoom(deltaSeconds: number): void {
    let direction = 0;
    for (const key of this.heldKeys) {
      const zoom = ZOOM_KEYS[key];
      if (zoom) direction += zoom;
    }
    if (direction === 0) return;

    // No cursor to anchor to, so the screen center holds still.
    this.zoomBy(
      Math.exp(direction * KEYBOARD_ZOOM_RATE * deltaSeconds),
      this.screenCenter,
    );
  }

  dispose(): void {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("pointercancel", this.onPointerUp);
    this.domElement.removeEventListener("wheel", this.onWheel);
    this.domElement.removeEventListener("contextmenu", this.onContextMenu);
    this.window.removeEventListener("keydown", this.onKeyDown);
    this.window.removeEventListener("keyup", this.onKeyUp);
    this.window.removeEventListener("blur", this.onBlur);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.dragPointerId !== null || event.button !== PAN_BUTTON) return;
    this.dragPointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.domElement.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) return;
    const dx = event.clientX - this.lastPointerX;
    const dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    // Dragging moves the ground with the cursor, so the camera moves opposite.
    this.panCameraByPixels(-dx, -dy);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) return;
    this.domElement.releasePointerCapture(event.pointerId);
    this.dragPointerId = null;
  };

  /** The browser menu would otherwise open on the button that pans. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (isTouchpadPan(event)) {
      // Scrolling moves the viewport, the opposite sense to dragging.
      this.panCameraByPixels(event.deltaX, event.deltaY);
      return;
    }
    const sensitivity = event.ctrlKey
      ? PINCH_ZOOM_SENSITIVITY
      : WHEEL_ZOOM_SENSITIVITY;
    this.zoomBy(Math.exp(-event.deltaY * sensitivity), {
      x: event.clientX,
      y: event.clientY,
    });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.heldKeys.add(event.key.toLowerCase());
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.key.toLowerCase());
  };

  /** Keys held while focus is lost never emit keyup, so drop them all. */
  private readonly onBlur = (): void => {
    this.heldKeys.clear();
  };

  /** Move the camera by a screen-space offset in pixels. */
  private panCameraByPixels(dx: number, dy: number): void {
    const metersPerPixel = this.viewport.metersPerPixel;
    this.moveCameraBy(dx * metersPerPixel, dy * metersPerPixel);
    this.viewport.notifyViewChanged();
  }

  /**
   * Move the camera across the ground, keeping its world matrix current.
   *
   * The move alone, without announcing it: a zoom moves the camera as part
   * of anchoring, and the two are one change to the view, not two.
   */
  private moveCameraBy(dx: number, dz: number): void {
    const { camera } = this.viewport;
    camera.position.x += dx;
    camera.position.z += dz;
    // The viewport converts screen positions by raycasting through the
    // camera, and several input events can arrive between two frames.
    camera.updateMatrixWorld();
  }

  /**
   * Zoom about a point on screen, keeping the ground under it in place.
   *
   * The anchoring is measured rather than derived: where the ground under
   * the anchor ends up is read back after zooming, so hitting a zoom limit
   * shifts the view by exactly as much as the zoom actually changed.
   */
  private zoomBy(factor: number, anchor: ScreenPoint): void {
    const { camera } = this.viewport;
    const groundBefore = this.viewport.screenToGround(anchor);

    const zoom = camera.zoom * factor;
    camera.zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
    camera.updateProjectionMatrix();

    const groundAfter = this.viewport.screenToGround(anchor);
    if (groundBefore !== null && groundAfter !== null) {
      this.moveCameraBy(
        groundBefore.x - groundAfter.x,
        groundBefore.z - groundAfter.z,
      );
    }

    // The zoom itself changed the view, whether or not the anchor could be
    // held: announced once, after both halves of it have happened.
    this.viewport.notifyViewChanged();
  }

  private get screenCenter(): ScreenPoint {
    const rect = this.domElement.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
}

/**
 * Distinguishes a touchpad two-finger scroll from a mouse wheel tick.
 *
 * The browser reports both as `wheel` events, so this is a heuristic: a
 * pinch sets `ctrlKey`, mice report coarse deltas in whole lines or large
 * pixel steps, and only touchpads scroll horizontally.
 */
function isTouchpadPan(event: WheelEvent): boolean {
  if (event.ctrlKey) return false;
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  if (event.deltaX !== 0) return true;
  return Math.abs(event.deltaY) < MOUSE_WHEEL_MIN_DELTA;
}
