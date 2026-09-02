import * as THREE from "three";
import { nearestNode } from "../core/queries";
import type { Endpoint, RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { NodeHighlight } from "../render/NodeHighlight";
import { SectionPreview } from "../render/SectionPreview";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import { snapToGrid } from "./gridSnap";
import type { Modifiers, Tool } from "./Tool";

/**
 * How close the cursor must look to a node to weld onto it. In pixels, so
 * the node is the same size of target at every zoom.
 */
const SNAP_RADIUS_PIXELS = 12;

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
  private readonly preview = new SectionPreview();
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
    this.decoration.add(this.preview.sceneObject, this.highlight.sceneObject);
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

    if (this.endsWhereItStarted(ground, end)) return;

    // The section owns the node made for its far end, so starting the next
    // one from that node id is what makes the two share it.
    const section = this.network.addSection(this.pending.endpoint, end.endpoint);
    this.pending = { kind: "node", endpoint: section.to, position: end.position };
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

  /** Marks where a click would land, and rubber-bands to it if a section
   * is being drawn. */
  private showPlacement(point: ScreenPoint, modifiers: Modifiers): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    const placed = this.place(ground, modifiers);
    // Nothing to mark when the point is the cursor's own position.
    if (placed.kind === "free") {
      this.highlight.hide();
    } else {
      this.highlight.show(placed.position);
    }

    if (this.pending === null) return;
    this.preview.show(this.pending.position, placed.position);
  }

  /** The node highlight stays: it answers where the cursor is, not what was being drawn. */
  cancel(): void {
    this.pending = null;
    this.preview.hide();
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

    const node = nearestNode(this.network, ground, this.snapRadiusMeters);
    if (node !== null) {
      return { kind: "node", endpoint: node.id, position: node.position };
    }

    const snapped = snapToGrid(ground);
    return { kind: "grid", endpoint: snapped, position: snapped };
  }

  /**
   * Whether a click there would end the section where it started.
   *
   * Two ways it can. The endpoint may resolve to the point the section
   * started from — the same node, or the same grid point — which is what
   * catches a second click anywhere within the cell the first one landed
   * in. Or the cursor may not have left the start's reach, which catches
   * the unsnapped case, where two positions are distinct but a fraction
   * of a pixel apart. That one is measured from the cursor rather than
   * between the placements: zoomed out, the reach of neighboring nodes
   * overlaps, and a cursor still on top of the start is not a section
   * however it snapped.
   */
  private endsWhereItStarted(ground: Vec2, end: Placement): boolean {
    if (this.pending === null) return false;

    const { position } = this.pending;
    if (end.position.x === position.x && end.position.z === position.z) {
      return true;
    }

    const distance = Math.hypot(ground.x - position.x, ground.z - position.z);
    return distance <= this.snapRadiusMeters;
  }

  private get snapRadiusMeters(): number {
    return SNAP_RADIUS_PIXELS * this.viewport.metersPerPixel;
  }

  /** Releases the decoration's GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.preview.dispose();
    this.highlight.dispose();
  }
}
