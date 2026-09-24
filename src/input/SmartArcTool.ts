import * as THREE from "three";
import {
  bisectorDirectionsAt,
  continuingDirectionsAt,
  geometryLeaving,
  midSectionDirectionsAt,
  nearestDirection,
  perpendicularDirectionsAt,
} from "../core/network/directions";
import {
  applySectionPlan,
  planSection,
  type SectionPlan,
} from "../core/network/edits";
import { angleOf, distance, type Vec2 } from "../core/geometry/point";
import { verifyClearance } from "../core/layout/clearance";
import { ROAD_WIDTH_METERS, type RoadLayout } from "../core/layout/RoadLayout";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import { STATE_COLOR } from "../render/colors";
import { NodeHighlight } from "../render/NodeHighlight";
import { RoadNetworkHighlight } from "../render/RoadNetworkHighlight";
import { SectionPlanView } from "../render/SectionPlanView";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import {
  endpointFrom,
  placeSectionEnd,
  withinPickRadius,
  type Placement,
} from "./sectionPointPlacement";
import { isTooTight } from "./curveLimits";
import { showWeldTarget } from "./toolHelpers";
import type { Modifiers, Tool } from "./Tool";

/**
 * The furthest round a planned road may turn: three quarters of a circle, as
 * a loop ramp does. Past it, a direction pointing nearly back from the far end
 * gives a road circling almost all the way round to get there.
 */
const MAX_SWEEP_RADIANS = 1.5 * Math.PI;

/**
 * How far the cursor must get from the start before the way it went picks a
 * direction. In pixels, as the pick radius it has to be wider than: a flick
 * is a movement of the hand, the same size at every zoom.
 */
const CAPTURE_RADIUS_PIXELS = 40;

/**
 * What a flick's heading is rounded to where the start offers no direction of
 * its own: a multiple of 15°. The grid's job for an angle, so a shape can be
 * drawn again and a hand's wobble does not bend the road.
 */
const HEADING_STEP_RADIANS = Math.PI / 12;

/**
 * Draws an arc that takes its direction from the network it starts on,
 * rather than from a control point aimed by hand.
 *
 * - A click picks the start, on the network or off it. From then on the cursor
 *   is the far end.
 * - Flicking the cursor away from the start picks one of the directions the
 *   start offers, or on open ground, which offers none, the flick's own
 *   heading. It is planned as a road out to the far end and drawn as what
 *   building it would do, refusals included.
 * - A click builds the plan where it can be built, and its far end starts the
 *   next arc, so a run of roads is drawn without re-clicking the joins.
 * - C shows a plan for every direction the start offers, as a debug view.
 *
 * Cancelling ends the run and keeps what was already built.
 *
 * The start is found by the same rule the section tools weld an endpoint
 * with, so a click catches exactly the node or road they would join onto. The
 * place a click would catch is marked before the click.
 */
export class SmartArcTool implements Tool {
  private readonly aimedMark = new NodeHighlight();
  private readonly startMark = new NodeHighlight();
  private readonly hoverHighlight: RoadNetworkHighlight;
  private readonly planView = new SectionPlanView(ROAD_WIDTH_METERS);
  /**
   * One view per candidate plan on screen. Grown as needed and never shrunk: the ones
   * not in use are hidden.
   */
  private readonly candidateViews: SectionPlanView[] = [];
  /** Holds the plan views, first in the decoration so the marks draw over. */
  private readonly planLayer = new THREE.Group();
  private readonly decoration = new THREE.Group();

  private start: Placement | null = null;
  /**
   * The direction a flick picked, and the only one planned while it holds:
   * - null until the cursor first leaves the capture circle
   * - null again once the cursor is back inside the start's pick radius
   * - null again once a click has built the arc, for the next one to flick
   */
  private flickedDirection: Vec2 | null = null;

  /**
   * Whether a plan is drawn for every candidate from the start. A debug
   * view, toggled with C, so it starts off and does not outlive the tool.
   */
  private showCandidates = false;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private readonly viewport: Viewport,
  ) {
    this.hoverHighlight = new RoadNetworkHighlight(
      network,
      layout,
      STATE_COLOR.AIMED,
    );
    this.planLayer.add(this.planView.sceneObject);
    this.decoration.add(
      this.planLayer,
      this.aimedMark.sceneObject,
      this.startMark.sceneObject,
      this.hoverHighlight.sceneObject,
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

    // Built only where the flick has a buildable road to the far end. Otherwise
    // the arc stays in progress, so the click can be made again somewhere it
    // works. The candidates are only a debug view, and never built.
    const flicked = this.flickedDirection;
    const placed = this.endAt(this.start, ground, modifiers);
    if (flicked === null || placed === null) return;
    const plan = this.plansTo(this.start, placed, [flicked]).at(0);
    if (plan === undefined || !plan.buildable) return;

    const far = applySectionPlan(this.network, plan);

    // The far end starts the next arc, as in `StraightSectionTool`. Its position
    // is asked for rather than assumed: the click may have landed on a junction
    // already there, a centimeter away. The next arc needs a flick of its own.
    this.start = {
      kind: "node",
      node: far,
      position: this.network.getNode(far).position,
    };
    this.flickedDirection = null;
  }

  /**
   * Picks the direction the cursor is flicked in, and releases it:
   * - leaving the capture circle picks the direction nearest the way from the
   *   start to the cursor, if none is picked yet. Open ground offers none, so
   *   there it is that way itself, rounded by `roundHeading`
   * - coming back inside the pick radius releases it, so a road ending between
   *   the two keeps its flick
   *
   * Only on a move of the cursor, not after every change of view: a pan or a
   * zoom sliding the start away under a still cursor is not a flick.
   */
  onPointerMove(point: ScreenPoint): void {
    if (this.start === null) return;
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    const from = this.start.position;
    if (withinPickRadius(this.viewport, ground, from)) {
      this.flickedDirection = null;
    } else if (
      this.flickedDirection === null &&
      distance(ground, from) >
        CAPTURE_RADIUS_PIXELS * this.viewport.metersPerPixel
    ) {
      const heading = { x: ground.x - from.x, z: ground.z - from.z };
      const offered = this.directionsAt(this.start);
      this.flickedDirection =
        offered.length > 0
          ? nearestDirection(offered, heading)
          : roundHeading(heading);
    }
  }

  /** C toggles the candidates. A held key repeats, and would flicker them. */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === "c" && !event.repeat) {
      this.showCandidates = !this.showCandidates;
    }
  }

  cancel(): void {
    this.start = null;
    this.flickedDirection = null;
  }

  /**
   * Draws what a click would do:
   * - before a start: a mark on where it would start from
   * - after: a mark on the start, the flicked plan, and if enabled, also the
   *   candidate plans to the far end
   */
  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);

    if (this.start === null) {
      this.startMark.hide();
      this.showPlans(null, []);
      this.aimedMark.hide();
      this.hoverHighlight.hide();
      if (ground === null) return;

      const aimed = this.startAt(ground, modifiers);
      showWeldTarget(this.hoverHighlight, aimed);
      if (aimed.kind !== "free") {
        this.aimedMark.show(
          aimed.position,
          aimed.kind === "node" ? STATE_COLOR.SELECTED : STATE_COLOR.PLANNED,
        );
      }
      return;
    }

    // A click no longer picks a start, and the plans' last point already marks
    // where the far end lands.
    this.aimedMark.hide();

    const end =
      ground === null ? null : this.endAt(this.start, ground, modifiers);
    const flicked =
      end === null || this.flickedDirection === null
        ? null
        : (this.plansTo(this.start, end, [this.flickedDirection]).at(0) ??
          null);
    const candidates =
      end === null || !this.showCandidates
        ? []
        : this.plansTo(this.start, end, this.directionsAt(this.start));
    this.showPlans(flicked, candidates);

    if (flicked !== null && end !== null) {
      showWeldTarget(this.hoverHighlight, end);
    } else {
      this.hoverHighlight.hide();
    }

    // The start is marked on its own only until the plan marks it, as in
    // `StraightSectionTool`: a node already there, or one to be made.
    if (flicked !== null) {
      this.startMark.hide();
    } else {
      this.startMark.show(
        this.start.position,
        this.start.kind === "node" ? STATE_COLOR.SELECTED : STATE_COLOR.PLANNED,
      );
    }
  }

  /** The directions a road could leave the start by. None on open ground. */
  private directionsAt(start: Placement): Vec2[] {
    switch (start.kind) {
      case "node":
        return [
          ...continuingDirectionsAt(this.network, start.node),
          ...bisectorDirectionsAt(this.network, start.node),
          ...perpendicularDirectionsAt(this.network, start.node),
        ];
      case "section":
        return midSectionDirectionsAt(
          this.network,
          start.section,
          start.position,
        );
      case "grid":
      case "free":
        return [];
    }
  }

  /**
   * Plans from start to end, one for each starting direction.
   *
   * A direction is left out where it gives no road worth drawing: one turning
   * further round than `MAX_SWEEP_RADIANS`, or one whose plan has no piece
   * because the end resolved onto the start's own place. A plan that does come
   * back may still be unbuildable: the network's to say, or the tool's own
   * where the arc curves too tightly.
   */
  private plansTo(
    start: Placement,
    end: Placement,
    directions: readonly Vec2[],
  ): SectionPlan[] {
    const plans: SectionPlan[] = [];
    for (const direction of directions) {
      if (!turnsWithinLimit(start.position, direction, end.position)) continue;

      const geometry = geometryLeaving(start.position, direction, end.position);
      if (geometry === null) continue;

      const plan = planSection(
        this.network,
        endpointFrom(start),
        endpointFrom(end),
        geometry,
      );
      if (plan.pieces.length === 0) continue;

      const tooTight = isTooTight(
        start.position,
        end.position,
        geometry,
        ROAD_WIDTH_METERS,
      );
      plans.push(
        tooTight
          ? { ...plan, buildable: false }
          : verifyClearance(this.network, plan),
      );
    }
    return plans;
  }

  /** Draws each plan, and hides the views left over. */
  private showPlans(
    flicked: SectionPlan | null,
    candidates: readonly SectionPlan[],
  ): void {
    if (flicked !== null) {
      this.planView.showPlan(this.network, flicked);
    } else {
      this.planView.hide();
    }

    while (this.candidateViews.length < candidates.length) {
      const view = new SectionPlanView(0);
      this.candidateViews.push(view);
      this.planLayer.add(view.sceneObject);
    }

    this.candidateViews.forEach((view, index) => {
      if (index < candidates.length) {
        view.showPlan(this.network, candidates[index]);
      } else {
        view.hide();
      }
    });
  }

  /** The place a click at `ground` would start from. */
  private startAt(ground: Vec2, modifiers: Modifiers): Placement {
    return placeSectionEnd(this.network, this.layout, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });
  }

  /**
   * Where the cursor at `ground` puts the far end, or null while it has not
   * left the start's pick radius. Measured from the cursor, as in
   * `StraightSectionTool`: zoomed out, the radius covers neighboring nodes
   * too, and a cursor still on the start has not aimed anywhere.
   */
  private endAt(
    start: Placement,
    ground: Vec2,
    modifiers: Modifiers,
  ): Placement | null {
    if (withinPickRadius(this.viewport, ground, start.position)) return null;

    return placeSectionEnd(this.network, this.layout, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });
  }

  /** Releases the marks' and plans' GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.aimedMark.dispose();
    this.startMark.dispose();
    this.hoverHighlight.dispose();
    this.planView.dispose();
    for (const view of this.candidateViews) {
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

/**
 * The unit direction at a multiple of `HEADING_STEP_RADIANS` nearest to the
 * way `toward` points. `toward` does not need to be a unit vector.
 */
function roundHeading(toward: Vec2): Vec2 {
  const angle =
    Math.round(angleOf(toward) / HEADING_STEP_RADIANS) * HEADING_STEP_RADIANS;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}
