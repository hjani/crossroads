import type { RoadProfile } from "../core/network/types";

/** One lane each way. */
export const ONE_LANE_PROFILE: RoadProfile = { width: 8, lanesPerDirection: 1 };

/** Two lanes each way. */
export const TWO_LANE_PROFILE: RoadProfile = {
  width: 16,
  lanesPerDirection: 2,
};

/**
 * What the section tools build with.
 */
export class SectionSettings {
  /** The road to build. */
  profile = ONE_LANE_PROFILE;
}
