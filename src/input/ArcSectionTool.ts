import * as THREE from "three";
import { applySectionPlan, planSection, type SectionPlan } from "../core/edits";
import { isSamePoint } from "../core/points";
import { positionOfNode } from "../core/queries";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { NodeHighlight } from "../render/NodeHighlight";
import { SectionHighlight } from "../render/SectionHighlight";
import {
  BUILDABLE_COLOR,
  EXISTING_NODE_COLOR,
  SectionPlanView,
} from "../render/SectionPlanView";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import {
  placeControlPoint,
  placeEndpoint,
  withinPickRadius,
  type Placement,
} from "./sectionPointPlacement";
import type { Modifiers, Tool } from "./Tool";

/**
 * Violet for a gesture that has not become a question yet — neither the
 * green of a section about to be built nor the red of one turned down.
 */
const IN_PROGRESS_COLOR = 0xcc88ff;

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
  /** Where the first click would land, before there is a gesture to draw. */
  private readonly firstPointHighlight = new NodeHighlight();
  /** The start, and the chord out to where the second end would land. */
  private readonly chordHighlight = new SectionHighlight(IN_PROGRESS_COLOR);
  /** Where the control point has landed. In the gesture's own color and not
   * the plan's, since it is a position the cursor is holding rather than
   * anything the edit would build. */
  private readonly viaHighlight = new NodeHighlight();
  /** The full plan to build the arc. */
  private readonly planView = new SectionPlanView();
  private readonly decoration = new THREE.Group();

  /** The ends, in the order they were clicked. */
  private start: Placement | null = null;
  private end: Placement | null = null;

  /** Where the cursor was last seen, so the decoration can be redrawn
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
    this.decoration.add(
      this.planView.sceneObject,
      this.chordHighlight.sceneObject,
      this.viaHighlight.sceneObject,
      this.firstPointHighlight.sceneObject,
    );

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

    if (this.start === null) {
      this.start = placeEndpoint(
        this.network,
        this.viewport,
        ground,
        modifiers,
      );

      // The mark on where a click lands gives way to the gesture, and the
      // cursor has not moved to ask for it.
      this.redraw();
      return;
    }

    if (this.end === null) {
      const placed = placeEndpoint(
        this.network,
        this.viewport,
        ground,
        modifiers,
      );
      if (!this.reachesBeyondStart(ground, placed)) return;

      this.end = placed;
      this.redraw();
      return;
    }

    // Nothing is added when the arc is refused, and the ends stay put so
    // the third click can be made again somewhere it works.
    const plan = this.planThrough(placeControlPoint(ground, modifiers));
    if (plan === null || !plan.buildable) return;

    const far = applySectionPlan(this.network, plan);

    // The node at the far end is the network's now, so starting the next
    // arc from it is what makes the two share it. Its position is asked for
    // rather than assumed: the click may have landed on a junction that was
    // already there, a centimeter from where it was made.
    this.start = {
      kind: "node",
      endpoint: far,
      position: positionOfNode(this.network, far),
    };
    this.end = null;

    this.redraw();
  }

  /** Follows the cursor whether or not an arc is being drawn — the mark has
   * to show before the first click, or there is no way to see that a click
   * would join rather than start something new. */
  onPointerMove(point: ScreenPoint, modifiers: Modifiers): void {
    this.cursor = point;
    this.modifiers = modifiers;
    this.redraw();
  }

  /**
   * Ctrl moves where the cursor would place a point without the cursor
   * itself moving, so the decoration has to be redrawn from where it was
   * last seen — otherwise the mark keeps claiming a snap that pressing the
   * key has already called off.
   */
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

  /**
   * Draws what a click would do. One of the three says it, and how far the
   * gesture has got picks which: everything comes off the screen first, so
   * each branch only has to put its own back. Which is also what leaves
   * nothing behind when there is no answer to draw at all.
   *
   * Asked of the cursor and the modifiers as last seen, so it answers for
   * whatever moved — the cursor, the modifier, or the camera under both.
   */
  private redraw(): void {
    this.planView.hide();
    this.chordHighlight.hide();
    this.viaHighlight.hide();
    this.firstPointHighlight.hide();

    if (this.cursor === null) return;

    const ground = this.viewport.screenToGround(this.cursor);
    if (ground === null) return;

    // Both ends down: the arc bending through where the cursor is, which is
    // the whole of what the next click would build plus the control point.
    if (this.start !== null && this.end !== null) {
      const via = placeControlPoint(ground, this.modifiers);
      const plan = this.planThrough(via);
      if (plan !== null) {
        this.planView.showPlan(this.network, plan);
        this.viaHighlight.show(via, IN_PROGRESS_COLOR);
      }
      return;
    }

    // One end down: the start, and the chord out to where the second end
    // would land. No chord where the click would land back on the start,
    // which is a click with no length to it and is refused.
    if (this.start !== null) {
      const placed = placeEndpoint(
        this.network,
        this.viewport,
        ground,
        this.modifiers,
      );
      if (!this.reachesBeyondStart(ground, placed)) {
        this.chordHighlight.show([], [this.start.position]);
        return;
      }

      const ends = [this.start.position, placed.position];
      this.chordHighlight.show([ends], ends);
      return;
    }

    // Nothing placed: only where the first click would land, and not even
    // that when it would land on the cursor's own position.
    const placed = placeEndpoint(
      this.network,
      this.viewport,
      ground,
      this.modifiers,
    );
    if (placed.kind !== "free") {
      this.firstPointHighlight.show(
        placed.position,
        placed.kind === "node" ? EXISTING_NODE_COLOR : BUILDABLE_COLOR,
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
   * what the control point drags through crossing from side to side.
   */
  private planThrough(via: Vec2): SectionPlan | null {
    if (this.start === null || this.end === null) return null;

    const plan = planSection(
      this.network,
      this.start.endpoint,
      this.end.endpoint,
      { kind: "arc", via },
    );
    return plan.pieces.length === 0 ? null : plan;
  }

  /** The mark on where a click would land comes back: it answers where the
   * cursor is, not what was being drawn. */
  cancel(): void {
    this.start = null;
    this.end = null;
    this.redraw();
  }

  /** Releases the decoration's GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.unsubscribeViewChanged();
    this.planView.dispose();
    this.chordHighlight.dispose();
    this.viaHighlight.dispose();
    this.firstPointHighlight.dispose();
  }
}
