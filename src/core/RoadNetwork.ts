import type { Node, NodeId, Section, SectionId, Vec2 } from "./types";

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
 * only as endpoints of sections, so they are never added or removed on
 * their own. Decisions about what *should* be built — snapping, welding,
 * whether a layout is sensible — belong to the editing tools, not here.
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
   * Throws if an endpoint names a node that does not exist, or if both
   * ends resolve to the same node. Both endpoints are checked before
   * anything is created, so a rejected call changes nothing.
   */
  addSection(from: Endpoint, to: Endpoint): Section {
    this.requireKnown(from);
    this.requireKnown(to);
    if (from === to && isNodeId(from)) {
      throw new Error(`Section would start and end at node ${from}`);
    }

    const fromId = this.resolve(from);
    const toId = this.resolve(to);

    const id = this.nextSectionId++ as SectionId;
    const section: Section = { id, from: fromId, to: toId, kind: "straight" };
    this.sections.set(id, section);
    this.attach(fromId, id);
    this.attach(toId, id);
    this.commit();
    return section;
  }

  /** Also removes either endpoint left without sections. Unknown ids are ignored. */
  removeSection(id: SectionId): void {
    const section = this.sections.get(id);
    if (section === undefined) {
      return;
    }

    this.sections.delete(id);
    this.detach(section.from, id);
    this.detach(section.to, id);
    this.commit();
  }

  getNode(id: NodeId): Node | undefined {
    return this.nodes.get(id);
  }

  getSection(id: SectionId): Section | undefined {
    return this.sections.get(id);
  }

  /** Empty for an unknown node. */
  sectionsAt(id: NodeId): readonly SectionId[] {
    return this.adjacency.get(id) ?? [];
  }

  allNodes(): IterableIterator<Node> {
    return this.nodes.values();
  }

  allSections(): IterableIterator<Section> {
    return this.sections.values();
  }

  /** Records that the network changed. */
  private commit(): void {
    this.currentVersion++;
  }

  private requireKnown(endpoint: Endpoint): void {
    if (isNodeId(endpoint) && !this.nodes.has(endpoint)) {
      throw new Error(`Unknown node ${endpoint}`);
    }
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
