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
 * So far it only picks the start: a click on a node marks it, a click
 * anywhere else drops it. The node a click would catch is marked before the
 * click, as in `SelectionTool`.
 *
 * The start is found by the same rule the section tools weld an endpoint
 * with, so a click catches exactly the node they would join onto.
 */
export class SmartArcTool implements Tool {
  private readonly aimedMark = new NodeHighlight();
  private readonly startMark = new NodeHighlight();
  private readonly decoration = new THREE.Group();

  private start: Placement | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {
    this.decoration.add(this.aimedMark.sceneObject, this.startMark.sceneObject);
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint, modifiers: Modifiers): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    this.start = this.startAt(ground, modifiers);
  }

  cancel(): void {
    this.start = null;
  }

  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    if (this.start === null) {
      this.startMark.hide();
    } else {
      this.startMark.show(this.start.position, SELECTED_COLOR);
    }

    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    const aimed = ground === null ? null : this.startAt(ground, modifiers);

    // Nothing is painted over the start itself, there being nothing worth
    // saying on top of it.
    if (aimed === null || aimed.endpoint === this.start?.endpoint) {
      this.aimedMark.hide();
    } else {
      this.aimedMark.show(aimed.position, AIMED_COLOR);
    }
  }

  /** The node a click at `ground` would start from, or null for none. */
  private startAt(ground: Vec2, modifiers: Modifiers): Placement | null {
    const placed = placeEndpoint(
      this.network,
      this.viewport,
      ground,
      modifiers,
    );
    return placed.kind === "node" ? placed : null;
  }

  /** Releases the marks' GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.aimedMark.dispose();
    this.startMark.dispose();
  }
}
