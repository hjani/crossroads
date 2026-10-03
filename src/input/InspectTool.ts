import * as THREE from "three";
import { pick } from "../core/layout/pick";
import type { RoadLayout } from "../core/layout/RoadLayout";
import {
  nearestNode,
  nearestSection,
  sectionRadius,
} from "../core/network/queries";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { NodeId, SectionId } from "../core/network/types";
import { STATE_COLOR } from "../render/colors";
import { JunctionHighlight } from "../render/JunctionHighlight";
import {
  PART_STATE,
  type PartStates,
  type SetPartState,
} from "../render/PartStates";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import type { InspectPanel } from "../ui/InspectPanel";
import type { Tool } from "./Tool";
import type { Vec2 } from "../core/geometry/point";

/**
 * How close the cursor must look to a node or a section to pick it. In
 * pixels, so either is the same size of target at every zoom.
 *
 * Its own number rather than the one the section tools weld within:
 * selecting and welding are different gestures, free to want different
 * targets.
 */
const PICK_RADIUS_PIXELS = 12;

/**
 * What a click selects. The kind is what the tool reasons about: the two
 * are marked differently, and their ids name different things.
 */
type Selection =
  | { readonly kind: "node"; readonly id: NodeId }
  | { readonly kind: "section"; readonly id: SectionId };

/** The junction a selection picks as its area: a node's own. */
function junctionsOf(selection: Selection | null): NodeId[] {
  return selection?.kind === "node" ? [selection.id] : [];
}

/** The roadway a selection picks as its area: a section's own. */
function roadwaysOf(selection: Selection | null): SectionId[] {
  return selection?.kind === "section" ? [selection.id] : [];
}

/** A length as the panel shows it. */
function displayMeters(length: number): string {
  return `${length.toFixed(2)} m`;
}

/**
 * Selects a node or a section. Hovered (aimed) items are marked. Clicking
 * them assigns the selection, which is also marked. Clicking clear of
 * everything drops the selection.
 *
 * Both marks come from the same `selectionAt` question.
 *
 * The selected mark is drawn where the selection changes, since it depends
 * on nothing else. The aimed mark depends on the cursor and the camera too,
 * so it is drawn after every input and change of view.
 *
 * The selection lives here and dies with the tool, since the manager
 * disposes a tool it switches away from.
 */
export class InspectTool implements Tool {
  private readonly aimedJunction = new JunctionHighlight(0);
  private readonly selectedJunction = new JunctionHighlight(0);
  private readonly decoration = new THREE.Group();

  private selected: Selection | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private readonly viewport: Viewport,
    private readonly partStates: PartStates,
    private readonly panel: InspectPanel,
  ) {
    partStates.reset();
    this.decoration.add(
      this.aimedJunction.sceneObject,
      this.selectedJunction.sceneObject,
    );

    // The panel opens saying nothing is selected, rather than blank.
    this.showSelected();
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  onPointerDown(point: ScreenPoint): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;

    this.select(this.selectionAt(ground));
  }

  /**
   * Delete removes what is selected: a section on its own, or a node with
   * every section meeting it. The model takes the nodes left bare either
   * way, so removing is the whole of it.
   *
   * Backspace does the same. Neither key is claimed by the manager, which
   * takes only Escape, so what they mean is this tool's to decide.
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Delete" && event.key !== "Backspace") return;

    // Backspace still means history-back in some browsers, and the network
    // lives only in memory. Claimed whether or not anything is selected, so
    // the key never leaves the page on the strength of what was aimed at.
    event.preventDefault();

    const selected = this.selected;
    if (selected === null) return;

    if (selected.kind === "node") {
      this.network.removeNode(selected.id);
    } else {
      this.network.removeSection(selected.id);
    }

    // Dropped before anything is drawn: the marks read the network for
    // what they draw, and what this named is no longer in it.
    this.select(null);
  }

  /** Escape drops the selection. The aimed mark stays: it answers where the
   * cursor is, not what was being held. */
  cancel(): void {
    this.select(null);
  }

  afterInputOrViewChange(cursor: ScreenPoint | null): void {
    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    this.showAimed(ground);
  }

  /** Changes what is selected, and the mark on it with it. */
  private select(selection: Selection | null): void {
    this.selected = selection;
    this.showSelected();
  }

  /**
   * What a click at `ground` would select, or null for nothing in reach. The
   * first of these to answer wins:
   *
   * - a node within the pick radius — a junction can contain no ground at
   *   all, as where two roads meet in line, and its node must still be
   *   reachable
   * - the actual area: a junction picks its node, a roadway its section
   * - a section within the pick radius — zoomed out, a road is too thin on
   *   screen to aim inside
   *
   * The layout is asked before the sections' radius: a section's line runs
   * on through the junction to the node, and would otherwise steal clicks
   * from the junction.
   */
  private selectionAt(ground: Vec2): Selection | null {
    const radius = PICK_RADIUS_PIXELS * this.viewport.metersPerPixel;

    const node = nearestNode(this.network, ground, radius);
    if (node !== null) {
      return { kind: "node", id: node.id };
    }

    const picked = pick(this.layout, ground);
    if (picked !== null) {
      return picked.kind === "junction"
        ? { kind: "node", id: picked.node }
        : { kind: "section", id: picked.section };
    }

    const section = nearestSection(this.network, ground, radius);
    return section === null ? null : { kind: "section", id: section.id };
  }

  /**
   * Marks what the cursor at `ground` is aimed at — that thing alone: a
   * section its roadway, a node its junction. The tint needs no rule for the
   * selection: selected outranks aimed.
   */
  private showAimed(ground: Vec2 | null): void {
    const aimed = ground === null ? null : this.selectionAt(ground);
    this.setSelectionState(aimed, PART_STATE.AIMED);

    const isSelected =
      aimed?.kind === this.selected?.kind && aimed?.id === this.selected?.id;
    this.showJunction(
      this.aimedJunction,
      isSelected ? null : aimed,
      STATE_COLOR.AIMED,
    );
  }

  /**
   * Marks the selection and updates the info panel contents.
   */
  private showSelected(): void {
    const selected = this.selected;
    this.setSelectionState(selected, PART_STATE.SELECTED);
    this.showJunction(this.selectedJunction, selected, STATE_COLOR.SELECTED);
    if (selected === null) {
      this.panel.show("No selection", []);
      return;
    }

    if (selected.kind === "node") {
      const sections = this.network.sectionsAt(selected.id);
      this.panel.show(`Node ${selected.id}`, [
        ["Sections", String(sections.length)],
      ]);
    } else {
      const section = this.network.getSection(selected.id);
      const radius = sectionRadius(this.network, section);
      this.panel.show(`Section ${section.id}`, [
        ["Length", displayMeters(section.length)],
        ["Roadway", displayMeters(this.layout.roadwayAlong(section.id).length)],
        // A straight has no radius
        ["Radius", radius === null ? "n/a" : displayMeters(radius)],
      ]);
    }
  }

  private setSelectionState(
    selection: Selection | null,
    state: SetPartState,
  ): void {
    this.partStates.setJunctionsInState(state, junctionsOf(selection));
    this.partStates.setRoadwaysInState(state, roadwaysOf(selection));
  }

  /** Marks the junction of a node `selection` with `mark`, or nothing. */
  private showJunction(
    mark: JunctionHighlight,
    selection: Selection | null,
    color: number,
  ): void {
    const junctions = junctionsOf(selection).map((node) =>
      this.layout.junctionAt(node),
    );
    mark.show(junctions, color);
  }

  /**
   * Releases the marks' GPU buffers and takes the panel off the page. The
   * tool is unusable after.
   */
  dispose(): void {
    this.aimedJunction.dispose();
    this.selectedJunction.dispose();
    this.panel.dispose();
  }
}
