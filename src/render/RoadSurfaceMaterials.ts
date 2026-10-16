import * as THREE from "three";
import { CROSSING_DEPTH_METERS } from "../core/layout/roadway";
import { LANE_WIDTH_METERS } from "../core/lanes/lane";
import type { RoadProfile } from "../core/network/types";
import { HIGHLIGHT_OPACITY, STATE_COLOR } from "./colors";
import { PART_STATE, type PartState } from "./PartStates";
import surfaceVertexShader from "./shaders/roadSurface.vert.glsl?raw";
import surfaceFragmentShader from "./shaders/roadSurface.frag.glsl?raw";
import laneMarksOne from "./shaders/laneMarksOne.frag.glsl?raw";
import laneMarksTwo from "./shaders/laneMarksTwo.frag.glsl?raw";
import laneMarksNone from "./shaders/laneMarksNone.frag.glsl?raw";

/**
 * The road surface's materials: one per kind of lane marking, each its own
 * program (`docs/road-markings.md`).
 *
 * Profiles marked alike get the same instance, so a material stands for its
 * marking: parts drawn in the same one can share a mesh.
 *
 * Owns its materials: they live until `dispose`.
 */
export class RoadSurfaceMaterials {
  private readonly oneLane = makeMaterial(laneMarksOne);
  private readonly twoLanes = makeMaterial(laneMarksTwo);
  private readonly unmarked = makeMaterial(laneMarksNone);

  /** What a roadway with this profile is drawn in. */
  forRoadway(profile: RoadProfile): THREE.ShaderMaterial {
    switch (profile.lanesPerDirection) {
      case 1:
        return this.oneLane;
      case 2:
        return this.twoLanes;
      default:
        return this.unmarked;
    }
  }

  /** What every junction is drawn in: no lane marks. */
  forJunctions(): THREE.ShaderMaterial {
    return this.unmarked;
  }

  /** Releases the materials. Unusable after. */
  dispose(): void {
    this.oneLane.dispose();
    this.twoLanes.dispose();
    this.unmarked.dispose();
  }
}

/**
 * The tint each `PART_STATE` shows, by its number. `NONE` and `HIDDEN` show
 * none, but the shader indexes the table by every state.
 */
export const STATE_TINTS: Record<PartState, number> = {
  [PART_STATE.NONE]: 0,
  [PART_STATE.AIMED]: STATE_COLOR.AIMED,
  [PART_STATE.SELECTED]: STATE_COLOR.SELECTED,
  [PART_STATE.PLANNED]: STATE_COLOR.PLANNED,
  [PART_STATE.REFUSED]: STATE_COLOR.REFUSED,
  [PART_STATE.HIDDEN]: 0,
};

/**
 * Unlit asphalt, with the markings drawn on it and each part's tint. The lane
 * marks are `laneMarksSource`'s, a lane file defining `laneMarks`.
 */
function makeMaterial(laneMarksSource: string): THREE.ShaderMaterial {
  const states = Object.values(PART_STATE);
  return new THREE.ShaderMaterial({
    vertexShader: surfaceVertexShader,
    // The shared part declares `laneMarks`, so the lane file can come after
    // it and use its helpers.
    fragmentShader: surfaceFragmentShader + laneMarksSource,
    defines: {
      PART_STATE_COUNT: states.length,
      PART_STATE_NONE: PART_STATE.NONE,
      PART_STATE_HIDDEN: PART_STATE.HIDDEN,
    },
    uniforms: {
      color: { value: new THREE.Color(STATE_COLOR.EXISTING) },
      stateColors: {
        value: states.map((state) => new THREE.Color(STATE_TINTS[state])),
      },
      tintAmount: { value: HIGHLIGHT_OPACITY },
      crossingDepth: { value: CROSSING_DEPTH_METERS },
      // Read only by the lane files that draw dividers.
      laneWidth: { value: LANE_WIDTH_METERS },
    },
    // Seen only from above, so which way a triangle winds doesn't matter.
    side: THREE.DoubleSide,
  });
}
