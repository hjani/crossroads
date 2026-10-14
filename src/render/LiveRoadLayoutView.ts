import * as THREE from "three";
import type { LaneGraph } from "../core/lanes/LaneGraph";
import type { Junction } from "../core/layout/junction";
import type { RoadLayout } from "../core/layout/RoadLayout";
import type { Roadway } from "../core/layout/roadway";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { NodeId, SectionId } from "../core/network/types";
import { LaneOverlay } from "./LaneOverlay";
import type { PartStates } from "./PartStates";
import { RoadSurface } from "./RoadSurface";

/**
 * Draws the live network's layout: roadways and junctions, as a road
 * surface, and its lanes over it.
 *
 * Rebuilt as a whole when the network's version changes.
 */
export class LiveRoadLayoutView {
  /** Add this to the scene once; the view keeps its contents up to date. */
  readonly sceneObject = new THREE.Group();

  private readonly surface: RoadSurface;
  private readonly laneOverlay = new LaneOverlay();
  private drawnVersion = -1;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private readonly laneGraph: LaneGraph,
    partStates: PartStates,
  ) {
    this.surface = new RoadSurface(partStates);
    this.sceneObject.add(
      this.surface.sceneObject,
      this.laneOverlay.sceneObject,
    );

    // Initially hidden.
    this.laneOverlay.sceneObject.visible = false;
  }

  /**
   * Shows or hides the lanes. Hidden lanes are still kept up to date, so
   * showing them needs no rebuild.
   */
  setLanesVisible(visible: boolean): void {
    this.laneOverlay.sceneObject.visible = visible;
  }

  /** Call once per frame. Cheap unless the network or the states changed. */
  update(): void {
    if (this.network.version !== this.drawnVersion) {
      this.surface.setParts(this.junctions(), this.roadways());
      this.laneOverlay.setLanes(this.laneGraph.allLanes());
      this.laneOverlay.setConnections(this.laneGraph.allConnections());
      this.drawnVersion = this.network.version;
    }
    this.surface.update();
  }

  /** Releases the GPU buffers behind the view. The view is unusable after. */
  dispose(): void {
    this.surface.dispose();
    this.laneOverlay.dispose();
  }

  private *junctions(): IterableIterator<[NodeId, Junction]> {
    for (const node of this.network.allNodes()) {
      yield [node.id, this.layout.junctionAt(node.id)];
    }
  }

  private *roadways(): IterableIterator<[SectionId, Roadway]> {
    for (const section of this.network.allSections()) {
      yield [section.id, this.layout.roadwayAlong(section.id)];
    }
  }
}
