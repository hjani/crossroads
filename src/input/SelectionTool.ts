import * as THREE from "three";
import { nearestNode, nearestSection, positionOfNode } from "../core/queries";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { NodeId, SectionId, Vec2 } from "../core/types";
import {
  SectionHighlight,
  type HighlightedSection,
} from "../render/SectionHighlight";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import type { Tool } from "./Tool";

/**
 * How close the cursor must look to a section to pick it. In pixels, so a
 * section is the same size of target at every zoom — the same reasoning as
 * `NODE_PICK_RADIUS_PIXELS` in `StraightSectionTool`.
 */
const SECTION_PICK_RADIUS_PIXELS = 10;

/**
 * How close the cursor must look to a node to pick it. Its own number
 * rather than the one `StraightSectionTool` welds within: selecting a node
 * and welding onto one are different gestures, free to want different
 * targets.
 */
const NODE_PICK_RADIUS_PIXELS = 12;

/**
 * What the cursor is aimed at: the thing a click would land on or act on.
 *
 * Named for the state rather than for hovering, because that is the color
 * rule the scene is heading for — color says what state something is in,
 * shape and size say what kind of thing it is. It lives here until the
 * palette those five colors belong in exists.
 */
const AIMED_COLOR = 0xffdd44;

/**
 * What is selected: still there once the cursor has moved off it, which is
 * the whole difference from being aimed at.
 */
const SELECTED_COLOR = 0x66ccff;

/**
 * What a click selects. The kind is what the tool reasons about: the two
 * are marked differently, and their ids name different things.
 */
type Selection =
  | { readonly kind: "node"; readonly id: NodeId }
  | { readonly kind: "section"; readonly id: SectionId };

/** Whether two selections name the same thing. */
function sameSelection(
  one: Selection | null,
  other: Selection | null,
): boolean {
  return (
    one !== null &&
    other !== null &&
    one.kind === other.kind &&
    one.id === other.id
  );
}

/**
 * Selects a node or a section by clicking it, and marks the one a click
 * would catch before the click is made.
 *
 * Both marks come from the same `selectionAt` question, the aimed one asking
 * it a move earlier, so what is marked and what a click catches cannot
 * disagree. Without the aimed mark there is no way to see that the cursor
 * is close enough — which is what the straight tool's node mark is for,
 * one gesture over.
 *
 * Clicking clear of everything deselects, which is how a selection is
 * dropped without leaving the tool.
 *
 * The selection lives here and dies with the tool, since the manager
 * disposes a tool it switches away from. Nothing outside can read it yet;
 * what it is *for* — deleting, and later editing what is selected — is the
 * rest of M3.
 */
export class SelectionTool implements Tool {
  private readonly aimedMark = new SectionHighlight(AIMED_COLOR);
  private readonly selectedMark = new SectionHighlight(SELECTED_COLOR);
  private readonly decoration = new THREE.Group();

  private selected: Selection | null = null;

  /** Where the cursor was last seen, so the aimed mark can be redrawn
   * without it having moved. Null until the pointer is first heard from. */
  private cursor: ScreenPoint | null = null;

  private readonly unsubscribeViewChanged: () => void;

  constructor(
    private readonly network: RoadNetwork,
    private readonly viewport: Viewport,
  ) {
    this.decoration.add(
      this.aimedMark.sceneObject,
      this.selectedMark.sceneObject,
    );

    this.unsubscribeViewChanged = viewport.onViewChanged(() => this.redraw());
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    this.cursor = point;
    this.selected = this.selectionAt(ground);

    // Both marks are redrawn under a cursor that has not moved: the click
    // changed what is selected, and with it whether the aimed mark is the
    // one being suppressed.
    this.showSelected();
    this.showAimed(ground);
  }

  onPointerMove(point: ScreenPoint): void {
    this.cursor = point;
    this.redraw();
  }

  /** Escape drops the selection. The aimed mark stays: it answers where the
   * cursor is, not what was being held — and it is drawn again, since
   * dropping the selection is what un-suppresses it. */
  cancel(): void {
    this.selected = null;
    this.selectedMark.hide();
    this.redraw();
  }

  /** Draws the aimed mark from where the cursor was last seen, for when the
   * answer changed under a cursor that has not moved. */
  private redraw(): void {
    if (this.cursor === null) return;

    const ground = this.viewport.screenToGround(this.cursor);
    if (ground === null) return;

    this.showAimed(ground);
  }

  /**
   * What a click at `ground` would select, or null for nothing in reach.
   *
   * A node wins outright rather than the two being weighed on distance: it
   * sits on the sections meeting it, so measured against them it would
   * never be the nearer thing.
   */
  private selectionAt(ground: Vec2): Selection | null {
    const node = nearestNode(
      this.network,
      ground,
      NODE_PICK_RADIUS_PIXELS * this.viewport.metersPerPixel,
    );
    if (node !== null) {
      return { kind: "node", id: node.id };
    }

    const section = nearestSection(
      this.network,
      ground,
      SECTION_PICK_RADIUS_PIXELS * this.viewport.metersPerPixel,
    );
    return section === null ? null : { kind: "section", id: section.id };
  }

  /**
   * Marks what the cursor is aimed at — that thing alone: a section is its
   * line, a node the one mark. Marking what hangs off it as well would be
   * a lot of movement for a question the line, or the node, has already
   * answered.
   *
   * Nothing is drawn over what is already selected, there being nothing
   * worth painting over the selection to say. Over that exact thing only,
   * though: a section meeting the selected node is still marked, since
   * clicking it would change the selection.
   */
  private showAimed(ground: Vec2): void {
    const aimed = this.selectionAt(ground);
    if (aimed === null || sameSelection(aimed, this.selected)) {
      this.aimedMark.hide();
      return;
    }

    if (aimed.kind === "node") {
      this.aimedMark.show([], [positionOfNode(this.network, aimed.id)]);
    } else {
      this.aimedMark.show([this.highlightOf(aimed.id)], []);
    }
  }

  /**
   * Marks the selection: a section with the nodes at either end, a node
   * with every section meeting it. Reaching past the thing named is what
   * separates a selection from something merely under the cursor, beyond
   * the color — and it reaches exactly that far, the far ends of a node's
   * sections being where the selection stops rather than part of it.
   */
  private showSelected(): void {
    const selected = this.selected;
    if (selected === null) {
      this.selectedMark.hide();
      return;
    }

    if (selected.kind === "node") {
      this.selectedMark.show(
        this.network.sectionsAt(selected.id).map((id) => this.highlightOf(id)),
        [positionOfNode(this.network, selected.id)],
      );
    } else {
      const highlight = this.highlightOf(selected.id);
      this.selectedMark.show([highlight], [highlight.from, highlight.to]);
    }
  }

  /**
   * Where a section runs, which is what the highlight draws. Throws for an
   * id the network does not have, as `positionOfNode` does: what is
   * selected came from a query a moment earlier, and nothing else edits the
   * network while this tool is active.
   */
  private highlightOf(id: SectionId): HighlightedSection {
    const section = this.network.getSection(id);
    if (section === undefined) {
      throw new Error(`Unknown section ${id}`);
    }
    return {
      from: positionOfNode(this.network, section.from),
      to: positionOfNode(this.network, section.to),
    };
  }

  /** Releases the marks' GPU buffers. The tool is unusable after. */
  dispose(): void {
    this.unsubscribeViewChanged();
    this.aimedMark.dispose();
    this.selectedMark.dispose();
  }
}
