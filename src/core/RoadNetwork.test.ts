import { describe, expect, it } from "vitest";
import { RoadNetwork } from "./RoadNetwork";
import type { NodeId, SectionId, Vec2 } from "./types";

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
    const section = network.addSection(at(0, 0), at(10, 0));

    network.removeSection(section.id);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("keeps a node another section still meets", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(10, 0));
    network.addSection(first.to, at(20, 0));

    network.removeSection(first.id);

    expect(layout(network)).toEqual(["(10,0)-(20,0)"]);
    expect(nodeCount(network)).toBe(2);
  });

  it("ignores an unknown id", () => {
    const network = new RoadNetwork();
    network.addSection(at(0, 0), at(10, 0));
    const version = network.version;

    network.removeSection(99 as SectionId);

    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
    expect(network.version).toBe(version);
  });
});

describe("removing a node", () => {
  it("takes its one section, and the far end left bare", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0));

    network.removeNode(section.from);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("takes every section of a junction", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(5, 0));
    const center = first.to;
    network.addSection(center, at(10, 0));
    network.addSection(center, at(5, -5));
    network.addSection(center, at(5, 5));

    network.removeNode(center);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("leaves the far ends that carry other roads", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(5, 0));
    const center = first.to;
    const east = network.addSection(center, at(10, 0));
    network.addSection(center, at(5, -5));

    // Only the east arm's far end has a road of its own to hold it.
    network.addSection(east.to, at(20, 0));

    network.removeNode(center);

    expect(layout(network)).toEqual(["(10,0)-(20,0)"]);
    expect(nodeCount(network)).toBe(2);
  });

  it("takes both of two sections joining the same pair of nodes", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(10, 0));
    network.addSection(first.from, first.to);

    network.removeNode(first.from);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("counts as one change however many sections it takes", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(5, 0));
    const center = first.to;
    network.addSection(center, at(10, 0));
    network.addSection(center, at(5, -5));
    const version = network.version;

    network.removeNode(center);

    expect(network.version).toBe(version + 1);
  });

  it("ignores an unknown id", () => {
    const network = new RoadNetwork();
    network.addSection(at(0, 0), at(10, 0));
    const version = network.version;

    network.removeNode(99 as NodeId);

    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
    expect(network.version).toBe(version);
  });
});

describe("sectionsAt", () => {
  it("answers with a snapshot, not the list the node keeps", () => {
    const network = new RoadNetwork();
    const first = network.addSection(at(0, 0), at(10, 0));
    network.addSection(first.from, at(0, 10));

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
