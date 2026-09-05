import * as THREE from "three";
import type { Vec2 } from "../core/types";

/**
 * A point on the canvas, in the client pixel coordinates that pointer
 * events report: origin at the top-left of the viewport, y growing
 * downwards.
 */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * How much ground the canvas spans along Z at zoom 1 — the camera looks
 * straight down, so this is its vertical extent. The X span follows from
 * the canvas aspect ratio.
 */
const VIEW_SPAN_Z = 50;

/** How far above the ground plane the camera sits. */
const CAMERA_HEIGHT = 50;

const NEAR_PLANE = 0.1;
const FAR_PLANE = 1000;

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * The camera and the canvas it draws into, and the relationship between
 * them: which world point a pixel is over, and where a world point lands
 * on screen.
 *
 * Owns what the camera *means* — its projection, and how it maps to the
 * canvas. It does not own how the camera moves; that belongs to the camera
 * controls, which reach the camera through here.
 *
 * Three coordinate systems meet here. World space is meters, Y up, roads
 * on the XZ plane (`Vec2`). Screen space is client pixels (`ScreenPoint`).
 * Between them sits Three.js's own normalized device space, in which the
 * canvas is the square -1..+1 with y up; it appears only inside this class.
 */
export class Viewport {
  readonly camera: THREE.OrthographicCamera;

  private readonly raycaster = new THREE.Raycaster();

  /** Reused across calls, so a conversion per pointer move costs no allocation. */
  private readonly normalizedPoint = new THREE.Vector2();
  private readonly worldPoint = new THREE.Vector3();

  private readonly viewChangedListeners = new Set<() => void>();

  constructor(readonly domElement: HTMLElement) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR_PLANE, FAR_PLANE);
    this.camera.position.set(0, CAMERA_HEIGHT, 0);
    // Looking straight down, screen up is world -Z, so screen right is world +X.
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Watch for the view changing — the camera moved or zoomed, the canvas
   * resized. Returns the function that stops watching.
   *
   * Anything that answers a question about where the cursor is over the
   * ground has to ask it again when this fires: the camera is nobody's to
   * hold still, and it moves without a pointer event to say so.
   */
  onViewChanged(listener: () => void): () => void {
    this.viewChangedListeners.add(listener);
    return () => this.viewChangedListeners.delete(listener);
  }

  /**
   * Announce that the view has changed, called by whoever changed it.
   *
   * The camera is moved through here rather than by here, so the viewport
   * cannot see a move happen — it is told, by the same code that made it.
   */
  notifyViewChanged(): void {
    for (const listener of this.viewChangedListeners) listener();
  }

  /** Match the projection to the canvas. Call whenever the canvas resizes. */
  resize(widthPixels: number, heightPixels: number): void {
    const halfSpanZ = VIEW_SPAN_Z / 2;
    const halfSpanX = (halfSpanZ * widthPixels) / heightPixels;
    this.camera.left = -halfSpanX;
    this.camera.right = halfSpanX;
    this.camera.top = halfSpanZ;
    this.camera.bottom = -halfSpanZ;
    this.camera.updateProjectionMatrix();
    this.notifyViewChanged();
  }

  /**
   * World meters spanned by one pixel.
   *
   * A single number for both axes: `resize` keeps the projection square
   * with the canvas, so pixels stay square in world space too.
   */
  get metersPerPixel(): number {
    const { height } = this.domElement.getBoundingClientRect();
    return (this.camera.top - this.camera.bottom) / this.camera.zoom / height;
  }

  /**
   * The point on the ground plane under a pixel.
   *
   * Null if the ray never meets the ground — impossible looking straight
   * down, but a tilted camera can point at the horizon or away from it.
   */
  screenToGround(point: ScreenPoint): Vec2 | null {
    const rect = this.domElement.getBoundingClientRect();
    this.normalizedPoint.set(
      ((point.x - rect.left) / rect.width) * 2 - 1,
      -(((point.y - rect.top) / rect.height) * 2 - 1),
    );

    this.raycaster.setFromCamera(this.normalizedPoint, this.camera);
    const hit = this.raycaster.ray.intersectPlane(GROUND_PLANE, this.worldPoint);
    return hit === null ? null : { x: hit.x, z: hit.z };
  }

  /** Where a point on the ground plane lands on the canvas. */
  groundToScreen(point: Vec2): ScreenPoint {
    this.worldPoint.set(point.x, 0, point.z).project(this.camera);
    const rect = this.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((this.worldPoint.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - this.worldPoint.y) / 2) * rect.height,
    };
  }
}
