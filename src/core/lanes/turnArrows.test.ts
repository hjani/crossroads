import { describe, expect, it } from "vitest";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Vec2 } from "../geometry/point";
import { TURN_ARROW_GAP_METERS } from "../layout/markings";
import { RoadLayout } from "../layout/RoadLayout";
import { CROSSING_DEPTH_METERS } from "../layout/roadway";
import { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, RoadProfile, SectionId } from "../network/types";
import { addStraight } from "../testSupport";
import { LANE_WIDTH_METERS } from "./lane";
import { LaneGraph } from "./LaneGraph";
import { turnArrowsOf } from "./turnArrows";

function vec(x: number, z: number): Vec2 {
  return { x, z };
}

function expectAt(point: Vec2, x: number, z: number): void {
  expect(point.x).toBeCloseTo(x);
  expect(point.z).toBeCloseTo(z);
}

const v = LANE_WIDTH_METERS;

/** How far back from the roadway's end, along its centerline: `D + g`. */
const BACK = CROSSING_DEPTH_METERS + TURN_ARROW_GAP_METERS;

/** Two and three lanes each way, on roads wide enough for them. */
const TWO_LANES: RoadProfile = { width: 16, lanesPerDirection: 2 };
const THREE_LANES: RoadProfile = { width: 20, lanesPerDirection: 3 };

/** Makes `node` a junction: two more sections end there, along ±z. */
function addJunctionAt(network: RoadNetwork, node: NodeId): void {
  const at = network.getNode(node).position;
  addStraight(network, node, vec(at.x, at.z + 50));
  addStraight(network, node, vec(at.x, at.z - 50));
}

/** A section's roadway and its turn arrows, from the network as it is. */
function arrowsAlong(network: RoadNetwork, section: SectionId) {
  const layout = new RoadLayout(network);
  const roadway = layout.roadwayAlong(section);
  const arrows = turnArrowsOf(roadway, new LaneGraph(network, layout));
  return { roadway, arrows };
}

describe("turnArrowsOf", () => {
  it("puts one in the lane running into a junction end, D + g back", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(100, 0));
    addJunctionAt(network, road.to);

    const { roadway, arrows } = arrowsAlong(network, road.id);

    // Heading +x, the right is +z: lane +1 runs into `to`.
    expect(arrows.map(({ lane }) => lane.index)).toEqual([1]);
    expectAt(arrows[0].tip, roadway.outline.to.x - BACK, v / 2);
    expectAt(arrows[0].heading, 1, 0);
  });

  it("puts the `from` end's in the − lanes, pointing back", () => {
    const network = new RoadNetwork();
    const road = network.addSection(
      vec(0, 0),
      vec(100, 0),
      STRAIGHT,
      TWO_LANES,
    );
    addJunctionAt(network, road.from);
    addJunctionAt(network, road.to);

    const { roadway, arrows } = arrowsAlong(network, road.id);
    const { from, to } = roadway.outline;

    expect(arrows.map(({ lane }) => lane.index)).toEqual([1, 2, -1, -2]);
    const [plus1, plus2, minus1, minus2] = arrows;
    expectAt(plus1.tip, to.x - BACK, v / 2);
    expectAt(plus2.tip, to.x - BACK, 1.5 * v);
    expectAt(minus1.tip, from.x + BACK, -v / 2);
    expectAt(minus2.tip, from.x + BACK, -1.5 * v);
    expectAt(minus1.heading, -1, 0);
    expectAt(minus2.heading, -1, 0);
  });

  it("has none on a roadway with no junction end", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(100, 0));

    expect(arrowsAlong(network, road.id).arrows).toEqual([]);
  });

  it("lines the tips up square to the road on an arc", () => {
    const network = new RoadNetwork();
    // A quarter of the circle of radius 100 around the origin, turning from
    // +x toward +z: its right is inward, so + lanes run inside it.
    const road = network.addSection(
      vec(100, 0),
      vec(0, 100),
      { kind: "arc", via: vec(100 * Math.SQRT1_2, 100 * Math.SQRT1_2) },
      TWO_LANES,
    );
    addJunctionAt(network, road.to);

    const { roadway, arrows } = arrowsAlong(network, road.id);
    const angleOf = (p: Vec2) => Math.atan2(p.z, p.x);
    const end = angleOf(roadway.outline.to);

    expect(arrows.map(({ lane }) => lane.index)).toEqual([1, 2]);
    const [plus1, plus2] = arrows;
    for (const [arrow, radius] of [
      [plus1, 100 - v / 2],
      [plus2, 100 - 1.5 * v],
    ] as const) {
      expect(Math.hypot(arrow.tip.x, arrow.tip.z)).toBeCloseTo(radius);
      // D + g along the centerline, radius 100: one angle for every lane.
      expect(end - angleOf(arrow.tip)).toBeCloseTo(BACK / 100);
      // Counterclockwise, square to the radius.
      expectAt(arrow.heading, -arrow.tip.z / radius, arrow.tip.x / radius);
    }
  });

  it("shows the turns its lane can take", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(100, 0));
    addJunctionAt(network, road.to);

    // The stem of a T: left or right.
    expect(arrowsAlong(network, road.id).arrows[0].turns).toEqual({
      left: true,
      straight: false,
      right: true,
    });

    // A cross: every way.
    addStraight(network, road.to, vec(200, 0));
    expect(arrowsAlong(network, road.id).arrows[0].turns).toEqual({
      left: true,
      straight: true,
      right: true,
    });
  });

  it("splits the turns over the lanes as their connections do", () => {
    // 3 lanes in; 1 lane left and right, 2 straight on: lane 1 turns left,
    // 2 goes straight, 3 goes straight or right (`docs/lanes.md`).
    const network = new RoadNetwork();
    const road = network.addSection(
      vec(0, 0),
      vec(100, 0),
      STRAIGHT,
      THREE_LANES,
    );
    network.addSection(road.to, vec(200, 0), STRAIGHT, TWO_LANES);
    addJunctionAt(network, road.to);

    const { arrows } = arrowsAlong(network, road.id);
    expect(arrows.map(({ lane, turns }) => [lane.index, turns])).toEqual([
      [1, { left: true, straight: false, right: false }],
      [2, { left: false, straight: true, right: false }],
      [3, { left: false, straight: true, right: true }],
    ]);
  });
});
