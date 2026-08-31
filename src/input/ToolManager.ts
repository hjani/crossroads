import * as THREE from "three";
import type { ScreenPoint } from "../render/Viewport";
import type { Tool } from "./Tool";

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
 */
export class ToolManager {
  /** Add to the scene once. Holds the active tool's preview, if it has one. */
  readonly sceneObject = new THREE.Group();

  private tool: Tool | null = null;

  /**
   * Pointer input is taken from `domElement`, keyboard input from
   * `window` — as in `PanZoomControls`, which shares the same element.
   */
  constructor(
    private readonly domElement: HTMLElement,
    private readonly window: Window,
  ) {
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("pointermove", this.onPointerMove);
    this.domElement.addEventListener("pointerup", this.onPointerUp);
    this.window.addEventListener("keydown", this.onKeyDown);
    this.window.addEventListener("keyup", this.onKeyUp);
  }

  /**
   * Takes ownership of a tool, or of none, and gives it the input.
   *
   * The outgoing tool is taken out of the scene and disposed: the manager
   * owns whichever tool is active, so nothing it held survives the switch.
   * That makes a tool instance single-use — activating the same kind of
   * tool again means constructing a new one.
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
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== TOOL_BUTTON) return;
    this.tool?.onPointerDown?.(screenPointOf(event));
  };

  /** Not filtered by button: a tool follows the cursor whether or not it is held. */
  private readonly onPointerMove = (event: PointerEvent): void => {
    this.tool?.onPointerMove?.(screenPointOf(event));
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button !== TOOL_BUTTON) return;
    this.tool?.onPointerUp?.(screenPointOf(event));
  };

  /** Global bindings first; the tool never sees a key the manager claimed. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.tool?.cancel();
      return;
    }
    this.tool?.onKeyDown?.(event);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.tool?.onKeyUp?.(event);
  };
}

function screenPointOf(event: PointerEvent): ScreenPoint {
  return { x: event.clientX, y: event.clientY };
}
