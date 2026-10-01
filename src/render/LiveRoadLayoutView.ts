import type * as THREE from "three";
import type { Junction } from "../core/layout/junction";
import type { RoadLayout } from "../core/layout/RoadLayout";
import type { Roadway } from "../core/layout/roadway";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { NodeId, SectionId } from "../core/network/types";
import type { PartStates } from "./PartStates";
import { RoadSurface } from "./RoadSurface";

/**
 * Draws the live network's layout: roadways and junctions, as a road
 * surface.
 *
 * Rebuilt as a whole when the network's version changes.
 */
export class LiveRoadLayoutView {
  private readonly surface: RoadSurface;
  private drawnVersion = -1;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    partStates: PartStates,
  ) {
    this.surface = new RoadSurface(partStates);
  }

  /** Add this to the scene once; the view keeps its contents up to date. */
  get sceneObject(): THREE.Object3D {
    return this.surface.sceneObject;
  }

  /** Call once per frame. Cheap unless the network or the states changed. */
  update(): void {
    if (this.network.version !== this.drawnVersion) {
      this.surface.setParts(this.junctions(), this.roadways());
      this.drawnVersion = this.network.version;
    }
    this.surface.update();
  }

  /** Releases the GPU buffers behind the view. The view is unusable after. */
  dispose(): void {
    this.surface.dispose();
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
