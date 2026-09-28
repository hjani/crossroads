import * as THREE from "three";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { RoadLayout } from "../core/layout/RoadLayout";
import { dashPeriodOf } from "../core/layout/markings";
import { STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { tessellateJunction, tessellateRoadway } from "./tessellate";
import surfaceVertexShader from "./shaders/roadSurface.vert.glsl?raw";
import surfaceFragmentShader from "./shaders/roadSurface.frag.glsl?raw";

type SurfaceMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

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
  private drawnVersion = -1;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
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

  /** Call once per frame. Cheap unless the network changed. */
  update(): void {
    if (this.network.version === this.drawnVersion) {
      return;
    }

    this.rebuild();
    this.drawnVersion = this.network.version;
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
    for (const section of this.network.allSections()) {
      const roadway = this.layout.roadwayAlong(section.id);
      // Negative may happen when junction setbacks overlap:
      // it shouldn't have been built, but just skip rendering for it
      if (roadway.length >= 0) {
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
      }
    }

    replaceGeometry(
      this.roadwayMesh,
      makeSurfaceGeometry(coordinates, sides, halfWidths, periodsAlong),
    );
  }

  private rebuildJunctions(): void {
    const coordinates: number[] = [];
    const sides: number[] = [];
    const halfWidths: number[] = [];
    const periodsAlong: number[] = [];
    for (const node of this.network.allNodes()) {
      const outline = this.layout.junctionAt(node.id).outline();
      for (const { point, side, halfWidth } of tessellateJunction(outline)) {
        coordinates.push(point.x, LAYER.ROAD_SURFACE, point.z);
        sides.push(side);
        halfWidths.push(halfWidth);
        // No dashes in a junction: 0 everywhere is in a period's gap.
        periodsAlong.push(0);
      }
    }

    replaceGeometry(
      this.junctionMesh,
      makeSurfaceGeometry(coordinates, sides, halfWidths, periodsAlong),
    );
  }
}

/** Unlit asphalt, with the markings drawn on it. */
function makeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: surfaceVertexShader,
    fragmentShader: surfaceFragmentShader,
    uniforms: {
      color: { value: new THREE.Color(STATE_COLOR.EXISTING) },
    },
    // Seen only from above, so which way a triangle winds doesn't matter.
    side: THREE.DoubleSide,
  });
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
  return geometry;
}
