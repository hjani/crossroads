import { describe, expect, it } from "vitest";
import { pick } from "./pick";
import { RoadLayout } from "./RoadLayout";
import { RoadNetwork } from "../network/RoadNetwork";
import type { Vec2 } from "../geometry/point";
import { addStraight, TEST_ROAD_WIDTH_METERS } from "../testSupport";

const HALF_WIDTH_METERS = TEST_ROAD_WIDTH_METERS / 2;

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

describe("pick", () => {
  it("is null for an empty network", () => {
    expect(pick(new RoadLayout(new RoadNetwork()), vec(0, 0))).toBeNull();
  });

  it("picks a straight roadway across its whole width, and no further", () => {
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const layout = new RoadLayout(network);

    expect(pick(layout, vec(10, 3.9))).toMatchObject({
      kind: "roadway",
      section: road.id,
    });
    expect(pick(layout, vec(10, 4.1))).toBeNull();
  });

  it("picks an arc roadway by its curve, on both sides", () => {
    // A half circle around (10, 0), radius 10, over the top.
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
    const layout = new RoadLayout(network);

    for (const inside of [vec(10, 13.9), vec(10, 6.1)]) {
      expect(pick(layout, inside)).toMatchObject({
        kind: "roadway",
        section: arc.id,
      });
    }
    expect(pick(layout, vec(10, 5.9))).toBeNull();
  });

  it("picks a dead end's node inside its round cap", () => {
    // The cap is the half disc of radius w/2 west of the node.
    const network = new RoadNetwork();
    const road = addStraight(network, vec(0, 0), vec(20, 0));
    const layout = new RoadLayout(network);

    expect(pick(layout, vec(-3, 0))).toMatchObject({
      kind: "junction",
      node: road.from,
    });
    // √18 ≈ 4.24 from the node: past the cap.
    expect(pick(layout, vec(-3, 3))).toBeNull();
  });

  it("picks a bend's node in its corner and round the outside of it", () => {
    // East and north: the square [−4, 4]², its corner (4, 4) where the edges
    // cross, and the far corner rounded off by the quarter circle of radius 4
    // about the node, between (−4, 0) and (0, −4).
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(20, 0));
    addStraight(network, east.from, vec(0, 20));
    const layout = new RoadLayout(network);

    const junction = { kind: "junction", node: east.from };
    expect(pick(layout, vec(3, 3))).toMatchObject(junction);
    // Past the chord from (−4, 0) to (0, −4), but inside the arc.
    expect(pick(layout, vec(-2.5, -2.5))).toMatchObject(junction);
    // Past the arc: √24.5 ≈ 4.95 from the node.
    expect(pick(layout, vec(-3.5, -3.5))).toBeNull();
  });

  it("leaves out the sliver between a chord and an edge bending into the junction", () => {
    // East, and an arc leaving north and curving west around O = (−R, 0).
    // Round the far side of the node, the outline runs down the arc's inner
    // edge, radius R − w/2, from its setback to (−4, 0): that edge bulges
    // into the junction, so the sliver between it and its chord is grass.
    const R = 20;
    const center = vec(-R, 0);
    const network = new RoadNetwork();
    const east = addStraight(network, vec(0, 0), vec(40, 0));
    const arc = network.addSection(
      east.from,
      onCircle(center, R, Math.PI / 2),
      { kind: "arc", via: onCircle(center, R, Math.PI / 4) },
      TEST_ROAD_WIDTH_METERS,
    );
    const layout = new RoadLayout(network);

    // The inner edge piece turns θ = s/R about O. Halfway along, the chord
    // falls short of the edge by the sagitta r·(1 − cos(θ/2)).
    const theta = layout.junctionAt(east.from).setbackOf(arc.id) / R;
    const inner = R - HALF_WIDTH_METERS;
    const sagitta = inner * (1 - Math.cos(theta / 2));

    expect(
      pick(layout, onCircle(center, inner - sagitta / 2, theta / 2)),
    ).toBeNull();
    // Just across the edge, the junction covers the ground again.
    expect(
      pick(layout, onCircle(center, inner + 0.5, theta / 2)),
    ).toMatchObject({ kind: "junction", node: east.from });
  });

  it("finds no ground at a straight join, only the roadways either side", () => {
    // Two roads in line: nothing is set back, and the junction between them
    // covers no ground at all.
    const network = new RoadNetwork();
    const west = addStraight(network, vec(-20, 0), vec(0, 0));
    const east = addStraight(network, west.to, vec(20, 0));
    const layout = new RoadLayout(network);

    expect(pick(layout, vec(0.5, 1))).toMatchObject({
      kind: "roadway",
      section: east.id,
    });
    expect(pick(layout, vec(-0.5, 1))).toMatchObject({
      kind: "roadway",
      section: west.id,
    });
  });
});
