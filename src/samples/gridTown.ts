import type { Vec2 } from "../core/geometry/point";
import type { RoadLayout } from "../core/layout/RoadLayout";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import { TWO_LANE_PROFILE } from "../input/SectionSettings";
import {
  Grid,
  headingOf,
  leftOf,
  negate,
  pens,
  rightOf,
  seededRandom,
  type Place,
} from "./pen";

const AVENUE = TWO_LANE_PROFILE;

/**
 * A made-up grid town to test against: a downtown grid, arterials leaving
 * it, a bypass, suburbs and an industrial park.
 *
 * The same town on every call; `seed` only varies how far the downtown
 * streets are tilted.
 */
export function buildGridTown(
  network: RoadNetwork,
  layout: RoadLayout,
  seed = 1,
): void {
  const random = seededRandom(seed);
  const pen = pens(network, layout);
  const culDeSac = (from: Place, heading: Vec2): void => {
    pen(from.at, heading).forward(50 + 30 * random());
  };

  // Downtown: a grid turned 7° off the axes, ragged at the edges, and a park
  // where column 4 stops for a block.
  const downtown = new Grid(
    pen,
    { x: 0, z: 0 },
    headingOf(-7),
    6,
    random,
    // Columns, west to east.
    [
      { at: -300, spans: [[1, 4]] },
      { at: -205, spans: [[0, 5]] },
      { at: -115, spans: [[0, 5]] },
      { at: -30, spans: [[0, 5]], profile: AVENUE },
      {
        at: 60,
        spans: [
          [0, 2],
          [3, 5],
        ],
      },
      { at: 150, spans: [[0, 5]] },
      { at: 240, spans: [[0, 4]] },
      { at: 320, spans: [[1, 3]] },
    ],
    // Rows, north to south. Row 3 is Main Street.
    [
      { at: -220, spans: [[1, 6]] },
      { at: -135, spans: [[0, 7]] },
      { at: -50, spans: [[0, 7]] },
      { at: 35, spans: [[0, 7]], profile: AVENUE },
      { at: 120, spans: [[0, 6]] },
      { at: 210, spans: [[1, 5]] },
    ],
  );
  downtown.build();
  const eastward = downtown.rowDirection(3);
  const southward = downtown.colDirection(3);

  // Main Street out of town both ways. The gates are where the bypass meets
  // it, both on Main Street's line.
  const east = pen(downtown.crossing(7, 3), eastward, AVENUE).forward(120);
  const eastGate = east.place;
  east.turn(300, 25);
  const industryCorner = east.place;
  east.forward(250);

  const west = pen(downtown.crossing(0, 3), negate(eastward), AVENUE);
  const westGate = west.forward(140).place;
  west.turn(350, -20).forward(250);

  // The bypass: half a circle north of downtown, gate to gate.
  pen(westGate.at, leftOf(eastward), AVENUE).arcTo(eastGate.at);

  // The avenue north across the bypass, and a country road off column 5.
  pen(downtown.crossing(3, 0), negate(southward), AVENUE)
    .forward(260)
    .turn(400, 15)
    .forward(200);
  pen(downtown.crossing(5, 0), negate(downtown.colDirection(5)))
    .forward(300)
    .turn(150, 60)
    .forward(200);

  // The avenue south, past the suburbs.
  const south = pen(downtown.crossing(3, 5), southward, AVENUE).forward(180);
  const suburbNorth = south.place;
  const suburbSouth = south.forward(160).place;
  south.turn(400, 25).forward(300);

  // East of the avenue: a loop with cul-de-sacs, back onto the avenue.
  const loop = pen(suburbNorth.at, leftOf(southward)).forward(70);
  const loopStops = [loop.place, loop.forward(80).place];
  loop.forward(70).turn(80, 90).turn(80, 90);
  loopStops.push(loop.forward(70).place, loop.forward(80).place);
  loop.lineTo(suburbSouth.at);
  for (const stop of loopStops) {
    culDeSac(stop, rightOf(stop.heading));
  }
  culDeSac(loopStops[0], leftOf(loopStops[0].heading));
  culDeSac(loopStops[1], leftOf(loopStops[1].heading));

  // West of the avenue: column 1 runs on south, with streets across to the
  // avenue and cul-de-sacs off its far side.
  const lane = pen(downtown.crossing(1, 5), downtown.colDirection(1));
  const laneStops = [lane.forward(150).place, lane.forward(150).place];
  lane.forward(80);
  for (const stop of laneStops) {
    culDeSac(stop, rightOf(stop.heading));
  }
  pen(suburbNorth.at, rightOf(southward)).connectTo(
    laneStops[0].at,
    negate(eastward),
  );
  pen(suburbSouth.at, rightOf(southward)).connectTo(
    laneStops[1].at,
    negate(eastward),
  );

  // Industry along Main Street's last straight, which is its first row.
  new Grid(
    pen,
    industryCorner.position,
    industryCorner.heading,
    0,
    random,
    [
      { at: 0, spans: [[0, 2]] },
      { at: 125, spans: [[0, 2]] },
      { at: 250, spans: [[0, 2]] },
    ],
    [
      { at: 0, spans: [] },
      { at: 150, spans: [[0, 2]], profile: AVENUE },
      { at: 300, spans: [[0, 2]] },
    ],
  ).build();
}
