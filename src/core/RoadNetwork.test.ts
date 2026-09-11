import { describe, expect, it } from "vitest";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT, type NodeId, type SectionId, type Vec2 } from "./types";

function at(x: number, z: number): Vec2 {
  return { x, z };
}

/** The network as sections between positions, sorted, so a layout can be
 *  asserted whole without naming ids. */
function layout(network: RoadNetwork): string[] {
  const ends = (id: NodeId): string => {
    const node = network.getNode(id);
    return node === undefined ? "?" : `(${node.position.x},${node.position.z})`;
  };

  return [...network.allSections()]
    .map((section) => `${ends(section.from)}-${ends(section.to)}`)
    .sort();
}

function nodeCount(network: RoadNetwork): number {
  return [...network.allNodes()].length;
}

describe("removing a section", () => {
  it("takes both nodes when nothing else holds them", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    network.removeSection(section.id);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("keeps a node another section still meets", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(first.to, at(20, 0), STRAIGHT);

    network.removeSection(first.id);

    expect(layout(network)).toEqual(["(10,0)-(20,0)"]);
    expect(nodeCount(network)).toBe(2);
  });

  it("ignores an unknown id", () => {
    const network = new RoadNetwork();
    network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    const version = network.version;

    network.removeSection(99 as SectionId);

    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
    expect(network.version).toBe(version);
  });
});

describe("removing a node", () => {
  it("takes its one section, and the far end left bare", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    network.removeNode(section.from);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("takes every section of a junction", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(5, 0), STRAIGHT);
    const center = first.to;
    network.addSection(center, at(10, 0), STRAIGHT);
    network.addSection(center, at(5, -5), STRAIGHT);
    network.addSection(center, at(5, 5), STRAIGHT);

    network.removeNode(center);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("leaves the far ends that carry other roads", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(5, 0), STRAIGHT);
    const center = first.to;
    const east = network.addSection(center, at(10, 0), STRAIGHT);
    network.addSection(center, at(5, -5), STRAIGHT);

    // Only the east arm's far end has a road of its own to hold it.
    network.addSection(east.to, at(20, 0), STRAIGHT);

    network.removeNode(center);

    expect(layout(network)).toEqual(["(10,0)-(20,0)"]);
    expect(nodeCount(network)).toBe(2);
  });

  it("takes both of two sections joining the same pair of nodes", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(first.from, first.to, STRAIGHT);

    network.removeNode(first.from);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("counts as one change however many sections it takes", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(5, 0), STRAIGHT);
    const center = first.to;
    network.addSection(center, at(10, 0), STRAIGHT);
    network.addSection(center, at(5, -5), STRAIGHT);
    const version = network.version;

    network.removeNode(center);

    expect(network.version).toBe(version + 1);
  });

  it("ignores an unknown id", () => {
    const network = new RoadNetwork();
    network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    const version = network.version;

    network.removeNode(99 as NodeId);

    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
    expect(network.version).toBe(version);
  });
});

describe("sectionsAt", () => {
  it("answers with a snapshot, not the list the node keeps", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(first.from, at(0, 10), STRAIGHT);

    const answered = network.sectionsAt(first.from);
    network.removeSection(first.id);

    expect(answered).toHaveLength(2);
    expect(network.sectionsAt(first.from)).toHaveLength(1);
  });

  it("is empty for an unknown node", () => {
    const network = new RoadNetwork();

    expect(network.sectionsAt(99 as NodeId)).toEqual([]);
  });
});

describe("building an arc", () => {
  const via = at(Math.SQRT1_2, Math.SQRT1_2);

  it("keeps the position the arc was given", () => {
    const network = new RoadNetwork();

    const section = network.addSection(at(1, 0), at(0, 1), {
      kind: "arc",
      via,
    });

    expect(section.geometry).toEqual({ kind: "arc", via });
  });

  it("joins two nodes like any other section", () => {
    const network = new RoadNetwork();

    const section = network.addSection(at(1, 0), at(0, 1), {
      kind: "arc",
      via,
    });

    expect(layout(network)).toEqual(["(1,0)-(0,1)"]);
    expect(network.sectionsAt(section.from)).toEqual([section.id]);
  });

  it("refuses one whose via is in line with its ends", () => {
    const network = new RoadNetwork();

    expect(() =>
      network.addSection(at(0, 0), at(10, 0), { kind: "arc", via: at(5, 0) }),
    ).toThrow();
  });

  it("creates nothing when it refuses", () => {
    const network = new RoadNetwork();
    const version = network.version;

    expect(() =>
      network.addSection(at(0, 0), at(10, 0), { kind: "arc", via: at(5, 0) }),
    ).toThrow();

    // The ends would have become nodes had the arc been checked any later.
    expect(nodeCount(network)).toBe(0);
    expect(network.version).toBe(version);
  });
});
