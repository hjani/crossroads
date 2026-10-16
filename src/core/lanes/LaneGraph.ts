import type { RoadLayout } from "../layout/RoadLayout";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, SectionId } from "../network/types";
import { connectionsBetween, type Connection } from "./connection";
import { lanesOf, type Lane } from "./lane";

/**
 * Where cars drive on the network: the lanes along every section, and the
 * connections at every node. See `docs/lanes.md`, `LaneGraph`.
 *
 * Worked out as `RoadLayout` is: a part the first time it is asked for, then
 * kept, and all dropped when the network changes. `layout` must be the
 * network's own, so the lanes come from roadways of the same version.
 *
 * What is handed out is a snapshot: kept past an edit, it answers as it did
 * before rather than complaining.
 */
export class LaneGraph {
  private readonly lanes = new Map<SectionId, readonly Lane[]>();
  private readonly connections = new Map<NodeId, readonly Connection[]>();
  private cachedVersion = -1;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
  ) {}

  /**
   * The lanes along a section (`lanesOf`). Throws for a section the network
   * does not know.
   */
  lanesAlong(sectionId: SectionId): readonly Lane[] {
    this.dropStaleCache();

    let lanes = this.lanes.get(sectionId);
    if (lanes === undefined) {
      lanes = lanesOf(this.layout.roadwayAlong(sectionId));
      this.lanes.set(sectionId, lanes);
    }
    return lanes;
  }

  /**
   * The connections at a node (`connectionsBetween`), from the lanes running
   * into it to those running out of it. Throws for a node the network does
   * not know.
   */
  connectionsAt(node: NodeId): readonly Connection[] {
    this.dropStaleCache();

    let connections = this.connections.get(node);
    if (connections === undefined) {
      // For the throw: an unknown node meets no sections, so nothing below
      // would notice.
      this.network.getNode(node);

      const incoming: Lane[] = [];
      const outgoing: Lane[] = [];
      for (const sectionId of this.network.sectionsAt(node)) {
        const section = this.network.getSection(sectionId);
        for (const lane of this.lanesAlong(sectionId)) {
          // `+i` runs `from → to`, `−i` the other way.
          const runsIn =
            lane.id.index > 0 ? section.to === node : section.from === node;
          (runsIn ? incoming : outgoing).push(lane);
        }
      }
      connections = connectionsBetween(
        incoming,
        outgoing,
        this.layout.junctionAt(node).outline(),
      );
      this.connections.set(node, connections);
    }
    return connections;
  }

  /** The lanes along every section, in no particular order. */
  allLanes(): Lane[] {
    return Array.from(this.network.allSections()).flatMap((section) =>
      this.lanesAlong(section.id),
    );
  }

  /** The connections at every node, in no particular order. */
  allConnections(): Connection[] {
    return Array.from(this.network.allNodes()).flatMap((node) =>
      this.connectionsAt(node.id),
    );
  }

  /** Empties the cache if the network has changed since it was filled. */
  private dropStaleCache(): void {
    if (this.network.version === this.cachedVersion) {
      return;
    }

    this.lanes.clear();
    this.connections.clear();
    this.cachedVersion = this.network.version;
  }
}
