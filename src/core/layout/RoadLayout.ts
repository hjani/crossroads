import { Junction } from "./junction";
import { roadwayOf, type Roadway } from "./roadway";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, SectionId } from "../network/types";

/** How wide every road is, in meters — one width for the whole network. */
export const ROAD_WIDTH_METERS = 8;

/**
 * The network as it lies on the ground: a junction at every node, a roadway
 * along every section. See `docs/road-layout.md`.
 *
 * Nothing is worked out ahead — a part is computed the first time it is asked
 * for and then kept, and everything is dropped when the network changes. The
 * two share the one cache, so a roadway is always cut back by the very
 * junctions that sit at its ends.
 *
 * What is handed out is a snapshot: kept past an edit, it answers as it did
 * before rather than complaining.
 */
export class RoadLayout {
  private readonly junctions = new Map<NodeId, Junction>();
  private readonly roadways = new Map<SectionId, Roadway>();
  private cachedVersion = -1;

  constructor(private readonly network: RoadNetwork) {}

  /** The junction at a node. Throws for a node the network does not know. */
  junctionAt(node: NodeId): Junction {
    this.dropStaleCache();

    let junction = this.junctions.get(node);
    if (junction === undefined) {
      junction = new Junction(this.network, node, ROAD_WIDTH_METERS);
      this.junctions.set(node, junction);
    }
    return junction;
  }

  /**
   * The roadway along a section. Throws for a section the network does not
   * know.
   */
  roadwayAlong(sectionId: SectionId): Roadway {
    this.dropStaleCache();

    let roadway = this.roadways.get(sectionId);
    if (roadway === undefined) {
      const section = this.network.getSection(sectionId);
      roadway = roadwayOf(
        this.network,
        section,
        {
          from: this.junctionAt(section.from).setbackOf(sectionId),
          to: this.junctionAt(section.to).setbackOf(sectionId),
        },
        ROAD_WIDTH_METERS,
      );
      this.roadways.set(sectionId, roadway);
    }
    return roadway;
  }

  /** Empties the cache if the network has changed since it was filled. */
  private dropStaleCache(): void {
    if (this.network.version === this.cachedVersion) {
      return;
    }

    this.junctions.clear();
    this.roadways.clear();
    this.cachedVersion = this.network.version;
  }
}
