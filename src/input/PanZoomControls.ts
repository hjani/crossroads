import * as THREE from "three";
import type { CameraControls } from "./CameraControls";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;

/** Zoom change per unit of wheel delta, applied exponentially. */
const WHEEL_ZOOM_SENSITIVITY = 0.0025;
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
 * drag or scroll to pan, wheel or pinch to zoom about the screen centre.
 *
 * The camera is assumed to look straight down with `up` set to -Z, so
 * screen right is world +X and screen down is world +Z.
 */
export class PanZoomControls implements CameraControls {
  private readonly heldKeys = new Set<string>();
  private dragPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly domElement: HTMLElement,
  ) {
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("pointermove", this.onPointerMove);
    this.domElement.addEventListener("pointerup", this.onPointerUp);
    this.domElement.addEventListener("pointercancel", this.onPointerUp);
    this.domElement.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
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

    this.zoomBy(Math.exp(direction * KEYBOARD_ZOOM_RATE * deltaSeconds));
  }

  dispose(): void {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("pointercancel", this.onPointerUp);
    this.domElement.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.dragPointerId !== null || event.button !== 0) return;
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
    this.zoomBy(Math.exp(-event.deltaY * sensitivity));
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
    const { width, height } = this.domElement.getBoundingClientRect();
    const worldPerPixelX =
      (this.camera.right - this.camera.left) / this.camera.zoom / width;
    const worldPerPixelY =
      (this.camera.top - this.camera.bottom) / this.camera.zoom / height;
    this.camera.position.x += dx * worldPerPixelX;
    this.camera.position.z += dy * worldPerPixelY;
  }

  private zoomBy(factor: number): void {
    const zoom = this.camera.zoom * factor;
    this.camera.zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
    this.camera.updateProjectionMatrix();
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
