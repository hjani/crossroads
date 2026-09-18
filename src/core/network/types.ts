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

/** An edge between two distinct nodes. */
export interface Section {
  readonly id: SectionId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly centerlineGeometry: LineGeometry;
}
