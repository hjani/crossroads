import * as THREE from "three";
import {
  applyRoadPlan,
  planRoad,
  type RoadPlan,
} from "../core/layout/roadPlan";
import type { RoadLayout } from "../core/layout/RoadLayout";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import { STRAIGHT } from "../core/geometry/lineGeometry";
import { JunctionHighlight } from "../render/JunctionHighlight";
import type { PartStates } from "../render/PartStates";
import { SectionPlanView } from "../render/SectionPlanView";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import {
  endpointFrom,
  placeSectionEnd,
  withinPickRadius,
  type Placement,
} from "./sectionPointPlacement";
import { hideSpeculatedParts, showLanding, showPlacedEnd } from "./toolHelpers";
import type { Modifiers, Tool } from "./Tool";
import type { Vec2 } from "../core/geometry/point";
import type { SectionSettingsPanel } from "../ui/SectionSettingsPanel";
import type { SectionSettings } from "./SectionSettings";

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
  private readonly planView = new SectionPlanView("surface");
  /** The start, once placed. */
  private readonly startMark: JunctionHighlight;
  /** Where the next click would land. */
  private readonly landingMark: JunctionHighlight;
  private readonly decoration = new THREE.Group();
  private readonly unsubscribeSettingsChanged: () => void;

  private pending: Placement | null = null;
  /**
   * What the cursor was last aimed at: the raw position on the ground and the
   * resolved placement.
   */
  private aim: { ground: Vec2; placed: Placement } | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private readonly viewport: Viewport,
    private readonly partStates: PartStates,
    private readonly settings: SectionSettings,
    private readonly settingsPanel: SectionSettingsPanel,
  ) {
    this.startMark = new JunctionHighlight(settings.profile.width);
    this.landingMark = new JunctionHighlight(settings.profile.width);
    this.unsubscribeSettingsChanged = settingsPanel.onSettingsChanged(() =>
      this.afterSettingsChange(),
    );

    partStates.reset();
    this.decoration.add(
      this.planView.sceneObject,
      this.startMark.sceneObject,
      this.landingMark.sceneObject,
    );
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint, modifiers: Modifiers): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    const end = placeSectionEnd(
      this.network,
      this.layout,
      this.viewport,
      ground,
      {
        useGrid: !modifiers.ctrl,
      },
    );

    if (this.pending === null) {
      this.pending = end;
      return;
    }

    // Nothing was added when the section is refused, and it stays in
    // progress so the same click can be made again somewhere it works.
    const plan = this.planTo(ground, end);
    if (plan === null || !plan.buildable) return;

    const far = applyRoadPlan(this.network, plan);

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

  /** The landing mark comes back: it answers where the cursor is, not
   * what was being drawn. */
  cancel(): void {
    this.pending = null;
  }

  /**
   * Works out what the cursor aims at, and redraws for it.
   *
   * Asked again after every input and change of view, so it answers for
   * whatever changed — the cursor, Ctrl, the camera, or the network once a
   * click has built a section.
   */
  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    this.aim =
      ground === null
        ? null
        : {
            ground,
            placed: placeSectionEnd(
              this.network,
              this.layout,
              this.viewport,
              ground,
              { useGrid: !modifiers.ctrl },
            ),
          };
    this.redraw();
  }

  /**
   * Redraws for the new width. Where a click lands doesn't depend on it, so
   * the aim stays as it was.
   */
  afterSettingsChange(): void {
    this.startMark.setRoadWidth(this.settings.profile.width);
    this.landingMark.setRoadWidth(this.settings.profile.width);
    this.redraw();
  }

  /**
   * Draws what a click at the aim would do: the section it would build where
   * there is one to plan, the start once placed, and where the click would
   * land.
   *
   * Where the click lands shows before the first click too, or there is no
   * way to see that it would join rather than start something new.
   */
  private redraw(): void {
    const placed = this.aim?.placed ?? null;
    const plan =
      this.aim === null ? null : this.planTo(this.aim.ground, this.aim.placed);

    hideSpeculatedParts(this.partStates, plan);
    if (plan !== null) {
      this.planView.showRoadPlan(this.network, plan);
    } else {
      this.planView.hide();
    }

    // No plan with a start down means the cursor is still on that start: a
    // click there does nothing, so it lands nowhere.
    showPlacedEnd(this.startMark, this.pending, plan);
    showLanding(
      this.landingMark,
      this.pending !== null && plan === null ? null : placed,
      plan,
    );
  }

  /**
   * What a road from the point in progress to `end` would do, or null where
   * there is no section to ask about.
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
   * A plan that does come back may still be unbuildable. Between them the
   * two outcomes are the whole of what a click would do, so showing this
   * answer shows what the click does rather than an approximation of it.
   */
  private planTo(ground: Vec2, end: Placement): RoadPlan | null {
    if (this.pending === null) return null;
    if (withinPickRadius(this.viewport, ground, this.pending.position)) {
      return null;
    }

    const plan = planRoad(
      this.network,
      this.layout,
      endpointFrom(this.pending),
      endpointFrom(end),
      STRAIGHT,
      this.settings.profile,
    );
    return plan.sectionPlan.pieces.length === 0 ? null : plan;
  }

  /**
   * Releases GPU buffers and any UI.
   */
  dispose(): void {
    this.unsubscribeSettingsChanged();
    this.settingsPanel.dispose();
    this.planView.dispose();
    this.startMark.dispose();
    this.landingMark.dispose();
  }
}
