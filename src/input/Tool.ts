import type * as THREE from "three";
import type { ScreenPoint } from "../render/Viewport";

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

  onPointerDown?(point: ScreenPoint): void;
  onPointerMove?(point: ScreenPoint): void;
  onPointerUp?(point: ScreenPoint): void;

  onKeyDown?(event: KeyboardEvent): void;
  onKeyUp?(event: KeyboardEvent): void;

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