/**
 * A camera navigation scheme: owns the camera's position and zoom in
 * response to user input.
 *
 * Implementations are interchangeable — a caller drives one per frame
 * without depending on the navigation style.
 */
export interface CameraControls {
  /** Advance continuous state (held keys, and later inertia). */
  update(deltaSeconds: number): void;

  /** Detach event listeners. */
  dispose(): void;
}
