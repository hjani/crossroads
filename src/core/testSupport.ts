import { STRAIGHT } from "./geometry/lineGeometry";
import type { Endpoint, RoadNetwork } from "./network/RoadNetwork";
import type { Section } from "./network/types";

/** How wide the tests build a road, in meters, unless a test says otherwise. */
export const TEST_ROAD_WIDTH_METERS = 8;

/** Adds a straight section, `TEST_ROAD_WIDTH_METERS` wide. */
export function addStraight(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
): Section {
  return network.addSection(from, to, STRAIGHT, TEST_ROAD_WIDTH_METERS);
}
