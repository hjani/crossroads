import * as THREE from "three";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import type { Modifiers, Tool } from "./Tool";

/** Left button. The right one pans the camera, the middle is unclaimed. */
const TOOL_BUTTON = 0;

/**
 * Owns the active tool: decides which one the user's input is talking to,
 * and keeps its preview in the scene for exactly as long as it is active.
 *
 * Knows nothing about what any tool does or what it edits. What it does
 * own is the input that means the same whatever tool is active: which
 * mouse button belongs to the tools at all, and the keys claimed as global
 * bindings — Escape, which abandons the edit in progress, so that every
 * tool cancels alike. Input it has not claimed reaches the active tool
 * unchanged, and a tool that acts on a key decides for itself what that
 * key means.
 *
 * It also keeps where the pointer was last seen and what is held, and hands
 * both to the tool's `afterInputOrViewChange` after every event and every
 * change of view. It says only that something happened; whether that means
 * a redraw is the tool's to decide.
 */
export class ToolManager {
  /** Add to the scene once. Holds the active tool's preview, if it has one. */
  readonly sceneObject = new THREE.Group();

  private tool: Tool | null = null;

  /** Where the pointer was last seen over the canvas. Null until it has been. */
  private cursor: ScreenPoint | null = null;

  /** What was held as of the last pointer event, or Ctrl press or release. */
  private modifiers: Modifiers = { ctrl: false };

  private readonly unsubscribeViewChanged: () => void;

  /**
   * Pointer input is taken from `domElement`, keyboard input from
   * `window` — as in `PanZoomControls`, which shares the same element.
   */
  constructor(
    private readonly domElement: HTMLElement,
    private readonly window: Window,
    viewport: Viewport,
  ) {
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("pointermove", this.onPointerMove);
    this.domElement.addEventListener("pointerup", this.onPointerUp);
    this.window.addEventListener("keydown", this.onKeyDown);
    this.window.addEventListener("keyup", this.onKeyUp);

    this.unsubscribeViewChanged = viewport.onViewChanged(
      this.afterInputOrViewChange,
    );
  }

  /**
   * Takes ownership of a tool, or of none, and gives it the input.
   *
   * The outgoing tool is taken out of the scene and disposed: the manager
   * owns whichever tool is active, so nothing it held survives the switch.
   * That makes a tool instance single-use — activating the same kind of
   * tool again means constructing a new one.
   *
   * The new tool hears nothing until the next event. The pointer is over the
   * palette while a tool is being chosen, so the cursor on record is where
   * it left the canvas, not where it is.
   */
  setActiveTool(tool: Tool | null): void {
    if (tool === this.tool) return;

    if (this.tool !== null) {
      if (this.tool.overlay !== undefined) {
        this.sceneObject.remove(this.tool.overlay);
      }
      this.tool.dispose?.();
    }

    this.tool = tool;

    if (tool !== null && tool.overlay !== undefined) {
      this.sceneObject.add(tool.overlay);
    }
  }

  /** Detaches from the input, and disposes the tool still active. */
  dispose(): void {
    this.setActiveTool(null);
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.window.removeEventListener("keydown", this.onKeyDown);
    this.window.removeEventListener("keyup", this.onKeyUp);
    this.unsubscribeViewChanged();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.recordPointer(event);
    if (event.button !== TOOL_BUTTON) return;
    this.tool?.onPointerDown?.(screenPointOf(event), modifiersOf(event));
    this.afterInputOrViewChange();
  };

  /** Not filtered by button: a tool follows the cursor whether or not it is held. */
  private readonly onPointerMove = (event: PointerEvent): void => {
    this.recordPointer(event);
    this.tool?.onPointerMove?.(screenPointOf(event), modifiersOf(event));
    this.afterInputOrViewChange();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.recordPointer(event);
    if (event.button !== TOOL_BUTTON) return;
    this.tool?.onPointerUp?.(screenPointOf(event), modifiersOf(event));
    this.afterInputOrViewChange();
  };

  /** Global bindings first; the tool never sees a key the manager claimed. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Which handler ran says what Ctrl now is. The event's own `ctrlKey` is
    // not consulted: browsers have not always agreed on what it reads on the
    // press and release of the very key it describes.
    if (event.key === "Control") this.modifiers = { ctrl: true };

    if (event.key === "Escape") {
      this.tool?.cancel();
    } else {
      this.tool?.onKeyDown?.(event);
    }
    this.afterInputOrViewChange();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === "Control") this.modifiers = { ctrl: false };

    this.tool?.onKeyUp?.(event);
    this.afterInputOrViewChange();
  };

  private recordPointer(event: PointerEvent): void {
    this.cursor = screenPointOf(event);
    this.modifiers = modifiersOf(event);
  }

  private readonly afterInputOrViewChange = (): void => {
    this.tool?.afterInputOrViewChange?.(this.cursor, this.modifiers);
  };
}

function screenPointOf(event: PointerEvent): ScreenPoint {
  return { x: event.clientX, y: event.clientY };
}

function modifiersOf(event: PointerEvent): Modifiers {
  return { ctrl: event.ctrlKey };
}
