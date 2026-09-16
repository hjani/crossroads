import { describe, expect, it } from "vitest";
import { Junction } from "./junctions";
import { RoadNetwork } from "../network/RoadNetwork";
import { roadwayOf } from "./roadways";
import { STRAIGHT } from "../network/types";
import type { Vec2 } from "../geometry/points";

const WIDTH_METERS = 8;

function at(x: number, z: number): Vec2 {
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

describe("roadwayOf", () => {
  it("sets a straight back at both ends, each by its own junction", () => {
    const network = new RoadNetwork();
    const road = network.addSection(at(0, 0), at(20, 0), STRAIGHT);
    // A right-angle bend at the start, a 60° gap at the end.
    network.addSection(road.from, at(0, 20), STRAIGHT);
    network.addSection(road.to, at(10, 10 * Math.sqrt(3)), STRAIGHT);

    const roadway = roadwayOf(network, road, WIDTH_METERS);

    expectPoint(roadway.from, at(4, 0));
    expectPoint(roadway.to, at(20 - 4 * Math.sqrt(3), 0));
    expect(roadway.geometry).toBe(road.geometry);
  });

  it("shrinks to nothing halfway along when both setbacks are clamped", () => {
    const network = new RoadNetwork();
    const road = network.addSection(at(0, 0), at(6, 0), STRAIGHT);
    // Right-angle bends at both ends, each wanting 4 m of a 6 m road.
    network.addSection(road.from, at(0, 20), STRAIGHT);
    network.addSection(road.to, at(6, 20), STRAIGHT);

    const roadway = roadwayOf(network, road, WIDTH_METERS);

    expectPoint(roadway.from, at(3, 0));
    expectPoint(roadway.to, at(3, 0));
  });

  it("cuts an arc back along its own circle", () => {
    // A half circle around (10, 0), leaving (0, 0) north and turning
    // clockwise over the top: angle π at the start, 0 at the end. A straight
    // leaves the start at 135°, 45° from the arc; the far end is a dead end.
    const R = 10;
    const center = at(10, 0);
    const network = new RoadNetwork();
    const arc = network.addSection(at(0, 0), at(20, 0), {
      kind: "arc",
      via: at(10, 10),
    });
    network.addSection(arc.from, at(-20, 20), STRAIGHT);
    const s = new Junction(network, arc.from, WIDTH_METERS).setbackOf(arc.id);

    const roadway = roadwayOf(network, arc, WIDTH_METERS);

    // Set back s along the circle → turned s/R from the start.
    const startAngle = Math.PI - s / R;
    expect(s).toBeGreaterThan(0);
    expectPoint(roadway.from, onCircle(center, R, startAngle));
    expectPoint(roadway.to, at(20, 0));
    expect(roadway.geometry.kind).toBe("arc");
    if (roadway.geometry.kind === "arc") {
      expectPoint(roadway.geometry.via, onCircle(center, R, startAngle / 2));
    }
  });
});
