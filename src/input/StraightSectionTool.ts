import * as THREE from "three";
import { nearestNode } from "../core/queries";
import type { Endpoint, RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { NodeHighlight } from "../render/NodeHighlight";
import { SectionPreview } from "../render/SectionPreview";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import type { Tool } from "./Tool";

/**
 * How close the cursor must look to a node to weld onto it. In pixels, so
 * the node is the same size of target at every zoom.
 */
const SNAP_RADIUS_PIXELS = 12;

/**
 * Where a click puts an endpoint: what the model is told — an existing
 * node once snapped, a bare position otherwise — and the point to draw it
 * at, which is the node's own position when the two differ.
 */
interface Placement {
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
 * Everywhere else the click lands exactly where it was made.
 *
 * The rubber-band preview is the tool's own: what an edit in progress
 * looks like is the tool's business, not its caller's.
 */
export class StraightSectionTool implements Tool {
  private readonly preview = new SectionPreview();
  private readonly highlight = new NodeHighlight();
  private readonly decoration = new THREE.Group();

  private pending: Placement | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {
    this.decoration.add(this.preview.sceneObject, this.highlight.sceneObject);
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    if (this.pending === null) {
      this.pending = this.place(ground);
      return;
    }

    if (this.isAtPendingStart(ground)) return;

    // The section owns the node made for its far end, so starting the next
    // one from that node id is what makes the two share it.
    const end = this.place(ground);
    const section = this.network.addSection(this.pending.endpoint, end.endpoint);
    this.pending = { endpoint: section.to, position: end.position };
  }

  /** Follows the cursor whether or not a section is being drawn — the mark
   * has to show before the first click, or there is no way to see that a
   * click would join rather than start something new. */
  onPointerMove(point: ScreenPoint): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    const placed = this.place(ground);
    // A placement that snapped names a node; one that did not is a position.
    if (typeof placed.endpoint === "number") {
      this.highlight.show(placed.position);
    } else {
      this.highlight.hide();
    }

    if (this.pending === null) return;
    this.preview.show(this.pending.position, placed.position);
  }

  /** The node highlight stays: it answers where the cursor is, not what was being drawn. */
  cancel(): void {
    this.pending = null;
    this.preview.hide();
  }

  /** Snaps a ground position onto the nearest node in reach, if there is one. */
  private place(ground: Vec2): Placement {
    const node = nearestNode(this.network, ground, this.snapRadiusMeters);
    return node === null
      ? { endpoint: ground, position: ground }
      : { endpoint: node.id, position: node.position };
  }

  /**
   * Whether a click there would end the section where it started.
   *
   * Measured from the cursor rather than between the two placements:
   * zoomed out, the reach of neighboring nodes overlaps, and a cursor
   * still on top of the start is not a section however it snapped.
   */
  private isAtPendingStart(ground: Vec2): boolean {
    if (this.pending === null) return false;

    const { position } = this.pending;
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
