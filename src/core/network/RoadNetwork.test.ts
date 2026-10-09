import { describe, expect, it } from "vitest";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT } from "../geometry/lineGeometry";
import { type NodeId, type SectionId } from "./types";
import type { Vec2 } from "../geometry/point";
import { TEST_ROAD_PROFILE } from "../testSupport";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

/** The network as sections between positions, sorted, so a layout can be
 *  asserted whole without naming ids. */
function layout(network: RoadNetwork): string[] {
  const ends = (id: NodeId): string => {
    const { position } = network.getNode(id);
    return `(${position.x},${position.z})`;
  };

  return [...network.allSections()]
    .map((section) => `${ends(section.from)}-${ends(section.to)}`)
    .sort();
}

function nodeCount(network: RoadNetwork): number {
  return [...network.allNodes()].length;
}

describe("section length", () => {
  it("measures a straight between its nodes", () => {
    const network = new RoadNetwork();

    const section = network.addSection(
      vec(0, 0),
      vec(3, 4),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );

    expect(section.length).toBeCloseTo(5);
  });

  it("measures an arc along its curve, past the distance between its ends", () => {
    const network = new RoadNetwork();

    // The half circle of radius 10 over the top of (0,0)-(20,0): π·10.
    const section = network.addSection(
      vec(0, 0),
      vec(20, 0),
      {
        kind: "arc",
        via: vec(10, 10),
      },
      TEST_ROAD_PROFILE,
    );

    expect(section.length).toBeCloseTo(10 * Math.PI);
  });
});

describe("removing a section", () => {
  it("takes both nodes when nothing else holds them", () => {
    const network = new RoadNetwork();
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );

    network.removeSection(section.id);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("keeps a node another section still meets", () => {
    const network = new RoadNetwork();
    const first = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    network.addSection(first.to, vec(20, 0), STRAIGHT, TEST_ROAD_PROFILE);

    network.removeSection(first.id);

    expect(layout(network)).toEqual(["(10,0)-(20,0)"]);
    expect(nodeCount(network)).toBe(2);
  });

  it("ignores an unknown id", () => {
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(10, 0), STRAIGHT, TEST_ROAD_PROFILE);
    const version = network.version;

    network.removeSection(99 as SectionId);

    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
    expect(network.version).toBe(version);
  });
});

describe("removing a node", () => {
  it("takes its one section, and the far end left bare", () => {
    const network = new RoadNetwork();
    const section = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );

    network.removeNode(section.from);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("takes every section of a junction", () => {
    const network = new RoadNetwork();
    const first = network.addSection(
      vec(0, 0),
      vec(5, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    const center = first.to;
    network.addSection(center, vec(10, 0), STRAIGHT, TEST_ROAD_PROFILE);
    network.addSection(center, vec(5, -5), STRAIGHT, TEST_ROAD_PROFILE);
    network.addSection(center, vec(5, 5), STRAIGHT, TEST_ROAD_PROFILE);

    network.removeNode(center);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("leaves the far ends that carry other roads", () => {
    const network = new RoadNetwork();
    const first = network.addSection(
      vec(0, 0),
      vec(5, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    const center = first.to;
    const east = network.addSection(
      center,
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    network.addSection(center, vec(5, -5), STRAIGHT, TEST_ROAD_PROFILE);

    // Only the east arm's far end has a road of its own to hold it.
    network.addSection(east.to, vec(20, 0), STRAIGHT, TEST_ROAD_PROFILE);

    network.removeNode(center);

    expect(layout(network)).toEqual(["(10,0)-(20,0)"]);
    expect(nodeCount(network)).toBe(2);
  });

  it("takes both of two sections joining the same pair of nodes", () => {
    const network = new RoadNetwork();
    const first = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    network.addSection(first.from, first.to, STRAIGHT, TEST_ROAD_PROFILE);

    network.removeNode(first.from);

    expect(layout(network)).toEqual([]);
    expect(nodeCount(network)).toBe(0);
  });

  it("counts as one change however many sections it takes", () => {
    const network = new RoadNetwork();
    const first = network.addSection(
      vec(0, 0),
      vec(5, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    const center = first.to;
    network.addSection(center, vec(10, 0), STRAIGHT, TEST_ROAD_PROFILE);
    network.addSection(center, vec(5, -5), STRAIGHT, TEST_ROAD_PROFILE);
    const version = network.version;

    network.removeNode(center);

    expect(network.version).toBe(version + 1);
  });

  it("ignores an unknown id", () => {
    const network = new RoadNetwork();
    network.addSection(vec(0, 0), vec(10, 0), STRAIGHT, TEST_ROAD_PROFILE);
    const version = network.version;

    network.removeNode(99 as NodeId);

    expect(layout(network)).toEqual(["(0,0)-(10,0)"]);
    expect(network.version).toBe(version);
  });
});

describe("sectionsAt", () => {
  it("answers with a snapshot, not the list the node keeps", () => {
    const network = new RoadNetwork();
    const first = network.addSection(
      vec(0, 0),
      vec(10, 0),
      STRAIGHT,
      TEST_ROAD_PROFILE,
    );
    network.addSection(first.from, vec(0, 10), STRAIGHT, TEST_ROAD_PROFILE);

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
  const via = vec(Math.SQRT1_2, Math.SQRT1_2);

  it("keeps the position the arc was given", () => {
    const network = new RoadNetwork();

    const section = network.addSection(
      vec(1, 0),
      vec(0, 1),
      {
        kind: "arc",
        via,
      },
      TEST_ROAD_PROFILE,
    );

    expect(section.centerlineGeometry).toEqual({ kind: "arc", via });
  });

  it("joins two nodes like any other section", () => {
    const network = new RoadNetwork();

    const section = network.addSection(
      vec(1, 0),
      vec(0, 1),
      {
        kind: "arc",
        via,
      },
      TEST_ROAD_PROFILE,
    );

    expect(layout(network)).toEqual(["(1,0)-(0,1)"]);
    expect(network.sectionsAt(section.from)).toEqual([section.id]);
  });

  it("refuses one whose via is in line with its ends", () => {
    const network = new RoadNetwork();

    expect(() =>
      network.addSection(
        vec(0, 0),
        vec(10, 0),
        {
          kind: "arc",
          via: vec(5, 0),
        },
        TEST_ROAD_PROFILE,
      ),
    ).toThrow();
  });

  it("creates nothing when it refuses", () => {
    const network = new RoadNetwork();
    const version = network.version;

    expect(() =>
      network.addSection(
        vec(0, 0),
        vec(10, 0),
        {
          kind: "arc",
          via: vec(5, 0),
        },
        TEST_ROAD_PROFILE,
      ),
    ).toThrow();

    // The ends would have become nodes had the arc been checked any later.
    expect(nodeCount(network)).toBe(0);
    expect(network.version).toBe(version);
  });
});

describe("building a biarc", () => {
  // A U-turn of radius 10 around (0, 10): two quarter circles, joined at
  // (10, 10).
  const uTurn = {
    kind: "biarc",
    biarc: {
      join: vec(10, 10),
      first: {
        kind: "arc",
        via: vec(10 * Math.SQRT1_2, 10 - 10 * Math.SQRT1_2),
      },
      second: {
        kind: "arc",
        via: vec(10 * Math.SQRT1_2, 10 + 10 * Math.SQRT1_2),
      },
    },
  } as const;

  it("keeps its join and pieces, and measures both", () => {
    const network = new RoadNetwork();

    const section = network.addSection(
      vec(0, 0),
      vec(0, 20),
      uTurn,
      TEST_ROAD_PROFILE,
    );

    expect(section.centerlineGeometry).toEqual(uTurn);
    expect(section.length).toBeCloseTo(10 * Math.PI);
  });

  it("refuses one whose join is on an end, creating nothing", () => {
    const network = new RoadNetwork();

    expect(() =>
      network.addSection(
        vec(0, 0),
        vec(20, 0),
        {
          kind: "biarc",
          biarc: { join: vec(0, 0), first: STRAIGHT, second: STRAIGHT },
        },
        TEST_ROAD_PROFILE,
      ),
    ).toThrow();
    expect(nodeCount(network)).toBe(0);
  });
});
