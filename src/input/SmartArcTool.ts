import * as THREE from "three";
import { geometryLeaving } from "../core/network/directions";
import type { Vec2 } from "../core/geometry/point";
import {
  applyRoadPlan,
  planRoad,
  type RoadPlan,
} from "../core/layout/roadPlan";
import type { RoadLayout } from "../core/layout/RoadLayout";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import { JunctionHighlight } from "../render/JunctionHighlight";
import type { PartStates } from "../render/PartStates";
import { SectionPlanView } from "../render/SectionPlanView";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import type { SectionSettingsPanel } from "../ui/SectionSettingsPanel";
import {
  capturedDirection,
  offeredDirections,
  sweepsWithinLimit,
} from "./curvedRoadHelpers";
import type { SectionSettings } from "./SectionSettings";
import {
  endpointFrom,
  placeSectionEnd,
  withinPickRadius,
  type Placement,
} from "./sectionPointPlacement";
import { hideSpeculatedParts, showLanding, showPlacedEnd } from "./toolHelpers";
import type { Modifiers, Tool } from "./Tool";

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
  /** Where the next click would land. */
  private readonly landingMark: JunctionHighlight;
  /** The start, once placed. */
  private readonly startMark: JunctionHighlight;
  private readonly planView = new SectionPlanView("surface");
  /**
   * One view per candidate plan on screen. Grown as needed and never shrunk: the ones
   * not in use are hidden.
   */
  private readonly candidateViews: SectionPlanView[] = [];
  /** Holds the plan views, first in the decoration so the marks draw over. */
  private readonly planLayer = new THREE.Group();
  private readonly decoration = new THREE.Group();
  private readonly unsubscribeSettingsChanged: () => void;

  private start: Placement | null = null;
  /**
   * The direction a flick picked, and the only one planned while it holds:
   * - null until the cursor first leaves the capture circle
   * - null again once the cursor is back inside the start's pick radius
   * - null again once a click has built the arc, for the next one to flick
   */
  private flickedDirection: Vec2 | null = null;
  /**
   * What the cursor was last aimed at: the raw position on the ground and the
   * resolved placement.
   */
  private aim: { ground: Vec2; placed: Placement } | null = null;

  /**
   * Whether a plan is drawn for every candidate from the start. A debug
   * view, toggled with C, so it starts off and does not outlive the tool.
   */
  private showCandidates = false;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private readonly viewport: Viewport,
    private readonly partStates: PartStates,
    private readonly settings: SectionSettings,
    private readonly settingsPanel: SectionSettingsPanel,
  ) {
    this.landingMark = new JunctionHighlight(settings.profile.width);
    this.startMark = new JunctionHighlight(settings.profile.width);
    this.unsubscribeSettingsChanged = settingsPanel.onSettingsChanged(() =>
      this.afterSettingsChange(),
    );

    partStates.reset();
    this.planLayer.add(this.planView.sceneObject);
    this.decoration.add(
      this.planLayer,
      this.landingMark.sceneObject,
      this.startMark.sceneObject,
    );
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint, modifiers: Modifiers): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    const placed = this.placeAt(ground, modifiers);
    if (this.start === null) {
      this.start = placed;
      return;
    }

    // Built only where the flick has a buildable road to the far end. Otherwise
    // the arc stays in progress, so the click can be made again somewhere it
    // works. The candidates are only a debug view, and never built.
    const flicked = this.flickedDirection;
    const end = this.endAt(this.start, ground, placed);
    if (flicked === null || end === null) return;
    const plan = this.plansTo(this.start, end, [flicked]).at(0);
    if (plan === undefined || !plan.buildable) return;

    const far = applyRoadPlan(this.network, plan);

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
   * - leaving the capture circle picks one (`capturedDirection`), if none is
   *   picked yet
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

    if (withinPickRadius(this.viewport, ground, this.start.position)) {
      this.flickedDirection = null;
    } else {
      this.flickedDirection ??= capturedDirection(
        this.viewport,
        this.network,
        this.start,
        ground,
      );
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

  /** Works out what the cursor aims at, and redraws for it. */
  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    this.aim =
      ground === null
        ? null
        : { ground, placed: this.placeAt(ground, modifiers) };
    this.redraw();
  }

  /**
   * Redraws for the new width. Where a click lands doesn't depend on it, so
   * the aim stays as it was.
   */
  afterSettingsChange(): void {
    this.landingMark.setRoadWidth(this.settings.profile.width);
    this.startMark.setRoadWidth(this.settings.profile.width);
    this.redraw();
  }

  /**
   * Draws what a click at the aim would do:
   * - before a start: a mark on where it would start from
   * - after: a mark on the start, the flicked plan with a mark on where its
   *   far end lands, and if enabled, also the candidate plans to the far end
   */
  private redraw(): void {
    if (this.start === null) {
      this.startMark.hide();
      this.showPlans(null, []);
      hideSpeculatedParts(this.partStates, null);
      showLanding(this.landingMark, this.aim?.placed ?? null, null);
      return;
    }

    const end =
      this.aim === null
        ? null
        : this.endAt(this.start, this.aim.ground, this.aim.placed);
    const flicked =
      end === null || this.flickedDirection === null
        ? null
        : (this.plansTo(this.start, end, [this.flickedDirection]).at(0) ??
          null);
    const candidates =
      end === null || !this.showCandidates
        ? []
        : this.plansTo(
            this.start,
            end,
            offeredDirections(this.network, this.start),
          );
    this.showPlans(flicked, candidates);
    // Only the flicked plan says what a click does; the candidates are a
    // debug view, and claim nothing. Without it a click builds nothing, so it
    // lands nowhere.
    hideSpeculatedParts(this.partStates, flicked);
    showPlacedEnd(this.startMark, this.start, flicked);
    showLanding(this.landingMark, flicked !== null ? end : null, flicked);
  }

  /**
   * Plans from start to end, one for each starting direction.
   *
   * A direction is left out where it gives no road worth drawing: one sweeping
   * further round than `sweepsWithinLimit` allows, or one whose plan has no
   * piece because the end resolved onto the start's own place. A plan that does
   * come back may still be unbuildable.
   */
  private plansTo(
    start: Placement,
    end: Placement,
    directions: readonly Vec2[],
  ): RoadPlan[] {
    const from = endpointFrom(start);
    const to = endpointFrom(end);
    const plans: RoadPlan[] = [];
    for (const direction of directions) {
      const geometry = geometryLeaving(start.position, direction, end.position);
      if (
        geometry === null ||
        !sweepsWithinLimit(start.position, end.position, geometry)
      ) {
        continue;
      }

      const roadPlan = planRoad(
        this.network,
        this.layout,
        from,
        to,
        geometry,
        this.settings.profile,
      );
      if (roadPlan.sectionPlan.pieces.length > 0) {
        plans.push(roadPlan);
      }
    }
    return plans;
  }

  /** Draws each plan, and hides the views left over. */
  private showPlans(
    flicked: RoadPlan | null,
    candidates: readonly RoadPlan[],
  ): void {
    if (flicked !== null) {
      this.planView.showRoadPlan(this.network, flicked);
    } else {
      this.planView.hide();
    }

    while (this.candidateViews.length < candidates.length) {
      const view = new SectionPlanView("centerline");
      this.candidateViews.push(view);
      this.planLayer.add(view.sceneObject);
    }

    this.candidateViews.forEach((view, index) => {
      if (index < candidates.length) {
        view.showRoadPlan(this.network, candidates[index]);
      } else {
        view.hide();
      }
    });
  }

  /** The place a click at `ground` would land on: the start, or the far end. */
  private placeAt(ground: Vec2, modifiers: Modifiers): Placement {
    return placeSectionEnd(this.network, this.layout, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });
  }

  /**
   * The far end a click at `ground`, landing on `placed`, would make, or null
   * while it has not left the start's pick radius. Measured from the cursor,
   * as in `StraightSectionTool`: zoomed out, the radius covers neighboring
   * nodes too, and a cursor still on the start has not aimed anywhere.
   */
  private endAt(
    start: Placement,
    ground: Vec2,
    placed: Placement,
  ): Placement | null {
    return withinPickRadius(this.viewport, ground, start.position)
      ? null
      : placed;
  }

  /** Releases GPU buffers and any UI. */
  dispose(): void {
    this.unsubscribeSettingsChanged();
    this.settingsPanel.dispose();
    this.landingMark.dispose();
    this.startMark.dispose();
    this.planView.dispose();
    for (const view of this.candidateViews) {
      view.dispose();
    }
  }
}
