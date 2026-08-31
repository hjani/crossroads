import type * as THREE from "three";
import type { Endpoint, RoadNetwork } from "../core/RoadNetwork";
import type { Vec2 } from "../core/types";
import { SectionPreview } from "../render/SectionPreview";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import type { Tool } from "./Tool";

/** Where the next section starts, and the position to draw the preview from. */
interface PendingStart {
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
 * Clicks land where the cursor is. Deciding to place a point somewhere
 * else — onto an existing node, onto a grid — belongs here too, but is not
 * part of the tool yet.
 *
 * The rubber-band preview is the tool's own: what an edit in progress
 * looks like is the tool's business, not its caller's.
 */
export class StraightSectionTool implements Tool {
  private readonly preview = new SectionPreview();

  private pending: PendingStart | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {}

  get overlay(): THREE.Object3D {
    return this.preview.sceneObject;
  }

  onPointerDown(point: ScreenPoint): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    if (this.pending === null) {
      this.pending = { endpoint: ground, position: ground };
      return;
    }

    // The section owns the node made for its far end, so starting the next
    // one from that node id is what makes the two share it.
    const section = this.network.addSection(this.pending.endpoint, ground);
    this.pending = { endpoint: section.to, position: ground };
  }

  onPointerMove(point: ScreenPoint): void {
    if (this.pending === null) return;

    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    this.preview.show(this.pending.position, ground);
  }

  cancel(): void {
    this.pending = null;
    this.preview.hide();
  }

  /** Releases the preview's GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.preview.dispose();
  }
}
