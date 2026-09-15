/**
 * Colors for everything drawn in the scene. Color says what state something
 * is in; shape, size and layer say what kind of thing it is — so a node and
 * a section in the same state share a color.
 */
export const STATE_COLOR = {
  /** The network as it is: an asphalt gray, shared by the road surface and
   * the wireframe centerlines over it. */
  //  EXISTING: 0x555555,
  EXISTING: 0x706e6a,
  /** What a click would land on or act on. */
  AIMED: 0xffdd44,
  /** A selected item. */
  SELECTED: 0x66ccff,
  /** What the edit would create. */
  PLANNED: 0x66ee88,
  /** What the edit would try to create, but unable to do so. */
  REFUSED: 0xff5555,
} as const;
