import { STRAIGHT } from "./geometry/lineGeometry";
import type { Endpoint, RoadNetwork } from "./network/RoadNetwork";
import type { RoadProfile, Section } from "./network/types";

/** The road the tests build, unless a test says otherwise. */
export const TEST_ROAD_PROFILE: RoadProfile = {
  width: 8,
  lanesPerDirection: 1,
};

/**
 * `TEST_ROAD_PROFILE`, `width` meters wide: for tests where only the width
 * matters.
 */
export function profileOfWidth(width: number): RoadProfile {
  return { ...TEST_ROAD_PROFILE, width };
}

/** Adds a straight section with `TEST_ROAD_PROFILE`. */
export function addStraight(
  network: RoadNetwork,
  from: Endpoint,
  to: Endpoint,
): Section {
  return network.addSection(from, to, STRAIGHT, TEST_ROAD_PROFILE);
}
