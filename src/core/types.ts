/** Identifies a node for its lifetime. Not interchangeable with SectionId. */
export type NodeId = number & { readonly __brand: "NodeId" };

/** Identifies a section for its lifetime. Not interchangeable with NodeId. */
export type SectionId = number & { readonly __brand: "SectionId" };

/** A point on the XZ ground plane, in meters. */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

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
  readonly kind: "straight";
}
