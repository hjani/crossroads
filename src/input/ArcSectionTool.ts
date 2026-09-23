import * as THREE from "three";
import {
  applySectionPlan,
  planSection,
  type SectionPlan,
} from "../core/network/edits";
import { isSamePoint, type Vec2 } from "../core/geometry/point";
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
  placeControlPoint,
  withinPickRadius,
  type Placement,
} from "./sectionPointPlacement";
import { isTooTight } from "./curveLimits";
import { showWeldTarget } from "./toolHelpers";
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
  /** The start: a point the first click would make, and after the click the
   * start it placed, until both ends are down and the plan marks it. */
  private readonly startHighlight = new NodeHighlight();
  /** A point the second click would make. */
  private readonly endHighlight = new NodeHighlight();
  /** The highlight of the item under the cursor. */
  private readonly hoverHighlight: RoadNetworkHighlight;
  /** The full plan to build the arc. */
  private readonly planView = new SectionPlanView();
  private readonly decoration = new THREE.Group();

  /** The ends, in the order they were clicked. */
  private start: Placement | null = null;
  private end: Placement | null = null;

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
    this.decoration.add(
      this.planView.sceneObject,
      this.startHighlight.sceneObject,
      this.endHighlight.sceneObject,
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

    const far = applySectionPlan(this.network, plan);

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

  /**
   * Draws what a click would do. One of the three says it, and how far the
   * gesture has got picks which: everything comes off the screen first, so
   * each branch only has to put its own back. Which is also what leaves
   * nothing behind when there is no answer to draw at all.
   *
   * Drawn from scratch after every input and change of view, so it answers
   * for whatever changed — the cursor, Ctrl, the camera, or how far the
   * gesture has got. The mark on where the first click lands shows before
   * that click, or there is no way to see that it would join rather than
   * start something new.
   */
  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    this.planView.hide();
    this.startHighlight.hide();
    this.endHighlight.hide();
    this.hoverHighlight.hide();

    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    if (ground === null) return;

    // Both ends down: the arc bending through where the cursor is, which is
    // the whole of what the next click would build. That click places the
    // control point, which welds onto nothing, so nothing is hovered.
    const useGrid = !modifiers.ctrl;
    if (this.start !== null && this.end !== null) {
      const plan = this.planThrough(placeControlPoint(ground, { useGrid }));
      if (plan !== null) this.planView.showPlan(this.network, plan);
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

    // Nothing placed: only where the first click would land.
    if (this.start === null) {
      this.markWhereClickLands(this.startHighlight, placed);
      return;
    }

    // One end down: the start, and where the second end would land. Nothing
    // where the click would land back on the start, which is a click with no
    // length to it and is refused.
    this.startHighlight.show(
      this.start.position,
      this.start.kind === "node" ? STATE_COLOR.SELECTED : STATE_COLOR.PLANNED,
    );
    if (!this.reachesBeyondStart(ground, placed)) return;

    this.markWhereClickLands(this.endHighlight, placed);
  }

  /**
   * Marks where an end click would land: a node already there, or one it
   * would make.
   */
  private markWhereClickLands(mark: NodeHighlight, placed: Placement): void {
    showWeldTarget(this.hoverHighlight, placed);
    if (placed.kind !== "free") {
      mark.show(
        placed.position,
        placed.kind === "node" ? STATE_COLOR.SELECTED : STATE_COLOR.PLANNED,
      );
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
   * What the network makes of an arc between the two ends through `via`, or
   * null where there is no section to ask about — before both ends are
   * placed, or where they resolved to the same place.
   *
   * A plan that does come back may still be unbuildable, which is the
   * network's to say. Three points in a line are the common one, and are
   * what the control point drags through crossing from side to side. It is
   * also unbuildable where the arc curves too tightly, which is the tool's
   * own limit.
   */
  private planThrough(via: Vec2): SectionPlan | null {
    if (this.start === null || this.end === null) return null;

    const geometry = { kind: "arc", via } as const;
    const plan = planSection(
      this.network,
      endpointFrom(this.start),
      endpointFrom(this.end),
      geometry,
    );
    if (plan.pieces.length === 0) return null;

    const tooTight = isTooTight(
      this.start.position,
      this.end.position,
      geometry,
      ROAD_WIDTH_METERS,
    );
    return tooTight ? { ...plan, buildable: false } : plan;
  }

  /** Releases the decoration's GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.planView.dispose();
    this.startHighlight.dispose();
    this.endHighlight.dispose();
    this.hoverHighlight.dispose();
  }
}
