import type { RoadNetworkHighlight } from "../render/RoadNetworkHighlight";
import type { Placement } from "./sectionPointPlacement";

/**
 * Pieces shared by the tools that have no better home yet.
 */

/**
 * Marks the ground an end placed here would weld onto: a node's junction, a
 * section's roadway and line. Nothing if there's nothing nearby.
 */
export function showWeldTarget(
  highlight: RoadNetworkHighlight,
  placed: Placement,
): void {
  if (placed.kind === "node") {
    highlight.show({ junctions: [placed.node] });
  } else if (placed.kind === "section") {
    highlight.show({ sections: [placed.section], roadways: [placed.section] });
  } else {
    highlight.hide();
  }
}
