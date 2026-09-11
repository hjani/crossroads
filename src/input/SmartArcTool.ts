import * as THREE from "three";
import {
  bisectorDirectionsAt,
  continuingDirectionsAt,
} from "../core/directions";
import { isNodeId, type RoadNetwork } from "../core/RoadNetwork";
import type { Node, Vec2 } from "../core/types";
import { NodeHighlight } from "../render/NodeHighlight";
import { SectionHighlight } from "../render/SectionHighlight";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import { placeEndpoint } from "./sectionPointPlacement";
import type { Modifiers, Tool } from "./Tool";

/**
 * The node a click would start from. Named as in `SelectionTool`, and the
 * same yellow, until the scene's colors have a shared home.
 */
const AIMED_COLOR = 0xffdd44;

/** The start the arc is drawn from. The same blue as `SelectionTool`'s. */
const SELECTED_COLOR = 0x66ccff;

/**
 * The directions offered at the start. The same violet as `ArcSectionTool`'s
 * chord: there is no arc to plan yet, only a gesture in progress.
 */
const IN_PROGRESS_COLOR = 0xcc88ff;

/** How long a direction is drawn. In pixels, so it looks the same at any zoom. */
const DIRECTION_MARK_PIXELS = 100;

/**
 * Draws an arc that takes its direction from the network it starts on,
 * rather than from a control point aimed by hand.
 *
 * So far it only picks the start: a click on a node marks it along with the
 * directions a road could leave it by, and a click anywhere else drops it.
 * The node a click would catch is marked before the click, as in
 * `SelectionTool`.
 *
 * The start is found by the same rule the section tools weld an endpoint
 * with, so a click catches exactly the node they would join onto.
 */
export class SmartArcTool implements Tool {
  private readonly aimedMark = new NodeHighlight();
  private readonly startMark = new NodeHighlight();
  private readonly directionMarks = new SectionHighlight(IN_PROGRESS_COLOR);
  private readonly decoration = new THREE.Group();

  private start: Node | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {
    this.decoration.add(
      this.directionMarks.sceneObject,
      this.aimedMark.sceneObject,
      this.startMark.sceneObject,
    );
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
      this.directionMarks.hide();
    } else {
      this.startMark.show(this.start.position, SELECTED_COLOR);
      this.directionMarks.show(this.directionStubs(this.start), []);
    }

    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    const aimed = ground === null ? null : this.startAt(ground, modifiers);

    // Nothing is painted over the start itself, there being nothing worth
    // saying on top of it.
    if (aimed === null || aimed.id === this.start?.id) {
      this.aimedMark.hide();
    } else {
      this.aimedMark.show(aimed.position, AIMED_COLOR);
    }
  }

  /**
   * A short line out of the start along each direction it offers. Measured
   * at the current zoom, which is why it is redrawn on a change of view.
   */
  private directionStubs(start: Node): Vec2[][] {
    const length = DIRECTION_MARK_PIXELS * this.viewport.metersPerPixel;
    const from = start.position;
    const directions = [
      ...continuingDirectionsAt(this.network, start.id),
      ...bisectorDirectionsAt(this.network, start.id),
    ];
    return directions.map((direction) => [
      from,
      { x: from.x + direction.x * length, z: from.z + direction.z * length },
    ]);
  }

  /** The node a click at `ground` would start from, or null for none. */
  private startAt(ground: Vec2, modifiers: Modifiers): Node | null {
    const placed = placeEndpoint(
      this.network,
      this.viewport,
      ground,
      modifiers,
    );
    return isNodeId(placed.endpoint)
      ? { id: placed.endpoint, position: placed.position }
      : null;
  }

  /** Releases the marks' GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.aimedMark.dispose();
    this.startMark.dispose();
    this.directionMarks.dispose();
  }
}
