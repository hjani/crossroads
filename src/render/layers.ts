/**
 * Heights above the ground plane, in meters, for everything drawn on it —
 * bottom to top. The camera looks straight down, so a higher layer draws
 * over a lower one wherever they overlap.
 *
 * All of them clear the reference grid at zero.
 */
export const LAYER = {
  /**
   * The roads, so every line over it stays visible. Markings drawn as meshes
   * of their own (turn arrows) share this height, drawn over the surface by
   * a depth offset instead: that holds for a tilted camera too.
   */
  ROAD_SURFACE: 0.01,
  /** Areas a tool tints on the road, under every line. */
  SURFACE_DECORATION: 0.015,
  /** The network's sections. */
  SECTIONS: 0.02,
  /** The lane overlay, over the network's lines, under what a tool draws. */
  LANES: 0.025,
  /** Lines a tool draws, so a marked or planned section reads over the rest. */
  SECTION_DECORATION: 0.03,
  /** Marks a tool draws on a place — under the nodes, so a mark on one
   * leaves the node visible as its center rather than covering it. */
  NODE_DECORATION: 0.035,
  /** The network's nodes, over the sections meeting at them. */
  NODES: 0.04,
} as const;
