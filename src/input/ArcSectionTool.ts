import * as THREE from "three";
import { isSamePoint, type Vec2 } from "../core/geometry/point";
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
import type { SectionSettings } from "./SectionSettings";
import {
  endpointFrom,
  placeSectionEnd,
  placeControlPoint,
  withinPickRadius,
  type Placement,
} from "./sectionPointPlacement";
import { hideSpeculatedParts, showLanding, showPlacedEnd } from "./toolHelpers";
import type { Modifiers, Tool } from "./Tool";

/**
 * Draws arc sections by clicking three points: the two ends, and then the
 * control point the road passes through between them.
 *
 * The ends come first so the last click changes only how the road bends.
 * The arc is built through the control point, so it runs under the cursor
 * placing it, and dragging that cursor across the chord is how the bend
 * changes sides.
 *
 * Each arc committed leaves its far end as the start of the next, so a run
 * of curves is drawn without re-clicking the joins, as with straights.
 */
export class ArcSectionTool implements Tool {
  /** The start: where the first click would land, and after it the start it
   * placed. */
  private readonly startHighlight: JunctionHighlight;
  /** The end: where the second click would land, and after it the end it
   * placed. */
  private readonly endHighlight: JunctionHighlight;
  /** The full plan to build the arc. */
  private readonly planView = new SectionPlanView("surface");
  private readonly decoration = new THREE.Group();
  private readonly unsubscribeSettingsChanged: () => void;

  /** The ends, in the order they were clicked. */
  private start: Placement | null = null;
  private end: Placement | null = null;
  /**
   * Where the cursor last was on the ground, and whether to round it to the
   * grid. Raw: what it resolves to depends on how far the gesture has got.
   */
  private lastCursor: { ground: Vec2; useGrid: boolean } | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private readonly viewport: Viewport,
    private readonly partStates: PartStates,
    private readonly settings: SectionSettings,
    private readonly settingsPanel: SectionSettingsPanel,
  ) {
    this.startHighlight = new JunctionHighlight(settings.profile.width);
    this.endHighlight = new JunctionHighlight(settings.profile.width);
    this.unsubscribeSettingsChanged = settingsPanel.onSettingsChanged(() =>
      this.afterSettingsChange(),
    );

    partStates.reset();
    this.decoration.add(
      this.planView.sceneObject,
      this.startHighlight.sceneObject,
      this.endHighlight.sceneObject,
    );
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint, modifiers: Modifiers): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    if (this.start === null) {
      this.start = placeSectionEnd(
        this.network,
        this.layout,
        this.viewport,
        ground,
        {
          useGrid: !modifiers.ctrl,
        },
      );
      return;
    }

    if (this.end === null) {
      const placed = placeSectionEnd(
        this.network,
        this.layout,
        this.viewport,
        ground,
        {
          useGrid: !modifiers.ctrl,
        },
      );
      if (!this.reachesBeyondStart(ground, placed)) return;

      this.end = placed;
      return;
    }

    // Nothing is added when the arc is refused, and the ends stay put so
    // the third click can be made again somewhere it works.
    const plan = this.planThrough(
      placeControlPoint(ground, { useGrid: !modifiers.ctrl }),
    );
    if (plan === null || !plan.buildable) return;

    const far = applyRoadPlan(this.network, plan);

    // The node at the far end is the network's now, so starting the next
    // arc from it is what makes the two share it. Its position is asked for
    // rather than assumed: the click may have landed on a junction that was
    // already there, a centimeter from where it was made.
    this.start = {
      kind: "node",
      node: far,
      position: this.network.getNode(far).position,
    };
    this.end = null;
  }

  /** The mark on where a click would land comes back: it answers where the
   * cursor is, not what was being drawn. */
  cancel(): void {
    this.start = null;
    this.end = null;
  }

  /** Keeps where the cursor is, and redraws for it. */
  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    this.lastCursor =
      ground === null ? null : { ground, useGrid: !modifiers.ctrl };
    this.redraw();
  }

  /** Redraws for the new width, at the cursor as it was. */
  afterSettingsChange(): void {
    this.startHighlight.setRoadWidth(this.settings.profile.width);
    this.endHighlight.setRoadWidth(this.settings.profile.width);
    this.redraw();
  }

  /**
   * Draws what a click at the last cursor would do. One of the three says
   * it, and how far the gesture has got picks which: the marks come off the
   * screen first, so each branch only has to put its own back. Which is also
   * what leaves nothing behind when there is no answer to draw at all.
   *
   * The mark on where the first click lands shows before that click, or
   * there is no way to see that it would join rather than start something
   * new.
   */
  private redraw(): void {
    this.planView.hide();
    this.startHighlight.hide();
    this.endHighlight.hide();

    if (this.lastCursor === null) {
      hideSpeculatedParts(this.partStates, null);
      showPlacedEnd(this.startHighlight, this.start, null);
      showPlacedEnd(this.endHighlight, this.end, null);
      return;
    }
    const { ground, useGrid } = this.lastCursor;

    // Both ends down: the arc bending through where the cursor is, which is
    // the whole of what the next click would build. That click places the
    // control point, which welds onto nothing, so it lands on nothing to mark.
    if (this.start !== null && this.end !== null) {
      const plan = this.planThrough(placeControlPoint(ground, { useGrid }));
      if (plan !== null) this.planView.showRoadPlan(this.network, plan);
      hideSpeculatedParts(this.partStates, plan);
      showPlacedEnd(this.startHighlight, this.start, plan);
      showPlacedEnd(this.endHighlight, this.end, plan);
      return;
    }

    const placed = placeSectionEnd(
      this.network,
      this.layout,
      this.viewport,
      ground,
      {
        useGrid,
      },
    );

    // No plan before both ends are down.
    hideSpeculatedParts(this.partStates, null);

    // Nothing placed: only where the first click would land.
    if (this.start === null) {
      showLanding(this.startHighlight, placed, null);
      return;
    }

    // One end down: the start, and where the second end would land. Nothing
    // where the click would land back on the start, which is a click with no
    // length to it and is refused.
    showPlacedEnd(this.startHighlight, this.start, null);
    if (this.reachesBeyondStart(ground, placed)) {
      showLanding(this.endHighlight, placed, null);
    }
  }

  /**
   * Whether a placement is far enough from the start to be the other end of
   * an arc.
   *
   * Measured twice, in pixels against the cursor and in meters against the
   * point it resolved to: zoomed in, a grid cell is wider than the pick
   * radius, so a cursor clear of the start can still round onto it. This
   * tool holds its ends, so one taken in the start's own place would stay
   * there — an arc the network refuses, with no way out but cancelling.
   */
  private reachesBeyondStart(ground: Vec2, placed: Placement): boolean {
    if (this.start === null) return false;
    if (withinPickRadius(this.viewport, ground, this.start.position)) {
      return false;
    }
    return !isSamePoint(placed.position, this.start.position);
  }

  /**
   * What an arc between the two ends through `via` would do, or null where
   * there is no section to ask about — before both ends are placed, or where
   * they resolved to the same place.
   *
   * A plan that does come back may still be unbuildable. Three points in a
   * line are the common one, and are what the control point drags through
   * crossing from side to side.
   */
  private planThrough(via: Vec2): RoadPlan | null {
    if (this.start === null || this.end === null) return null;

    const plan = planRoad(
      this.network,
      this.layout,
      endpointFrom(this.start),
      endpointFrom(this.end),
      { kind: "arc", via },
      this.settings.profile,
    );
    return plan.sectionPlan.pieces.length === 0 ? null : plan;
  }

  /** Releases GPU buffers and any UI. */
  dispose(): void {
    this.unsubscribeSettingsChanged();
    this.settingsPanel.dispose();
    this.planView.dispose();
    this.startHighlight.dispose();
    this.endHighlight.dispose();
  }
}
