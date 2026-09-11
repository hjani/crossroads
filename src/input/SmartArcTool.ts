import * as THREE from "three";
import {
  bisectorDirectionsAt,
  continuingDirectionsAt,
  midSectionDirectionsAt,
  perpendicularDirectionsAt,
} from "../core/directions";
import { isSamePoint } from "../core/points";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { NodeHighlight } from "../render/NodeHighlight";
import { SectionHighlight } from "../render/SectionHighlight";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import { placeSectionEnd, type Placement } from "./sectionPointPlacement";
import type { Modifiers, Tool } from "./Tool";

/**
 * The place a click would start from. Named as in `SelectionTool`, and the
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
 * A place an arc can start from: a node, or a place along a road. Open ground
 * has no direction to offer, so it is never a start.
 */
type Start = Extract<Placement, { kind: "node" | "section" }>;

/**
 * Draws an arc that takes its direction from the network it starts on,
 * rather than from a control point aimed by hand.
 *
 * So far it only picks the start: a click on a node or a road marks it along
 * with the directions a road could leave it by, and a click anywhere else
 * drops it. The place a click would catch is marked before the click, as in
 * `SelectionTool`.
 *
 * The start is found by the same rule the section tools weld an endpoint
 * with, so a click catches exactly the node or road they would join onto.
 */
export class SmartArcTool implements Tool {
  private readonly aimedMark = new NodeHighlight();
  private readonly startMark = new NodeHighlight();
  private readonly directionMarks = new SectionHighlight(IN_PROGRESS_COLOR);
  private readonly decoration = new THREE.Group();

  private start: Start | null = null;

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
    // saying on top of it. Compared by place, since a start on a road has no
    // id to compare.
    const onStart =
      aimed !== null &&
      this.start !== null &&
      isSamePoint(aimed.position, this.start.position);
    if (aimed === null || onStart) {
      this.aimedMark.hide();
    } else {
      this.aimedMark.show(aimed.position, AIMED_COLOR);
    }
  }

  /**
   * A short line out of the start along each direction it offers. Measured
   * at the current zoom, which is why it is redrawn on a change of view.
   */
  private directionStubs(start: Start): Vec2[][] {
    const length = DIRECTION_MARK_PIXELS * this.viewport.metersPerPixel;
    const from = start.position;
    const directions =
      start.kind === "node"
        ? [
            ...continuingDirectionsAt(this.network, start.node),
            ...bisectorDirectionsAt(this.network, start.node),
            ...perpendicularDirectionsAt(this.network, start.node),
          ]
        : midSectionDirectionsAt(this.network, start.section, start.position);
    return directions.map((direction) => [
      from,
      { x: from.x + direction.x * length, z: from.z + direction.z * length },
    ]);
  }

  /** The place a click at `ground` would start from, or null for none. */
  private startAt(ground: Vec2, modifiers: Modifiers): Start | null {
    const placed = placeSectionEnd(this.network, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });
    return placed.kind === "node" || placed.kind === "section" ? placed : null;
  }

  /** Releases the marks' GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.aimedMark.dispose();
    this.startMark.dispose();
    this.directionMarks.dispose();
  }
}
