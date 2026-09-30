import * as THREE from "three";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { NodeId, SectionId } from "../core/network/types";
import type { RoadLayout } from "../core/layout/RoadLayout";
import { dashPeriodOf } from "../core/layout/markings";
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
 * Draws a road network as asphalt, filling the ground every roadway and
 * junction covers.
 *
 * Roadways and junctions are separate meshes.
 *
 * Rebuilt as a whole when the network's version says the drawing is stale.
 */
export class RoadSurfaceView {
  /** Add this to the scene once; the view keeps its contents up to date. */
  readonly sceneObject = new THREE.Group();

  private readonly roadwayMesh: SurfaceMesh;
  private readonly junctionMesh: SurfaceMesh;
  /** Where each part's vertices are in its mesh, from the last rebuild. */
  private roadwayRanges = new Map<SectionId, VertexRange>();
  private junctionRanges = new Map<NodeId, VertexRange>();
  private drawnVersion = -1;
  private drawnStatesVersion = -1;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private readonly partStates: PartStates,
  ) {
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

  /** Call once per frame. Cheap unless the network or the states changed. */
  update(): void {
    if (this.network.version !== this.drawnVersion) {
      this.rebuild();
      this.drawnVersion = this.network.version;
      // The new buffers carry no states yet.
      this.drawnStatesVersion = -1;
    }

    if (this.partStates.version !== this.drawnStatesVersion) {
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
  }

  /** Releases the GPU buffers behind the view. The view is unusable after. */
  dispose(): void {
    for (const mesh of [this.roadwayMesh, this.junctionMesh]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  /** Discards the geometry and builds it again from the network. */
  private rebuild(): void {
    this.rebuildRoadways();
    this.rebuildJunctions();
  }

  private rebuildRoadways(): void {
    const coordinates: number[] = [];
    const sides: number[] = [];
    const halfWidths: number[] = [];
    const periodsAlong: number[] = [];
    const ranges = new Map<SectionId, VertexRange>();
    for (const section of this.network.allSections()) {
      const roadway = this.layout.roadwayAlong(section.id);
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
        ranges.set(section.id, { start, count: sides.length - start });
      }
    }

    replaceGeometry(
      this.roadwayMesh,
      makeSurfaceGeometry(coordinates, sides, halfWidths, periodsAlong),
    );
    this.roadwayRanges = ranges;
  }

  private rebuildJunctions(): void {
    const coordinates: number[] = [];
    const sides: number[] = [];
    const halfWidths: number[] = [];
    const periodsAlong: number[] = [];
    const ranges = new Map<NodeId, VertexRange>();
    for (const node of this.network.allNodes()) {
      const start = sides.length;
      const outline = this.layout.junctionAt(node.id).outline();
      for (const { point, side, halfWidth } of tessellateJunction(outline)) {
        coordinates.push(point.x, LAYER.ROAD_SURFACE, point.z);
        sides.push(side);
        halfWidths.push(halfWidth);
        // No dashes in a junction: 0 everywhere is in a period's gap.
        periodsAlong.push(0);
      }
      ranges.set(node.id, { start, count: sides.length - start });
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
 * A part the mesh has no range for isn't drawn — gone from the network, or
 * a roadway too short to draw — so there is nothing to mark.
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
