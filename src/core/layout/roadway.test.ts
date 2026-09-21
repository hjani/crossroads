import { describe, expect, it } from "vitest";
import { Junction } from "./junction";
import { RoadNetwork } from "../network/RoadNetwork";
import { roadwayOf } from "./roadway";
import { STRAIGHT } from "../geometry/lineGeometry";
import type { Section } from "../network/types";
import type { Vec2 } from "../geometry/point";

const WIDTH_METERS = 8;

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
    from: new Junction(network, section.from, WIDTH_METERS).setbackOf(
      section.id,
    ),
    to: new Junction(network, section.to, WIDTH_METERS).setbackOf(section.id),
  };
}

describe("roadwayOf", () => {
  it("sets a straight back at both ends, each by its own junction", () => {
    const network = new RoadNetwork();
    const road = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT);
    // A right-angle bend at the start, a 60° gap at the end.
    network.addSection(road.from, vec(0, 20), STRAIGHT);
    network.addSection(road.to, vec(10, 10 * Math.sqrt(3)), STRAIGHT);

    const { length, outline } = roadwayOf(
      network,
      road,
      setbacksOf(network, road),
      WIDTH_METERS,
    );

    expectPoint(outline.from, vec(4, 0));
    expectPoint(outline.to, vec(20 - 4 * Math.sqrt(3), 0));
    expect(outline.centerlineGeometry).toBe(road.centerlineGeometry);
    expect(length).toBeCloseTo(20 - 4 - 4 * Math.sqrt(3));
  });

  it("names its section in its outline, with the width of the road", () => {
    const network = new RoadNetwork();
    const road = network.addSection(vec(0, 0), vec(20, 0), STRAIGHT);

    const { outline } = roadwayOf(
      network,
      road,
      setbacksOf(network, road),
      WIDTH_METERS,
    );

    expect(outline.section).toBe(road.id);
    expect(outline.widthMeters).toBe(WIDTH_METERS);
  });

  it("shrinks to nothing halfway along when both setbacks are clamped", () => {
    const network = new RoadNetwork();
    const road = network.addSection(vec(0, 0), vec(6, 0), STRAIGHT);
    // Right-angle bends at both ends, each wanting 4 m of a 6 m road.
    network.addSection(road.from, vec(0, 20), STRAIGHT);
    network.addSection(road.to, vec(6, 20), STRAIGHT);

    const { length, outline } = roadwayOf(
      network,
      road,
      setbacksOf(network, road),
      WIDTH_METERS,
    );

    expectPoint(outline.from, vec(3, 0));
    expectPoint(outline.to, vec(3, 0));
    expect(length).toBeCloseTo(0);
  });

  it("cuts an arc back along its own circle", () => {
    // A half circle around (10, 0), leaving (0, 0) north and turning
    // clockwise over the top: angle π at the start, 0 at the end. A straight
    // leaves the start at 135°, 45° from the arc; the far end is a dead end.
    const R = 10;
    const center = vec(10, 0);
    const network = new RoadNetwork();
    const arc = network.addSection(vec(0, 0), vec(20, 0), {
      kind: "arc",
      via: vec(10, 10),
    });
    network.addSection(arc.from, vec(-20, 20), STRAIGHT);
    const s = new Junction(network, arc.from, WIDTH_METERS).setbackOf(arc.id);

    const { length, outline } = roadwayOf(
      network,
      arc,
      setbacksOf(network, arc),
      WIDTH_METERS,
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
