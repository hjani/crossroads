import * as THREE from "three";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { NodeHighlight } from "../render/NodeHighlight";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import { placeEndpoint, type Placement } from "./sectionPointPlacement";
import type { Modifiers, Tool } from "./Tool";

/**
 * The node a click would start from. Named as in `SelectionTool`, and the
 * same yellow, until the scene's colors have a shared home.
 */
const AIMED_COLOR = 0xffdd44;

/** The start the arc is drawn from. The same blue as `SelectionTool`'s. */
const SELECTED_COLOR = 0x66ccff;

/**
 * Draws an arc that takes its direction from the network it starts on,
 * rather than from a control point aimed by hand.
 *
 * The start is found by the same rule the section tools weld an endpoint
 * with, so a click catches exactly the node they would join onto.
 */
export class SmartArcTool implements Tool {
  private readonly aimedMark = new NodeHighlight();
  private readonly startMark = new NodeHighlight();
  private readonly decoration = new THREE.Group();

  private start: Placement | null = null;

  /** Where the cursor was last seen, so the aimed mark can be redrawn
   * without it having moved. Null until the pointer is first heard from. */
  private cursor: ScreenPoint | null = null;

  /** What was held the last time either was heard from, since a redraw can
   * be asked for by something that carries neither — the camera moving. */
  private modifiers: Modifiers = { ctrl: false };

  private readonly unsubscribeViewChanged: () => void;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {
    this.decoration.add(this.aimedMark.sceneObject, this.startMark.sceneObject);

    this.unsubscribeViewChanged = viewport.onViewChanged(() => this.redraw());
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint, modifiers: Modifiers): void {
    this.cursor = point;
    this.modifiers = modifiers;

    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    this.start = this.startAt(ground);
    if (this.start === null) {
      this.startMark.hide();
    } else {
      this.startMark.show(this.start.position, SELECTED_COLOR);
    }

    // The click changed the start, and with it whether the aimed mark is
    // the one being suppressed.
    this.showAimed(ground);
  }

  onPointerMove(point: ScreenPoint, modifiers: Modifiers): void {
    this.cursor = point;
    this.modifiers = modifiers;
    this.redraw();
  }

  /** Ctrl changes how a weld onto a road is rounded, and rounding can land
   * on a node — so the mark is redrawn without the cursor moving, as in
   * `StraightSectionTool`. */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Control") this.setCtrl(true);
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.key === "Control") this.setCtrl(false);
  }

  private setCtrl(ctrl: boolean): void {
    this.modifiers = { ctrl };
    this.redraw();
  }

  /** Drops the start. The aimed mark stays, and is drawn again, since
   * dropping the start is what un-suppresses it. */
  cancel(): void {
    this.start = null;
    this.startMark.hide();
    this.redraw();
  }

  /** Draws the aimed mark from where the cursor was last seen. */
  private redraw(): void {
    if (this.cursor === null) return;

    const ground = this.viewport.screenToGround(this.cursor);
    if (ground === null) return;

    this.showAimed(ground);
  }

  /** The node a click at `ground` would start from, or null for none. */
  private startAt(ground: Vec2): Placement | null {
    const placed = placeEndpoint(
      this.network,
      this.viewport,
      ground,
      this.modifiers,
    );
    return placed.kind === "node" ? placed : null;
  }

  /** Marks the node a click would start from — unless it already is the
   * start, there being nothing worth painting over it to say. */
  private showAimed(ground: Vec2): void {
    const aimed = this.startAt(ground);
    if (aimed === null || aimed.endpoint === this.start?.endpoint) {
      this.aimedMark.hide();
    } else {
      this.aimedMark.show(aimed.position, AIMED_COLOR);
    }
  }

  /** Releases the marks' GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.unsubscribeViewChanged();
    this.aimedMark.dispose();
    this.startMark.dispose();
  }
}
