import { describe, expect, it } from "vitest";
import { arcViaLeaving } from "./arcs";
import { Junction } from "./junctions";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT, type SectionId, type Vec2 } from "./types";

const WIDTH_METERS = 8;

function at(x: number, z: number): Vec2 {
  return { x, z };
}

describe("Junction", () => {
  it("sets a dead end back by nothing", () => {
    const network = new RoadNetwork();
    const road = network.addSection(at(0, 0), at(20, 0), STRAIGHT);

    const junction = new Junction(network, road.to, WIDTH_METERS);

    expect(junction.setbackOf(road.id)).toBe(0);
  });

  it("sets a straight join back by nothing", () => {
    const network = new RoadNetwork();
    const west = network.addSection(at(-20, 0), at(0, 0), STRAIGHT);
    const east = network.addSection(west.to, at(20, 0), STRAIGHT);

    const junction = new Junction(network, west.to, WIDTH_METERS);

    expect(junction.setbackOf(west.id)).toBeCloseTo(0);
    expect(junction.setbackOf(east.id)).toBeCloseTo(0);
  });

  it("sets both roads of a right-angle bend back by half the width", () => {
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(20, 0), STRAIGHT);
    const north = network.addSection(east.from, at(0, 20), STRAIGHT);

    const junction = new Junction(network, east.from, WIDTH_METERS);

    expect(junction.setbackOf(east.id)).toBeCloseTo(4);
    expect(junction.setbackOf(north.id)).toBeCloseTo(4);
  });

  it("sets each road of a skewed T back by the longer of its two gaps", () => {
    // East and west are one straight road; the branch leaves at 60°.
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(20, 0), STRAIGHT);
    const branch = network.addSection(
      east.from,
      at(10, 10 * Math.sqrt(3)),
      STRAIGHT,
    );
    const west = network.addSection(east.from, at(-20, 0), STRAIGHT);

    const junction = new Junction(network, east.from, WIDTH_METERS);

    // The 60° gap: (w/2)·cot 30°. The 120° gap: (w/2)·cot 60°.
    expect(junction.setbackOf(east.id)).toBeCloseTo(4 * Math.sqrt(3));
    expect(junction.setbackOf(branch.id)).toBeCloseTo(4 * Math.sqrt(3));
    expect(junction.setbackOf(west.id)).toBeCloseTo(4 / Math.sqrt(3));
  });

  it("sets a road back by no more than half its length", () => {
    const network = new RoadNetwork();
    const short = network.addSection(at(0, 0), at(6, 0), STRAIGHT);
    const long = network.addSection(short.from, at(0, 20), STRAIGHT);

    const junction = new Junction(network, short.from, WIDTH_METERS);

    expect(junction.setbackOf(short.id)).toBeCloseTo(3);
    expect(junction.setbackOf(long.id)).toBeCloseTo(4);
  });

  it("sets the straights back as if an arc at the node weren't there", () => {
    const network = new RoadNetwork();
    const east = network.addSection(at(0, 0), at(20, 0), STRAIGHT);
    const north = network.addSection(east.from, at(0, 20), STRAIGHT);
    // Leaves into the middle of the bend, at 45°. Counted, it would split the
    // 90° gap in two and set both straights back further.
    const via = arcViaLeaving(at(0, 0), at(1, 1), at(30, 10));
    if (via === null) throw new Error("expected an arc");
    const arc = network.addSection(east.from, at(30, 10), {
      kind: "arc",
      via,
    });

    const junction = new Junction(network, east.from, WIDTH_METERS);

    expect(junction.setbackOf(east.id)).toBeCloseTo(4);
    expect(junction.setbackOf(north.id)).toBeCloseTo(4);
    expect(junction.setbackOf(arc.id)).toBe(0);
  });

  it("throws for a section not meeting the node", () => {
    const network = new RoadNetwork();
    const road = network.addSection(at(0, 0), at(20, 0), STRAIGHT);

    const junction = new Junction(network, road.from, WIDTH_METERS);

    expect(() => junction.setbackOf(99 as SectionId)).toThrow();
  });
});
