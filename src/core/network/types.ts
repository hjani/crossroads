import type { LineGeometry } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";

/** Identifies a node for its lifetime. Not interchangeable with SectionId. */
export type NodeId = number & { readonly __brand: "NodeId" };

/** Identifies a section for its lifetime. Not interchangeable with NodeId. */
export type SectionId = number & { readonly __brand: "SectionId" };

/** An exact, unsnapped position where sections meet. */
export interface Node {
  readonly id: NodeId;
  readonly position: Vec2;
}

/**
 * The road across its width. Read-only, so sections share an instance.
 */
export interface RoadProfile {
  /** Curb to curb, in meters. */
  readonly width: number;
  readonly lanesPerDirection: number;
}

/** An edge between two distinct nodes. */
export interface Section {
  readonly id: SectionId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly centerlineGeometry: LineGeometry;
  /** Length along the centerline, node to node, in meters. */
  readonly length: number;
  readonly profile: RoadProfile;
}
