import * as THREE from "three";
import type { TurnArrow, Turns } from "../core/lanes/turnArrows";
import type { SectionId } from "../core/network/types";
import { HIGHLIGHT_OPACITY } from "./colors";
import { LAYER } from "./layers";
import { PART_STATE, type PartStates, type SetPartState } from "./PartStates";
import { STATE_TINTS } from "./RoadSurfaceMaterials";
import { arrowShape, type ArrowShape } from "./turnArrowShapes";

/** White, as the surface shader's markings. */
const MARKING_COLOR = 0xffffff;

type ArrowMesh = THREE.InstancedMesh<
  THREE.BufferGeometry,
  THREE.MeshBasicMaterial
>;

/**
 * Draws turn arrows on the road surface (`docs/road-markings.md`, Turn
 * arrows): a mesh per shape, drawn once per arrow of that shape (instanced),
 * each arrow in its roadway's state (`docs/part-states.md`).
 *
 * Told which arrows to draw, as `RoadSurface` is told its parts.
 */
export class TurnArrows {
  /** Add this to the scene once; `setArrows` replaces what it shows. */
  readonly sceneObject = new THREE.Group();

  private readonly material = new THREE.MeshBasicMaterial({
    color: MARKING_COLOR,
    // Seen only from above, so which way a triangle winds doesn't matter.
    side: THREE.DoubleSide,
    // At the surface's own height, drawn over it by a depth offset: counted
    // in depth steps, it holds for a tilted camera, where a height wouldn't.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  /** By `shapeKey`: made the first time an arrow has that shape, kept after. */
  private readonly shapes = new Map<string, ShapeInstances>();
  private drawnStatesVersion = -1;

  constructor(private readonly partStates: PartStates) {}

  /** Draws exactly these arrows from the next `update` on. */
  setArrows(arrows: Iterable<TurnArrow>): void {
    const byShape = new Map<string, TurnArrow[]>();
    for (const arrow of arrows) {
      const key = shapeKey(arrow.turns);
      const sameShape = byShape.get(key);
      if (sameShape === undefined) {
        byShape.set(key, [arrow]);
      } else {
        sameShape.push(arrow);
      }
    }

    for (const [key, sameShape] of byShape) {
      if (!this.shapes.has(key)) {
        const shape = arrowShape(sameShape[0].turns);
        const instances = new ShapeInstances(shape, this.material);
        this.shapes.set(key, instances);
        this.sceneObject.add(instances.sceneObject);
      }
    }
    // A shape no arrow has this time is emptied, not removed.
    for (const [key, instances] of this.shapes) {
      instances.setArrows(byShape.get(key) ?? []);
    }
    // The instances still hold the arrows before these.
    this.drawnStatesVersion = -1;
  }

  /**
   * Call once per frame. Cheap unless the arrows or the states changed:
   * then every arrow is written again.
   */
  update(): void {
    if (this.partStates.version === this.drawnStatesVersion) return;

    const states = new Map<SectionId, SetPartState>(this.partStates.roadways());
    for (const instances of this.shapes.values()) {
      instances.write(states);
    }
    this.drawnStatesVersion = this.partStates.version;
  }

  /** Releases the GPU buffers behind the arrows. Unusable after. */
  dispose(): void {
    for (const instances of this.shapes.values()) {
      instances.dispose();
    }
    this.material.dispose();
  }
}

/** Names the shape showing `turns`: the same turns, the same name. */
function shapeKey(turns: Turns): string {
  return (["left", "straight", "right"] as const)
    .filter((turn) => turns[turn])
    .join("+");
}

/**
 * The arrows of one shape: a mesh of it, drawn once per arrow. Made again,
 * larger, when more arrows come than it has room for.
 */
class ShapeInstances {
  /** Holds the mesh, which is replaced when it grows. */
  readonly sceneObject = new THREE.Group();

  private readonly geometry: THREE.BufferGeometry;
  private mesh: ArrowMesh;
  private arrows: readonly TurnArrow[] = [];

  constructor(
    shape: ArrowShape,
    private readonly material: THREE.MeshBasicMaterial,
  ) {
    this.geometry = shapeGeometry(shape);
    this.mesh = this.makeMesh(1);
  }

  /** Draws exactly these arrows from the next `write` on. */
  setArrows(arrows: readonly TurnArrow[]): void {
    this.arrows = arrows;
    if (arrows.length > this.mesh.instanceMatrix.count) {
      this.sceneObject.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.makeMesh(arrows.length);
    }
  }

  /**
   * Writes every arrow again, in its roadway's state from `states`; those of
   * hidden roadways are left out.
   */
  write(states: ReadonlyMap<SectionId, SetPartState>): void {
    const forward = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let count = 0;
    for (const { lane, tip, heading: h } of this.arrows) {
      const state = states.get(lane.section) ?? PART_STATE.NONE;
      if (state === PART_STATE.HIDDEN) continue;

      // The shape's frame: `x` along `h`, `z` to its right, `y` up.
      forward.set(h.x, 0, h.z);
      right.set(-h.z, 0, h.x);
      matrix
        .makeBasis(forward, up, right)
        .setPosition(tip.x, LAYER.ROAD_SURFACE, tip.z);
      this.mesh.setMatrixAt(count, matrix);

      // As the surface shader tints its markings.
      color.set(MARKING_COLOR);
      if (state !== PART_STATE.NONE) {
        color.lerp(new THREE.Color(STATE_TINTS[state]), HIGHLIGHT_OPACITY);
      }
      this.mesh.setColorAt(count, color);
      count++;
    }

    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor !== null) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    // Culled by the instances' bounds: they moved.
    this.mesh.computeBoundingSphere();
  }

  /** Releases the GPU buffers behind this shape's arrows. Unusable after. */
  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
  }

  /** An empty mesh with room for `capacity` arrows, in the scene. */
  private makeMesh(capacity: number): ArrowMesh {
    const mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      capacity,
    );
    // Made up front rather than by the first `setColorAt`, so the material
    // is compiled for colors per instance from the start.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    );
    mesh.count = 0;
    this.sceneObject.add(mesh);
    return mesh;
  }
}

/**
 * A shape's triangles, in its frame's ground plane (`y = 0`). Each polygon is
 * triangulated on its own; where two overlap, both draw the same white.
 */
function shapeGeometry(shape: ArrowShape): THREE.BufferGeometry {
  const coordinates: number[] = [];
  for (const outline of shape) {
    const contour = outline.map(({ x, z }) => new THREE.Vector2(x, z));
    for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
      for (const i of triangle) {
        coordinates.push(outline[i].x, 0, outline[i].z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coordinates, 3),
  );
  return geometry;
}
