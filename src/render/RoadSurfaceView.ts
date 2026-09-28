import * as THREE from "three";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { RoadLayout } from "../core/layout/RoadLayout";
import { STATE_COLOR } from "./colors";
import { LAYER } from "./layers";
import { tessellateOutline, tessellateRoadway } from "./tessellate";
import roadwayVertexShader from "./shaders/roadwaySurface.vert.glsl?raw";
import roadwayFragmentShader from "./shaders/roadwaySurface.frag.glsl?raw";
import junctionVertexShader from "./shaders/junctionSurface.vert.glsl?raw";
import junctionFragmentShader from "./shaders/junctionSurface.frag.glsl?raw";

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
      makeRoadwayGeometry([], [], []),
      makeMaterial(roadwayVertexShader, roadwayFragmentShader),
    );
    this.junctionMesh = new THREE.Mesh(
      makeGeometry([]),
      makeMaterial(junctionVertexShader, junctionFragmentShader),
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
    for (const section of this.network.allSections()) {
      const roadway = this.layout.roadwayAlong(section.id);
      // Negative may happen when junction setbacks overlap:
      // it shouldn't have been built, but just skip rendering for it
      if (roadway.length >= 0) {
        const halfWidth = roadway.outline.widthMeters / 2;
        for (const { point, side } of tessellateRoadway(roadway.outline)) {
          coordinates.push(point.x, LAYER.ROAD_SURFACE, point.z);
          sides.push(side);
          halfWidths.push(halfWidth);
        }
      }
    }

    replaceGeometry(
      this.roadwayMesh,
      makeRoadwayGeometry(coordinates, sides, halfWidths),
    );
  }

  private rebuildJunctions(): void {
    const coordinates: number[] = [];
    for (const node of this.network.allNodes()) {
      const outline = this.layout.junctionAt(node.id).outline();
      for (const point of tessellateOutline(outline)) {
        coordinates.push(point.x, LAYER.ROAD_SURFACE, point.z);
      }
    }

    replaceGeometry(this.junctionMesh, makeGeometry(coordinates));
  }
}

/** Unlit. */
function makeMaterial(
  vertexShader: string,
  fragmentShader: string,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
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

/** Roadway triangles, with each vertex's side and half width beside it. */
function makeRoadwayGeometry(
  points: readonly number[],
  sides: readonly number[],
  halfWidths: readonly number[],
): THREE.BufferGeometry {
  const geometry = makeGeometry(points);
  geometry.setAttribute("side", new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute(
    "halfWidth",
    new THREE.Float32BufferAttribute(halfWidths, 1),
  );
  return geometry;
}

function makeGeometry(points: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  return geometry;
}
