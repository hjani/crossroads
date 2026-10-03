import { describe, expect, it } from "vitest";
import { Junction } from "./junction";
import { RoadNetwork } from "../network/RoadNetwork";
import { roadwayOf, type Roadway } from "./roadway";
import type { NodeId, Section } from "../network/types";
import type { Vec2 } from "../geometry/point";
import { addStraight, TEST_ROAD_WIDTH_METERS } from "../testSupport";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

/** The point `radius` from `center` at `angle`, turning from +x toward +z. */
function onCircle(center: Vec2, radius: number, angle: number): Vec2 {
  return {
    x: center.x + radius * Math.cos(angle),
    z: center.z + radius * Math.sin(angle),
  };
}

function expectPoint(point: Vec2, expected: Vec2): void {
  expect(point.x).toBeCloseTo(expected.x);
  expect(point.z).toBeCloseTo(expected.z);
}

/** The setbacks the junctions at a section's two ends give it. */
function setbacksOf(
  network: RoadNetwork,
  section: Section,
): { from: number; to: number } {
  return {
    from: new Junction(network, section.from).setbackOf(section.id),
    to: new Junction(network, section.to).setbackOf(section.id),
  };
}

describe("roadwayOf", () => {
  it("sets a straight back at both ends, each by its own junction", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    // A right-angle bend at the start, a 60° gap at the end.
    addStraight(network, road.from, vec(0, 20));
    addStraight(network, road.to, vec(10, 10 * Math.sqrt(3)));

    const { length, outline } = roadwayOf(
      network,
      road,
      setbacksOf(network, road),
    );

    expectPoint(outline.from, vec(4, 0));
    expectPoint(outline.to, vec(20 - 4 * Math.sqrt(3), 0));
    expect(outline.centerlineGeometry).toBe(road.centerlineGeometry);
    expect(length).toBeCloseTo(20 - 4 - 4 * Math.sqrt(3));
  });

  it("names its section in its outline, with the width of the road", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));

    const { outline } = roadwayOf(network, road, setbacksOf(network, road));

    expect(outline.section).toBe(road.id);
    expect(outline.widthMeters).toBe(TEST_ROAD_WIDTH_METERS);
  });

  it("comes out negative where its setbacks overlap", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(6, 0));
    // Right-angle bends at both ends, each wanting 4 m of a 6 m road.
    addStraight(network, road.from, vec(0, 20));
    addStraight(network, road.to, vec(6, 20));

    const { length, outline } = roadwayOf(
      network,
      road,
      setbacksOf(network, road),
    );

    expectPoint(outline.from, vec(4, 0));
    expectPoint(outline.to, vec(2, 0));
    expect(length).toBeCloseTo(-2);
  });

  it("cuts an arc back along its own circle", () => {
    // A half circle around (10, 0), leaving (0, 0) north and turning
    // clockwise over the top: angle π at the start, 0 at the end. A straight
    // leaves the start at 135°, 45° from the arc; the far end is a dead end.
    const R = 10;
    const center = vec(10, 0);
    const network = new RoadNetwork();
    const arc = network.addSection(
      vec(0, 0),
      vec(20, 0),
      {
        kind: "arc",
        via: vec(10, 10),
      },
      TEST_ROAD_WIDTH_METERS,
    );
    addStraight(network, arc.from, vec(-20, 20));
    const s = new Junction(network, arc.from).setbackOf(arc.id);

    const { length, outline } = roadwayOf(
      network,
      arc,
      setbacksOf(network, arc),
    );

    // Set back s along the circle → turned s/R from the start.
    const startAngle = Math.PI - s / R;
    expect(s).toBeGreaterThan(0);
    expectPoint(outline.from, onCircle(center, R, startAngle));
    expectPoint(outline.to, vec(20, 0));
    // Measured along the curve: only the start is set back, so what is left
    // of the half circle is π·R − s.
    expect(length).toBeCloseTo(Math.PI * R - s);
    expect(outline.centerlineGeometry.kind).toBe("arc");
    if (outline.centerlineGeometry.kind === "arc") {
      expectPoint(
        outline.centerlineGeometry.via,
        onCircle(center, R, startAngle / 2),
      );
    }
  });
});

describe("roadwayOf crossings", () => {
  // Set back by hand: only the roadway's length matters to its crossings.
  const NO_SETBACKS = { from: 0, to: 0 };

  /** Ends `count` more sections at `node`, each to a node of its own. */
  function addSectionsAt(network: RoadNetwork, node: NodeId, count: number) {
    const at = network.getNode(node).position;
    for (let i = 0; i < count; i++) {
      addStraight(network, node, vec(at.x + 50, at.z + 50 * (i + 1)));
    }
  }

  function crossingsOf(
    network: RoadNetwork,
    section: Section,
    setbacks = NO_SETBACKS,
  ): Roadway["crossings"] {
    return roadwayOf(network, section, setbacks).crossings;
  }

  it("crosses only at the end where 3 sections meet", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(100, 0));
    addSectionsAt(network, road.to, 2);
    expect(crossingsOf(network, road)).toEqual({ from: false, to: true });
  });

  it("crosses at both ends where both are junctions of 3 or more", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(100, 0));
    addSectionsAt(network, road.from, 3);
    addSectionsAt(network, road.to, 2);
    expect(crossingsOf(network, road)).toEqual({ from: true, to: true });
  });

  it("doesn't cross at a dead end or a join of two", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(100, 0));
    addSectionsAt(network, road.to, 1);
    expect(crossingsOf(network, road)).toEqual({ from: false, to: false });
  });

  it("doesn't cross a roadway too short for two crossings", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(100, 0));
    addSectionsAt(network, road.from, 2);
    addSectionsAt(network, road.to, 2);
    // 100 − 2·47.05 = 5.9 left; 100 − 2·47 = 6.
    expect(crossingsOf(network, road, { from: 47.05, to: 47.05 })).toEqual({
      from: false,
      to: false,
    });
    expect(crossingsOf(network, road, { from: 47, to: 47 })).toEqual({
      from: true,
      to: true,
    });
  });
});
