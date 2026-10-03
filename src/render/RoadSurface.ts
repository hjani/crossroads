import * as THREE from "three";
import type { Vec2 } from "../core/geometry/point";
import type { Junction } from "../core/layout/junction";
import {
  BAR_PERIOD_METERS,
  DASH_PERIOD_METERS,
  fittedPeriodOf,
} from "../core/layout/markings";
import { CROSSING_DEPTH_METERS, type Roadway } from "../core/layout/roadway";
import type { NodeId, SectionId } from "../core/network/types";
import { HIGHLIGHT_OPACITY, STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { PART_STATE, type PartState, type PartStates } from "./PartStates";
import { tessellateJunction, tessellateRoadway } from "./tessellate";
import surfaceVertexShader from "./shaders/roadSurface.vert.glsl?raw";
import surfaceFragmentShader from "./shaders/roadSurface.frag.glsl?raw";

type SurfaceMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

/**
 * How far in from the curb the edge line's inner edge is, in meters. Must
 * match `EDGE_INSET + LINE_WIDTH` in `roadSurface.frag.glsl`.
 */
const EDGE_LINE_INNER_METERS = 0.3;

/** Distance from an end without a crossing: far past any crossing. */
const FAR_METERS = 1e6;

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
      new SurfaceVertices().toGeometry(),
      makeMaterial(),
    );
    this.junctionMesh = new THREE.Mesh(
      new SurfaceVertices().toGeometry(),
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
    const vertices = new SurfaceVertices();
    const ranges = new Map<SectionId, VertexRange>();
    for (const [id, roadway] of roadways) {
      // Negative may happen when junction setbacks overlap:
      // it shouldn't have been built, but just skip rendering for it
      if (roadway.length >= 0) {
        const start = vertices.count;
        const { length, crossings } = roadway;
        const halfWidth = roadway.outline.widthMeters / 2;
        // The dashed stretch: what the crossings leave of the roadway.
        const dashStart = crossings.from ? CROSSING_DEPTH_METERS : 0;
        const dashEnd = crossings.to ? length - CROSSING_DEPTH_METERS : length;
        const dashPeriod = fittedPeriodOf(
          dashEnd - dashStart,
          DASH_PERIOD_METERS,
        );
        // Between the edge lines' inner edges.
        const barsWidth = 2 * (halfWidth - EDGE_LINE_INNER_METERS);
        const barPeriod = fittedPeriodOf(barsWidth, BAR_PERIOD_METERS);
        for (const { point, side, along } of tessellateRoadway(
          roadway.outline,
        )) {
          const s = along * length;
          vertices.push({
            point,
            side,
            halfWidth,
            // No dashes or bars: 0 everywhere is the start of a period, in
            // its gap.
            periodsAlong:
              dashPeriod === null ? 0 : (s - dashStart) / dashPeriod,
            periodsAcross:
              barPeriod === null
                ? 0
                : (side * halfWidth + barsWidth / 2) / barPeriod,
            fromStart: crossings.from ? s : FAR_METERS,
            fromEnd: crossings.to ? length - s : FAR_METERS,
          });
        }
        ranges.set(id, { start, count: vertices.count - start });
      }
    }

    replaceGeometry(this.roadwayMesh, vertices.toGeometry());
    this.roadwayRanges = ranges;
  }

  private buildJunctions(junctions: Iterable<[NodeId, Junction]>): void {
    const vertices = new SurfaceVertices();
    const ranges = new Map<NodeId, VertexRange>();
    for (const [id, junction] of junctions) {
      const start = vertices.count;
      for (const { point, side, halfWidth } of tessellateJunction(
        junction.outline(),
      )) {
        // No dashes in a junction: 0 everywhere is in a period's gap. No
        // crossings either.
        vertices.push({
          point,
          side,
          halfWidth,
          periodsAlong: 0,
          periodsAcross: 0,
          fromStart: FAR_METERS,
          fromEnd: FAR_METERS,
        });
      }
      ranges.set(id, { start, count: vertices.count - start });
    }

    replaceGeometry(this.junctionMesh, vertices.toGeometry());
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
      crossingDepth: { value: CROSSING_DEPTH_METERS },
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

/** A surface vertex, and where it is on its road. */
interface SurfaceVertex {
  readonly point: Vec2;
  readonly side: number;
  readonly halfWidth: number;
  /** Distance along its roadway's dashed stretch, in dash periods. */
  readonly periodsAlong: number;
  /** Distance across, from one edge line's inner edge, in bar periods. */
  readonly periodsAcross: number;
  /**
   * Distance from its roadway's start, and from its end, in meters — where
   * that end has a crossing. `FAR_METERS` where it has none.
   */
  readonly fromStart: number;
  readonly fromEnd: number;
}

/**
 * Surface triangles, roadway or junction, collected a vertex at a time with
 * the values its markings are drawn from.
 */
class SurfaceVertices {
  private readonly coordinates: number[] = [];
  private readonly sides: number[] = [];
  private readonly halfWidths: number[] = [];
  private readonly periodsAlong: number[] = [];
  private readonly periodsAcross: number[] = [];
  private readonly fromStart: number[] = [];
  private readonly fromEnd: number[] = [];

  get count(): number {
    return this.sides.length;
  }

  push(vertex: SurfaceVertex): void {
    this.coordinates.push(vertex.point.x, LAYER.ROAD_SURFACE, vertex.point.z);
    this.sides.push(vertex.side);
    this.halfWidths.push(vertex.halfWidth);
    this.periodsAlong.push(vertex.periodsAlong);
    this.periodsAcross.push(vertex.periodsAcross);
    this.fromStart.push(vertex.fromStart);
    this.fromEnd.push(vertex.fromEnd);
  }

  toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.coordinates, 3),
    );
    geometry.setAttribute(
      "side",
      new THREE.Float32BufferAttribute(this.sides, 1),
    );
    geometry.setAttribute(
      "halfWidth",
      new THREE.Float32BufferAttribute(this.halfWidths, 1),
    );
    geometry.setAttribute(
      "periodsAlong",
      new THREE.Float32BufferAttribute(this.periodsAlong, 1),
    );
    geometry.setAttribute(
      "periodsAcross",
      new THREE.Float32BufferAttribute(this.periodsAcross, 1),
    );
    geometry.setAttribute(
      "fromStart",
      new THREE.Float32BufferAttribute(this.fromStart, 1),
    );
    geometry.setAttribute(
      "fromEnd",
      new THREE.Float32BufferAttribute(this.fromEnd, 1),
    );
    // Starts as `NONE` everywhere; rewritten on every change of state, which
    // is far more often than the rest is rebuilt.
    geometry.setAttribute(
      "state",
      new THREE.Float32BufferAttribute(
        new Float32Array(this.count),
        1,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    return geometry;
  }
}
