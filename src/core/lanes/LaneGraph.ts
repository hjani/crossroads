import type { RoadLayout } from "../layout/RoadLayout";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { SectionId } from "../network/types";
import { lanesOf, type Lane } from "./lane";

/**
 * Where cars drive on the network: the lanes along every section. See
 * `docs/lanes.md`, `LaneGraph`.
 *
 * Worked out as `RoadLayout` is: a section's lanes the first time they are
 * asked for, then kept, and all dropped when the network changes. `layout`
 * must be the network's own, so the lanes come from roadways of the same
 * version.
 *
 * What is handed out is a snapshot: kept past an edit, it answers as it did
 * before rather than complaining.
 */
export class LaneGraph {
  private readonly lanes = new Map<SectionId, readonly Lane[]>();
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

  /** The lanes along every section, in no particular order. */
  allLanes(): Lane[] {
    return Array.from(this.network.allSections()).flatMap((section) =>
      this.lanesAlong(section.id),
    );
  }

  /** Empties the cache if the network has changed since it was filled. */
  private dropStaleCache(): void {
    if (this.network.version === this.cachedVersion) {
      return;
    }

    this.lanes.clear();
    this.cachedVersion = this.network.version;
  }
}
