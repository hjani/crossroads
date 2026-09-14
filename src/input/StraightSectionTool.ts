import * as THREE from "three";
import { applySectionPlan, planSection, type SectionPlan } from "../core/edits";
import type { RoadNetwork } from "../core/RoadNetwork";
import { STRAIGHT, type Vec2 } from "../core/types";
import { STATE_COLOR } from "../render/colors";
import { NodeHighlight } from "../render/NodeHighlight";
import { SectionHighlight } from "../render/SectionHighlight";
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
 * Draws straight sections by clicking their endpoints.
 *
 * The first click sets a start point; each one after it commits a section
 * and becomes the start of the next, so a run of roads is drawn without
 * re-clicking the joins. Cancelling ends the run and keeps what was
 * already committed.
 *
 * A click near an existing node uses that node instead of the position
 * under the cursor, which is how separately drawn roads come to meet.
 * Everywhere else it lands on the nearest grid point, unless Ctrl is held
 * to place it exactly where it was made.
 *
 * The rubber-band preview is the tool's own: what an edit in progress
 * looks like is the tool's business, not its caller's.
 */
export class StraightSectionTool implements Tool {
  private readonly planView = new SectionPlanView();
  private readonly highlight = new NodeHighlight();
  private readonly hoverHighlight: SectionHighlight;
  private readonly decoration = new THREE.Group();

  private pending: Placement | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {
    this.hoverHighlight = new SectionHighlight(network, STATE_COLOR.AIMED);
    this.decoration.add(
      this.planView.sceneObject,
      this.highlight.sceneObject,
      this.hoverHighlight.sceneObject,
    );
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint, modifiers: Modifiers): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    const end = placeSectionEnd(this.network, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });

    if (this.pending === null) {
      this.pending = end;
      return;
    }

    // Nothing was added when the section is refused, and it stays in
    // progress so the same click can be made again somewhere it works.
    const plan = this.planTo(ground, end);
    if (plan === null || !plan.buildable) return;

    const far = applySectionPlan(this.network, plan);

    // The node at the far end is the network's now, so starting the next
    // section from it is what makes the two share it. Its position is asked
    // for rather than assumed: the click may have landed on a junction that
    // was already there, a centimeter from where it was made.
    this.pending = {
      kind: "node",
      node: far,
      position: this.network.getNode(far).position,
    };
  }

  /** The node highlight comes back: it answers where the cursor is, not
   * what was being drawn. */
  cancel(): void {
    this.pending = null;
  }

  /**
   * Draws what a click would do: the section it would build where there is
   * one to plan, and otherwise a mark on where the click would land.
   *
   * Drawn from scratch after every input and change of view, so it answers
   * for whatever changed — the cursor, Ctrl, the camera, or the network once
   * a click has built a section.
   *
   * The mark shows before the first click too, or there is no way to see
   * that a click would join rather than start something new.
   */
  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    if (ground === null) {
      this.planView.hide();
      this.highlight.hide();
      this.hoverHighlight.hide();
      return;
    }

    const placed = placeSectionEnd(this.network, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });
    const plan = this.planTo(ground, placed);

    if (plan !== null) {
      // The plan stands in for the placement mark: its last point is where
      // the click would land, and says more about it than "a click lands
      // here" does. Only the section it would weld onto is hovered.
      this.planView.showPlan(this.network, plan);
      this.highlight.hide();
      if (placed.kind === "section") {
        this.hoverHighlight.show([placed.section], []);
      } else {
        this.hoverHighlight.hide();
      }
      return;
    }

    // No plan with a start down means the cursor is still on that start, so
    // the start is what gets marked: already clicked, not only hovered — and
    // a click there does nothing, so nothing is hovered either. Before a
    // start, the section welded onto is hovered. Nothing to mark when the
    // point is the cursor's own position.
    this.planView.hide();
    if (this.pending === null && placed.kind === "section") {
      this.hoverHighlight.show([placed.section], []);
    } else {
      this.hoverHighlight.hide();
    }

    const marked = this.pending ?? placed;
    if (marked.kind === "free") {
      this.highlight.hide();
    } else {
      this.highlight.show(
        marked.position,
        marked.kind === "node" ? STATE_COLOR.SELECTED : STATE_COLOR.PLANNED,
      );
    }
  }

  /**
   * What the network makes of a section from the point in progress to
   * `end`, or null where there is no section to ask about.
   *
   * Null three times over. Before the first click, there is nothing to
   * plan from. While the cursor has not left the start's pick radius, it
   * is not a section however the click resolved — measured from `ground`,
   * where the cursor actually is, rather than between the two resolved
   * points, because zoomed out the radius covers neighboring nodes too,
   * and welding onto one of those would draw a road out of a click that
   * was aimed at the start.
   *
   * And where the chain comes back with no piece in it, which is the same
   * absence arrived at in meters rather than pixels: the click resolved
   * onto the place the section started from. Zoomed in, a grid cell is
   * wider than the pick radius, so this is the only one of the three that
   * catches a cursor still inside the cell it started in.
   *
   * A plan that does come back may still be unbuildable, which is a
   * different thing and the network's to say. Between them the two
   * outcomes are the whole of what a click would do, so showing this
   * answer shows what the click does rather than an approximation of it.
   */
  private planTo(ground: Vec2, end: Placement): SectionPlan | null {
    if (this.pending === null) return null;
    if (withinPickRadius(this.viewport, ground, this.pending.position)) {
      return null;
    }

    const plan = planSection(
      this.network,
      endpointFrom(this.pending),
      endpointFrom(end),
      STRAIGHT,
    );
    return plan.pieces.length === 0 ? null : plan;
  }

  /** Releases the decoration's GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.planView.dispose();
    this.highlight.dispose();
    this.hoverHighlight.dispose();
  }
}
