import * as THREE from "three";
import type { Junction } from "../core/layout/junction";
import { dashPeriodOf } from "../core/layout/markings";
import type { Roadway } from "../core/layout/roadway";
import type { NodeId, SectionId } from "../core/network/types";
import { HIGHLIGHT_OPACITY, STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { PART_STATE, type PartState, type PartStates } from "./PartStates";
import { tessellateJunction, tessellateRoadway } from "./tessellate";
import surfaceVertexShader from "./shaders/roadSurface.vert.glsl?raw";
import surfaceFragmentShader from "./shaders/roadSurface.frag.glsl?raw";

type SurfaceMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

/** A part's vertices in its mesh: the first one's index, and how many. */
interface VertexRange {
  readonly start: number;
  readonly count: number;
}

/**
 * Draws roadways and junctions as asphalt, with their markings tinted
 * according to the state each part is in (`docs/part-states.md`).
 *
 * Draws exactly the parts it is given: which ones, and from which layout, is
 * its owner's to decide. Roadways and junctions are separate meshes.
 */
export class RoadSurface {
  readonly sceneObject = new THREE.Group();

  private readonly roadwayMesh: SurfaceMesh;
  private readonly junctionMesh: SurfaceMesh;
  /** Where each part's vertices are in its mesh, from the last `setParts`. */
  private roadwayRanges = new Map<SectionId, VertexRange>();
  private junctionRanges = new Map<NodeId, VertexRange>();
  private drawnStatesVersion = -1;

  constructor(private readonly partStates: PartStates) {
    this.roadwayMesh = new THREE.Mesh(
      makeSurfaceGeometry([], [], [], []),
      makeMaterial(),
    );
    this.junctionMesh = new THREE.Mesh(
      makeSurfaceGeometry([], [], [], []),
      makeMaterial(),
    );
    this.sceneObject.add(this.roadwayMesh, this.junctionMesh);
  }

  /** Discards the geometry and builds it again from exactly these parts. */
  setParts(
    junctions: Iterable<[NodeId, Junction]>,
    roadways: Iterable<[SectionId, Roadway]>,
  ): void {
    this.buildRoadways(roadways);
    this.buildJunctions(junctions);
    // The new buffers carry no states yet.
    this.drawnStatesVersion = -1;
  }

  /** Call once per frame. Cheap unless the states changed. */
  update(): void {
    if (this.partStates.version === this.drawnStatesVersion) return;

    writeStates(
      this.roadwayMesh,
      this.roadwayRanges,
      this.partStates.roadways(),
    );
    writeStates(
      this.junctionMesh,
      this.junctionRanges,
      this.partStates.junctions(),
    );
    this.drawnStatesVersion = this.partStates.version;
  }

  /** Releases the GPU buffers behind the surface. Unusable after. */
  dispose(): void {
    for (const mesh of [this.roadwayMesh, this.junctionMesh]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  private buildRoadways(roadways: Iterable<[SectionId, Roadway]>): void {
    const coordinates: number[] = [];
    const sides: number[] = [];
    const halfWidths: number[] = [];
    const periodsAlong: number[] = [];
    const ranges = new Map<SectionId, VertexRange>();
    for (const [id, roadway] of roadways) {
      // Negative may happen when junction setbacks overlap:
      // it shouldn't have been built, but just skip rendering for it
      if (roadway.length >= 0) {
        const start = sides.length;
        const halfWidth = roadway.outline.widthMeters / 2;
        // No dashes: 0 everywhere is the start of a period, in its gap.
        const period = dashPeriodOf(roadway.length);
        const periods = period === null ? 0 : roadway.length / period;
        for (const { point, side, along } of tessellateRoadway(
          roadway.outline,
        )) {
          coordinates.push(point.x, LAYER.ROAD_SURFACE, point.z);
          sides.push(side);
          halfWidths.push(halfWidth);
          periodsAlong.push(along * periods);
        }
        ranges.set(id, { start, count: sides.length - start });
      }
    }

    replaceGeometry(
      this.roadwayMesh,
      makeSurfaceGeometry(coordinates, sides, halfWidths, periodsAlong),
    );
    this.roadwayRanges = ranges;
  }

  private buildJunctions(junctions: Iterable<[NodeId, Junction]>): void {
    const coordinates: number[] = [];
    const sides: number[] = [];
    const halfWidths: number[] = [];
    const periodsAlong: number[] = [];
    const ranges = new Map<NodeId, VertexRange>();
    for (const [id, junction] of junctions) {
      const start = sides.length;
      for (const { point, side, halfWidth } of tessellateJunction(
        junction.outline(),
      )) {
        coordinates.push(point.x, LAYER.ROAD_SURFACE, point.z);
        sides.push(side);
        halfWidths.push(halfWidth);
        // No dashes in a junction: 0 everywhere is in a period's gap.
        periodsAlong.push(0);
      }
      ranges.set(id, { start, count: sides.length - start });
    }

    replaceGeometry(
      this.junctionMesh,
      makeSurfaceGeometry(coordinates, sides, halfWidths, periodsAlong),
    );
    this.junctionRanges = ranges;
  }
}

/**
 * The tint each `PART_STATE` shows, by its number. `NONE` and `HIDDEN` show
 * none, but the shader indexes the table by every state.
 */
const STATE_TINTS: Record<PartState, number> = {
  [PART_STATE.NONE]: 0,
  [PART_STATE.AIMED]: STATE_COLOR.AIMED,
  [PART_STATE.SELECTED]: STATE_COLOR.SELECTED,
  [PART_STATE.PLANNED]: STATE_COLOR.PLANNED,
  [PART_STATE.REFUSED]: STATE_COLOR.REFUSED,
  [PART_STATE.HIDDEN]: 0,
};

/** Unlit asphalt, with the markings drawn on it and each part's tint. */
function makeMaterial(): THREE.ShaderMaterial {
  const states = Object.values(PART_STATE);
  return new THREE.ShaderMaterial({
    vertexShader: surfaceVertexShader,
    fragmentShader: surfaceFragmentShader,
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
    },
    // Seen only from above, so which way a triangle winds doesn't matter.
    side: THREE.DoubleSide,
  });
}

/**
 * Writes every part's state into the mesh's `state` attribute: all of it,
 * `NONE` first and then each part in a state over its own range.
 *
 * A part the mesh has no range for isn't drawn — not among its parts, or a
 * roadway too short to draw — so there is nothing to mark.
 */
function writeStates<Id>(
  mesh: SurfaceMesh,
  ranges: ReadonlyMap<Id, VertexRange>,
  states: Iterable<[Id, PartState]>,
): void {
  const attribute = mesh.geometry.getAttribute("state");
  attribute.array.fill(PART_STATE.NONE);
  for (const [id, state] of states) {
    const range = ranges.get(id);
    if (range !== undefined) {
      attribute.array.fill(state, range.start, range.start + range.count);
    }
  }
  attribute.needsUpdate = true;
}

function replaceGeometry(
  mesh: SurfaceMesh,
  geometry: THREE.BufferGeometry,
): void {
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}

/**
 * Surface triangles, roadway or junction, with each vertex's side, half width
 * and distance along its roadway in dash periods beside it.
 */
function makeSurfaceGeometry(
  points: readonly number[],
  sides: readonly number[],
  halfWidths: readonly number[],
  periodsAlong: readonly number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("side", new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute(
    "halfWidth",
    new THREE.Float32BufferAttribute(halfWidths, 1),
  );
  geometry.setAttribute(
    "periodsAlong",
    new THREE.Float32BufferAttribute(periodsAlong, 1),
  );
  // Starts as `NONE` everywhere; rewritten on every change of state, which
  // is far more often than the rest is rebuilt.
  geometry.setAttribute(
    "state",
    new THREE.Float32BufferAttribute(
      new Float32Array(sides.length),
      1,
    ).setUsage(THREE.DynamicDrawUsage),
  );
  return geometry;
}
