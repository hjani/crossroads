import * as THREE from "three";
import type { Vec2 } from "../core/geometry/point";
import { Junction } from "../core/layout/junction";
import { JUNCTION_HIGHLIGHT_OPACITY } from "./colors";
import { LAYER } from "./layers";

/** The gap between the junction and the mark, in meters. */
const MARK_GAP_METERS = 1;
/** How wide the mark is, in meters. */
const MARK_WIDTH_METERS = 3;
/** Enough for the mark to read as round at any size a junction comes in. */
const SEGMENTS = 64;

/** A junction to mark, or a place where one would be made. */
export type JunctionHighlightTarget = Junction | Vec2;

/**
 * A mark on junctions, in one color, that shows even where a junction is
 * too small to tint (`docs/tools.md`, "Marking a junction").
 *
 * Decoration only, and told what to mark — the tool's answer, not something
 * the network knows. The color is given with each `show`, as the same mark
 * moves between a junction already there and a place one would be made.
 */
export class JunctionHighlight {
  readonly sceneObject: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;

  /** `roadWidth`: used for free placement positions. */
  constructor(private roadWidth: number) {
    this.sceneObject = new THREE.Mesh(
      makeGeometry([]),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: JUNCTION_HIGHLIGHT_OPACITY,
        depthWrite: false,
        // Seen only from above, so which way a triangle winds doesn't matter.
        side: THREE.DoubleSide,
      }),
    );
    this.sceneObject.visible = false;
  }

  /**
   * Marks exactly `targets`, in `color`: none hides the mark. Each is a ring
   * `MARK_WIDTH_METERS` wide, `MARK_GAP_METERS` clear of the junction's
   * bounding circle; a place with no junction counts as one `roadWidth`
   * across.
   *
   * Rebuilt on every call: a few hundred vertices, cheaper than working out
   * whether anything moved.
   */
  show(targets: readonly JunctionHighlightTarget[], color: number): void {
    const coordinates: number[] = [];
    for (const target of targets) {
      const [center, radius] =
        target instanceof Junction
          ? [target.center(), target.boundingRadius()]
          : [target, this.roadWidth / 2];
      const inner = radius + MARK_GAP_METERS;
      pushRing(coordinates, center, inner, inner + MARK_WIDTH_METERS);
    }

    this.sceneObject.geometry.dispose();
    this.sceneObject.geometry = makeGeometry(coordinates);
    this.sceneObject.material.color.setHex(color);
    this.sceneObject.visible = targets.length > 0;
  }

  hide(): void {
    this.sceneObject.visible = false;
  }

  /** Size used for free placement. */
  setRoadWidth(roadWidth: number): void {
    this.roadWidth = roadWidth;
  }

  /** Releases the GPU buffers behind the mark. Unusable after. */
  dispose(): void {
    this.sceneObject.geometry.dispose();
    this.sceneObject.material.dispose();
  }
}

/**
 * Appends the triangles of a flat ring about `center`: two per segment,
 * between the inner and the outer circle.
 */
function pushRing(
  coordinates: number[],
  center: Vec2,
  inner: number,
  outer: number,
): void {
  const y = LAYER.NODE_DECORATION;
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (2 * Math.PI * i) / SEGMENTS;
    const b = (2 * Math.PI * (i + 1)) / SEGMENTS;
    const [cosA, sinA, cosB, sinB] = [
      Math.cos(a),
      Math.sin(a),
      Math.cos(b),
      Math.sin(b),
    ];
    const innerA = [center.x + inner * cosA, y, center.z + inner * sinA];
    const outerA = [center.x + outer * cosA, y, center.z + outer * sinA];
    const innerB = [center.x + inner * cosB, y, center.z + inner * sinB];
    const outerB = [center.x + outer * cosB, y, center.z + outer * sinB];
    coordinates.push(...innerA, ...outerA, ...outerB);
    coordinates.push(...innerA, ...outerB, ...innerB);
  }
}

/**
 * `coordinates` is x, y and z of every point in one flat run, which is the
 * layout a position attribute wants — `itemSize` 3 is what splits it back
 * into points.
 */
function makeGeometry(coordinates: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coordinates, 3),
  );
  return geometry;
}
