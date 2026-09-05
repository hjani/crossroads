import * as THREE from "three";
import { nearestSection, positionOfNode } from "../core/queries";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Section, SectionId, Vec2 } from "../core/types";
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
 * Selects a section by clicking it, and marks the one a click would catch
 * before the click is made.
 *
 * Both marks come from the same `nearestSection` question, the aimed one
 * asking it a move earlier, so what is marked and what a click catches
 * cannot disagree. Without the aimed mark there is no way to see that the
 * cursor is close enough — which is what the straight tool's node mark is
 * for, one gesture over.
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

  private selected: SectionId | null = null;

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
    this.selected = this.sectionAt(ground)?.id ?? null;

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

  /** The section a click at `ground` would catch, or null for none. */
  private sectionAt(ground: Vec2): Section | null {
    return nearestSection(
      this.network,
      ground,
      SECTION_PICK_RADIUS_PIXELS * this.viewport.metersPerPixel,
    );
  }

  /**
   * Marks the section under the cursor — the line alone, since the mark
   * answers "would a click catch this section" and marking both ends as
   * well would be a lot of movement for a question the line has already
   * answered.
   *
   * Nothing is drawn over the selected section. It is already marked, and
   * saying it is also the one under the cursor adds nothing worth painting
   * over the selection to say.
   */
  private showAimed(ground: Vec2): void {
    const section = this.sectionAt(ground);
    if (section === null || section.id === this.selected) {
      this.aimedMark.hide();
      return;
    }

    this.aimedMark.show([this.highlightOf(section)], []);
  }

  /**
   * Marks the selected section and the nodes at either end. The end marks
   * are what separate a selection from a section merely under the cursor,
   * beyond the color.
   */
  private showSelected(): void {
    const section =
      this.selected === null
        ? undefined
        : this.network.getSection(this.selected);

    // A guard rather than a mechanism: nothing else edits the network while
    // this tool is active, so an id going stale would be a surprise.
    if (section === undefined) {
      this.selected = null;
      this.selectedMark.hide();
      return;
    }

    const highlight = this.highlightOf(section);
    this.selectedMark.show([highlight], [highlight.from, highlight.to]);
  }

  /** Where a section runs, which is what the highlight draws. */
  private highlightOf(section: Section): HighlightedSection {
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
