import type * as THREE from "three";
import type { ScreenPoint } from "../render/Viewport";

/**
 * The modifier keys held.
 *
 * A pointer handler gets them from its own event, so they describe the
 * moment the click or move happened. `afterInputOrViewChange` gets the
 * manager's record instead, kept from pointer events and from Ctrl being
 * pressed and released — a camera move has no event of its own to read them
 * from. What a modifier means is the tool's to decide.
 */
export interface Modifiers {
  readonly ctrl: boolean;
}

/**
 * One way of editing the road network: reads pointer input, decides what
 * the user meant, and applies it to the network.
 *
 * A tool is given whatever it needs for that — the network, the viewport
 * to convert screen positions with — when it is constructed. The manager
 * only decides which tool hears the pointer.
 *
 * Input arrives as separate presses, moves and releases rather than
 * finished clicks, so a tool is free to interpret a drag. The handlers are
 * optional: a tool has only the ones it acts on.
 */
export interface Tool {
  /**
   * Preview geometry — a rubber-band section, a highlighted node. In the
   * scene only while this tool is active, and never part of the model.
   */
  readonly overlay?: THREE.Object3D;

  onPointerDown?(point: ScreenPoint, modifiers: Modifiers): void;
  onPointerMove?(point: ScreenPoint, modifiers: Modifiers): void;
  onPointerUp?(point: ScreenPoint, modifiers: Modifiers): void;

  onKeyDown?(event: KeyboardEvent): void;
  onKeyUp?(event: KeyboardEvent): void;

  /**
   * Called after every event the manager hands this tool, `cancel` included,
   * and after every change of view. What to do about it is the tool's to
   * decide; redrawing the preview is the usual answer.
   *
   * `cursor` is where the pointer was last seen over the canvas, null until
   * it has been.
   */
  afterInputOrViewChange?(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void;

  /**
   * Abandon any edit in progress and clear the preview, leaving the tool
   * ready to start again. Edits already committed to the network stay.
   */
  cancel(): void;

  /**
   * Release what the tool owns — the GPU buffers behind its preview, above
   * all. The manager calls this when the tool stops being the active one,
   * so a tool instance is single-use: activating the same kind of tool
   * again means constructing a new one.
   */
  dispose?(): void;
}
