import { describe, expect, it } from "vitest";
import { distanceToSegment } from "./geometry";
import { nearestSection } from "./queries";
import { RoadNetwork } from "./RoadNetwork";
import { STRAIGHT, type Vec2 } from "./types";

function at(x: number, z: number): Vec2 {
  return { x, z };
}

describe("distanceToSegment", () => {
  const from = at(0, 0);
  const to = at(10, 0);

  it("measures across to a point beside the middle", () => {
    expect(distanceToSegment(at(5, 3), from, to)).toBeCloseTo(3);
  });

  it("is zero on the segment itself", () => {
    expect(distanceToSegment(at(5, 0), from, to)).toBeCloseTo(0);
  });

  it("measures to the near end from a point past it", () => {
    // Four along the line beyond `to`, three across: the line would say
    // three, the segment says five.
    expect(distanceToSegment(at(14, 3), from, to)).toBeCloseTo(5);
  });

  it("measures to the near end from a point straight off it", () => {
    expect(distanceToSegment(at(-4, 0), from, to)).toBeCloseTo(4);
  });

  it("measures to a segment of no length as to a point", () => {
    expect(distanceToSegment(at(3, 4), from, from)).toBeCloseTo(5);
  });
});

describe("nearestSection", () => {
  it("finds a section the position runs alongside", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expect(nearestSection(network, at(5, 2), 3)?.id).toBe(section.id);
  });

  it("is null where nothing is in range", () => {
    const network = new RoadNetwork();
    network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    expect(nearestSection(network, at(5, 2), 1)).toBeNull();
  });

  it("is null for an empty network", () => {
    expect(nearestSection(new RoadNetwork(), at(0, 0), 100)).toBeNull();
  });

  it("takes the nearer of two in range", () => {
    const network = new RoadNetwork();
    const near = network.addSection(at(0, 0), at(10, 0), STRAIGHT);
    network.addSection(at(0, 5), at(10, 5), STRAIGHT);

    expect(nearestSection(network, at(5, 2), 10)?.id).toBe(near.id);
  });

  it("reaches a section only by its end", () => {
    const network = new RoadNetwork();
    const section = network.addSection(at(0, 0), at(10, 0), STRAIGHT);

    // Past the end, so the distance is to the end itself — in range at
    // three meters, out of it at one.
    expect(nearestSection(network, at(12, 2), 3)?.id).toBe(section.id);
    expect(nearestSection(network, at(12, 2), 1)).toBeNull();
  });
});
