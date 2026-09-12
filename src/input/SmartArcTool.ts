import * as THREE from "three";
import {
  bisectorDirectionsAt,
  continuingDirectionsAt,
  geometryLeaving,
  midSectionDirectionsAt,
  perpendicularDirectionsAt,
} from "../core/directions";
import { planSection, type SectionPlan } from "../core/edits";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { NodeHighlight } from "../render/NodeHighlight";
import { SectionPlanView } from "../render/SectionPlanView";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import {
  endpointFrom,
  placeSectionEnd,
  withinPickRadius,
  type Placement,
} from "./sectionPointPlacement";
import type { Modifiers, Tool } from "./Tool";

/**
 * The place a click would start from. Named as in `SelectionTool`, and the
 * same yellow, until the scene's colors have a shared home.
 */
const AIMED_COLOR = 0xffdd44;

/** The start the arc is drawn from. The same blue as `SelectionTool`'s. */
const SELECTED_COLOR = 0x66ccff;

/**
 * The furthest round a planned road may turn: three quarters of a circle, as
 * a loop ramp does. Past it, a direction pointing nearly back from the far end
 * gives a road circling almost all the way round to get there.
 */
const MAX_SWEEP_RADIANS = 1.5 * Math.PI;

/**
 * A place an arc can start from: a node, or a place along a road. Open ground
 * has no direction to offer, so it is never a start.
 */
type Start = Extract<Placement, { kind: "node" | "section" }>;

/**
 * Draws an arc that takes its direction from the network it starts on,
 * rather than from a control point aimed by hand.
 *
 * A click on a node or a road picks the start. From then on the cursor is the
 * far end, and each direction the start offers is planned as a road out to it,
 * drawn as what building it would do, refusals included. A click fixes the far
 * end, and the plans stop following the cursor. Nothing is built yet, and
 * cancelling drops the whole gesture.
 *
 * The start is found by the same rule the section tools weld an endpoint
 * with, so a click catches exactly the node or road they would join onto. The
 * place a click would catch is marked before the click, as in `SelectionTool`.
 */
export class SmartArcTool implements Tool {
  private readonly aimedMark = new NodeHighlight();
  private readonly startMark = new NodeHighlight();
  /**
   * One view per plan on screen. Grown as needed and never shrunk: the ones
   * not in use are hidden.
   */
  private readonly planViews: SectionPlanView[] = [];
  /** Holds the plan views, first in the decoration so the marks draw over. */
  private readonly planLayer = new THREE.Group();
  private readonly decoration = new THREE.Group();

  private start: Start | null = null;
  /** The far end, once a click has fixed it. Until then it is the cursor. */
  private end: Placement | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {
    this.decoration.add(
      this.planLayer,
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

    if (this.start === null) {
      this.start = this.startAt(ground, modifiers);
      return;
    }

    if (this.end === null) {
      // Fixed only where something is drawn to it, so the tool never holds an
      // end there is no road to.
      const placed = this.endAt(this.start, ground, modifiers);
      if (placed !== null && this.plansTo(this.start, placed).length > 0) {
        this.end = placed;
      }
    }
  }

  cancel(): void {
    this.start = null;
    this.end = null;
  }

  /**
   * Draws what a click would do: before a start, the mark on where it would
   * start from; after, the start and a plan per direction out to the far end,
   * wherever the cursor puts it until a click has fixed it.
   */
  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);

    if (this.start === null) {
      this.startMark.hide();
      this.showPlans([]);

      const aimed = ground === null ? null : this.startAt(ground, modifiers);
      if (aimed === null) {
        this.aimedMark.hide();
      } else {
        this.aimedMark.show(aimed.position, AIMED_COLOR);
      }
      return;
    }

    // A click no longer picks a start, and the plans' last point already marks
    // where the far end lands.
    this.aimedMark.hide();
    this.startMark.show(this.start.position, SELECTED_COLOR);

    const end =
      this.end ??
      (ground === null ? null : this.endAt(this.start, ground, modifiers));
    this.showPlans(end === null ? [] : this.plansTo(this.start, end));
  }

  /** The directions a road could leave the start by. */
  private directionsAt(start: Start): Vec2[] {
    return start.kind === "node"
      ? [
          ...continuingDirectionsAt(this.network, start.node),
          ...bisectorDirectionsAt(this.network, start.node),
          ...perpendicularDirectionsAt(this.network, start.node),
        ]
      : midSectionDirectionsAt(this.network, start.section, start.position);
  }

  /**
   * What the network makes of a road from the start to `end` in each
   * direction the start offers, in the order the directions come.
   *
   * A direction is left out where it gives no road worth drawing: one turning
   * further round than `MAX_SWEEP_RADIANS`, or one whose plan has no piece
   * because the end resolved onto the start's own place. A plan that does come
   * back may still be unbuildable, which is the network's to say.
   */
  private plansTo(start: Start, end: Placement): SectionPlan[] {
    const plans: SectionPlan[] = [];
    for (const direction of this.directionsAt(start)) {
      if (!turnsWithinLimit(start.position, direction, end.position)) continue;

      const geometry = geometryLeaving(start.position, direction, end.position);
      if (geometry === null) continue;

      const plan = planSection(
        this.network,
        endpointFrom(start),
        endpointFrom(end),
        geometry,
      );
      if (plan.pieces.length > 0) plans.push(plan);
    }
    return plans;
  }

  /** Draws each plan in a view of its own, and hides the views left over. */
  private showPlans(plans: readonly SectionPlan[]): void {
    while (this.planViews.length < plans.length) {
      const view = new SectionPlanView();
      this.planViews.push(view);
      this.planLayer.add(view.sceneObject);
    }

    this.planViews.forEach((view, index) => {
      if (index < plans.length) {
        view.showPlan(this.network, plans[index]);
      } else {
        view.hide();
      }
    });
  }

  /** The place a click at `ground` would start from, or null for none. */
  private startAt(ground: Vec2, modifiers: Modifiers): Start | null {
    const placed = placeSectionEnd(this.network, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });
    return placed.kind === "node" || placed.kind === "section" ? placed : null;
  }

  /**
   * Where the cursor at `ground` puts the far end, or null while it has not
   * left the start's pick radius. Measured from the cursor, as in
   * `StraightSectionTool`: zoomed out, the radius covers neighboring nodes
   * too, and a cursor still on the start has not aimed anywhere.
   */
  private endAt(
    start: Start,
    ground: Vec2,
    modifiers: Modifiers,
  ): Placement | null {
    if (withinPickRadius(this.viewport, ground, start.position)) return null;

    return placeSectionEnd(this.network, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });
  }

  /** Releases the marks' and plans' GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.aimedMark.dispose();
    this.startMark.dispose();
    for (const view of this.planViews) {
      view.dispose();
    }
  }
}

/**
 * Whether the arc that leaves `from` in `direction` and ends at `to` turns no
 * further round than `MAX_SWEEP_RADIANS`.
 *
 * Let `d = to − from`, and θ the angle between `direction` and `d`.
 *
 * - The arc turns through 2θ (tangent–chord angle theorem).
 * - θ is in 0..π, where cos is decreasing, so `2θ ≤ max` exactly when
 *   `cos θ ≥ cos(max/2)`. With `cos θ = direction·d / (|direction| |d|)`:
 *
 *       direction·d ≥ |direction| |d| · cos(max/2)
 *
 * No angle is computed, and `direction` does not need to be a unit vector.
 * A direction aimed at `to` has θ = 0 and always passes. One aimed exactly
 * away has θ = π, a full circle, which no limit short of one lets through.
 */
function turnsWithinLimit(from: Vec2, direction: Vec2, to: Vec2): boolean {
  const chordX = to.x - from.x;
  const chordZ = to.z - from.z;
  const alongChord = direction.x * chordX + direction.z * chordZ;
  const lengths =
    Math.hypot(direction.x, direction.z) * Math.hypot(chordX, chordZ);
  return alongChord >= lengths * Math.cos(MAX_SWEEP_RADIANS / 2);
}
