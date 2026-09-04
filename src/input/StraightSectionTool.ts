import * as THREE from "three";
import { applySectionPlan, planSection, type SectionPlan } from "../core/edits";
import { nearestNode, positionOfNode } from "../core/queries";
import type { Endpoint, RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { NodeHighlight } from "../render/NodeHighlight";
import { SectionPlanView } from "../render/SectionPlanView";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import { snapToGrid } from "./gridSnap";
import type { Modifiers, Tool } from "./Tool";

/**
 * How close the cursor must look to a node to weld onto it. In pixels, so
 * the node is the same size of target at every zoom.
 *
 * A radius around a node, and nothing to do with the grid — the other way
 * a point is placed, which rounds each axis on its own and is measured in
 * meters (`GRID_PITCH_METERS`).
 */
const NODE_PICK_RADIUS_PIXELS = 12;

/**
 * Where a click puts an endpoint: how the point was arrived at, what the
 * model is told — an existing node once welded, a bare position otherwise
 * — and the point to draw it at, which is the node's own position when
 * the two differ.
 *
 * `kind` is what the tool reasons about; the endpoint alone cannot tell a
 * grid point from an unsnapped one, since both reach the model as a bare
 * position.
 */
interface Placement {
  readonly kind: "node" | "grid" | "free";
  readonly endpoint: Endpoint;
  readonly position: Vec2;
}

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
  private readonly decoration = new THREE.Group();

  private pending: Placement | null = null;

  /** Where the cursor was last seen, so the decoration can be redrawn
   * without it having moved. Null until the pointer is first heard from. */
  private cursor: ScreenPoint | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {
    this.decoration.add(this.planView.sceneObject, this.highlight.sceneObject);
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint, modifiers: Modifiers): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    const end = this.place(ground, modifiers);

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
      endpoint: far,
      position: positionOfNode(this.network, far),
    };

    // The decoration was drawn against the network as it was, where the
    // section's points were nodes that would be made. They have been, so
    // it is redrawn before the cursor moves and answers a question that
    // has already changed under it.
    this.showPlacement(point, modifiers);
  }

  /** Follows the cursor whether or not a section is being drawn — the mark
   * has to show before the first click, or there is no way to see that a
   * click would join rather than start something new. */
  onPointerMove(point: ScreenPoint, modifiers: Modifiers): void {
    this.cursor = point;
    this.showPlacement(point, modifiers);
  }

  /**
   * Ctrl moves where the cursor would place a point without the cursor
   * itself moving, so the decoration has to be redrawn from where it was
   * last seen — otherwise the mark keeps claiming a snap that pressing the
   * key has already called off.
   *
   * Which handler ran says what the modifier now is, so the event's own
   * `ctrlKey` is not consulted: browsers have not always agreed on what it
   * reads on the press and release of the very key it describes.
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Control") this.redraw({ ctrl: true });
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.key === "Control") this.redraw({ ctrl: false });
  }

  private redraw(modifiers: Modifiers): void {
    if (this.cursor === null) return;
    this.showPlacement(this.cursor, modifiers);
  }

  /** Draws what a click would do: the section it would build where there
   * is one to plan, and otherwise a mark on where the click would land. */
  private showPlacement(point: ScreenPoint, modifiers: Modifiers): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    const placed = this.place(ground, modifiers);
    const plan = this.planTo(ground, placed);

    if (plan !== null) {
      // The plan stands in for the placement mark: its last point is where
      // the click would land, and says more about it than "a click lands
      // here" does.
      this.planView.showPlan(this.network, plan);
      this.highlight.hide();
      return;
    }

    // Nothing to mark when the point is the cursor's own position.
    this.planView.hide();
    if (placed.kind === "free") {
      this.highlight.hide();
    } else {
      this.highlight.show(placed.position);
    }
  }

  /** The node highlight stays: it answers where the cursor is, not what was being drawn. */
  cancel(): void {
    this.pending = null;
    this.planView.hide();
  }

  /**
   * Decides where a ground position actually puts an endpoint.
   *
   * Welding beats the grid where both could apply — a grid point is never
   * a join. Ctrl skips both: the cursor's own position, over a node as
   * much as anywhere else, which is the only way to reach a point no rule
   * would produce.
   */
  private place(ground: Vec2, modifiers: Modifiers): Placement {
    if (modifiers.ctrl) {
      return { kind: "free", endpoint: ground, position: ground };
    }

    const node = nearestNode(this.network, ground, this.nodePickRadiusMeters);
    if (node !== null) {
      return { kind: "node", endpoint: node.id, position: node.position };
    }

    const snapped = snapToGrid(ground);
    return { kind: "grid", endpoint: snapped, position: snapped };
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
   * And where the chain comes back as a single point, which is the same
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
    if (this.withinNodePickRadius(ground, this.pending.position)) return null;

    const plan = planSection(this.network, this.pending.endpoint, end.endpoint);
    return plan.points.length < 2 ? null : plan;
  }

  /**
   * Whether two ground positions are close enough that a click at one of
   * them would weld onto a node at the other.
   */
  private withinNodePickRadius(ground: Vec2, of: Vec2): boolean {
    const distance = Math.hypot(ground.x - of.x, ground.z - of.z);
    return distance <= this.nodePickRadiusMeters;
  }

  private get nodePickRadiusMeters(): number {
    return NODE_PICK_RADIUS_PIXELS * this.viewport.metersPerPixel;
  }

  /** Releases the decoration's GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.planView.dispose();
    this.highlight.dispose();
  }
}
