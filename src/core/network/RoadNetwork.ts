import { isArcValid } from "../geometry/arc";
import { lineLength, type LineGeometry } from "../geometry/lineGeometry";
import type { Node, NodeId, Section, SectionId } from "./types";
import type { Vec2 } from "../geometry/point";

/** Either an existing node, or a position at which to create one. */
export type Endpoint = NodeId | Vec2;

/**
 * Whether an endpoint names a node rather than carrying a position.
 *
 * The `endpoint is NodeId` return type makes this a narrowing test and not
 * just a boolean one: where it returns true, the compiler treats the
 * argument as a `NodeId` for the rest of the branch. A plain `boolean`
 * would leave the caller to assert the type itself.
 */
export function isNodeId(endpoint: Endpoint): endpoint is NodeId {
  return typeof endpoint === "number";
}

/**
 * Stores the road network and keeps it structurally valid.
 *
 * The only place nodes and sections are created or destroyed. Nodes exist
 * only as endpoints of sections: one appears when a section is built to a
 * position, and goes when its last section leaves. Even removing a node is
 * removing the sections that meet it.
 */
export class RoadNetwork {
  private readonly nodes = new Map<NodeId, Node>();
  private readonly sections = new Map<SectionId, Section>();
  private readonly adjacency = new Map<NodeId, SectionId[]>();

  private nextNodeId = 1;
  private nextSectionId = 1;
  private currentVersion = 0;

  /** Bumped on every mutation, so consumers can tell their view is stale. */
  get version(): number {
    return this.currentVersion;
  }

  /**
   * Creates a section, and a node for any endpoint given as a position.
   *
   * Throws if an endpoint names a node that does not exist, if both ends
   * resolve to the same node, or if an arc's `via` is in line with them and
   * so has no circle through it. Everything is checked before anything is
   * created, so a rejected call changes nothing.
   */
  addSection(
    from: Endpoint,
    to: Endpoint,
    centerlineGeometry: LineGeometry,
    width: number,
  ): Section {
    const fromPosition = this.requirePosition(from);
    const toPosition = this.requirePosition(to);
    if (from === to && isNodeId(from)) {
      throw new Error(`Section would start and end at node ${from}`);
    }
    if (
      centerlineGeometry.kind === "arc" &&
      !isArcValid(fromPosition, toPosition, centerlineGeometry.via)
    ) {
      throw new Error("Arc runs through a position in line with its ends");
    }

    const fromId = this.resolve(from);
    const toId = this.resolve(to);

    const id = this.nextSectionId++ as SectionId;
    const section: Section = {
      id,
      from: fromId,
      to: toId,
      centerlineGeometry,
      length: lineLength(fromPosition, toPosition, centerlineGeometry),
      width,
    };
    this.sections.set(id, section);
    this.attach(fromId, id);
    this.attach(toId, id);
    this.commit();
    return section;
  }

  /** Also removes either endpoint left without sections. Unknown ids are ignored. */
  removeSection(id: SectionId): void {
    if (this.discardSection(id)) {
      this.commit();
    }
  }

  /**
   * Removes every section meeting a node, which is what removing the node
   * is: it goes with the last of them, by the rule above. Unknown ids are
   * ignored.
   *
   * A far end left without sections goes too, and that is as far as it
   * reaches — a node stranded here had only the section just removed, so
   * there is nothing hanging off it to remove in turn.
   *
   * One change however many sections it takes, so the version counts what
   * the caller asked for rather than the steps inside it.
   */
  removeNode(id: NodeId): void {
    const attached = this.sectionsAt(id);
    for (const section of attached) {
      this.discardSection(section);
    }

    if (attached.length > 0) {
      this.commit();
    }
  }

  /**
   * Throws for an unknown node, as `addSection` does: an id held by anything
   * reading the network is expected to be one the network still knows.
   */
  getNode(id: NodeId): Node {
    const node = this.nodes.get(id);
    if (node === undefined) {
      throw new Error(`Unknown node ${id}`);
    }
    return node;
  }

  /** Throws for an unknown section, as `getNode` does for a node. */
  getSection(id: SectionId): Section {
    const section = this.sections.get(id);
    if (section === undefined) {
      throw new Error(`Unknown section ${id}`);
    }
    return section;
  }

  /**
   * The sections meeting a node, empty for an unknown one.
   *
   * A copy, taken now: the list a node keeps is spliced as sections come
   * and go, so handing out the real one would make the `readonly` a
   * promise it does not keep — and a caller removing the sections it just
   * asked for would walk a list shrinking under it, missing every other
   * one.
   */
  sectionsAt(id: NodeId): readonly SectionId[] {
    const attached = this.adjacency.get(id);
    return attached === undefined ? [] : [...attached];
  }

  allNodes(): IterableIterator<Node> {
    return this.nodes.values();
  }

  allSections(): IterableIterator<Section> {
    return this.sections.values();
  }

  /**
   * An independent copy, to edit without touching this one.
   *
   * Version and id counters come along too: a plan made on this network
   * applies to the copy, and the ids it hands out are the ones this network
   * would. Nodes and sections are immutable, so they are shared; only the
   * lists that get spliced are copied.
   */
  clone(): RoadNetwork {
    const copy = new RoadNetwork();
    for (const [id, node] of this.nodes) copy.nodes.set(id, node);
    for (const [id, section] of this.sections) copy.sections.set(id, section);
    for (const [id, attached] of this.adjacency) {
      copy.adjacency.set(id, [...attached]);
    }
    copy.nextNodeId = this.nextNodeId;
    copy.nextSectionId = this.nextSectionId;
    copy.currentVersion = this.currentVersion;
    return copy;
  }

  /** Records that the network changed. */
  private commit(): void {
    this.currentVersion++;
  }

  /** Where an endpoint is, throwing if it names a node that does not exist. */
  private requirePosition(endpoint: Endpoint): Vec2 {
    return isNodeId(endpoint) ? this.getNode(endpoint).position : endpoint;
  }

  private resolve(endpoint: Endpoint): NodeId {
    return isNodeId(endpoint) ? endpoint : this.addNode(endpoint);
  }

  private addNode(position: Vec2): NodeId {
    const id = this.nextNodeId++ as NodeId;
    this.nodes.set(id, { id, position });
    this.adjacency.set(id, []);
    return id;
  }

  private attach(nodeId: NodeId, sectionId: SectionId): void {
    this.adjacency.get(nodeId)?.push(sectionId);
  }

  /**
   * Takes a section out along with either endpoint left bare, and says
   * whether there was one to take.
   *
   * Records nothing: what counts as one change is the public call's to
   * decide, and removing a node is one change however many sections it
   * takes.
   */
  private discardSection(id: SectionId): boolean {
    const section = this.sections.get(id);
    if (section === undefined) {
      return false;
    }

    this.sections.delete(id);
    this.detach(section.from, id);
    this.detach(section.to, id);
    return true;
  }

  /** Drops one section from a node, discarding the node if it was the last. */
  private detach(nodeId: NodeId, sectionId: SectionId): void {
    const attached = this.adjacency.get(nodeId);
    if (attached === undefined) {
      return;
    }

    const at = attached.indexOf(sectionId);
    if (at !== -1) {
      attached.splice(at, 1);
    }

    if (attached.length === 0) {
      this.adjacency.delete(nodeId);
      this.nodes.delete(nodeId);
    }
  }
}
