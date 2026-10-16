import { unitDirection } from "../core/geometry/point";
import type { RoadLayout } from "../core/layout/RoadLayout";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import { TWO_LANE_PROFILE } from "../input/SectionSettings";
import {
  circle,
  Grid,
  headingOf,
  leftOf,
  negate,
  pens,
  polar,
  rightOf,
  seededRandom,
  turned,
  type GridLine,
} from "./pen";

const AVENUE = TWO_LANE_PROFILE;

/**
 * A made-up European town to test against: an old town of crooked streets
 * inside a ring boulevard, roads out to roundabouts and a street village,
 * and a 19th-century grid with a diagonal avenue.
 *
 * The same town on every call; `seed` varies the old town's streets and the
 * village lanes.
 */
export function buildEuropeanTown(
  network: RoadNetwork,
  layout: RoadLayout,
  seed = 1,
): void {
  const random = seededRandom(seed);
  const between = (low: number, high: number): number =>
    low + (high - low) * random();
  const pen = pens(network, layout);

  // The ring boulevard where the walls stood. Gates take the old town's
  // main streets, the posterns between them its side streets.
  const ring = circle(
    pen,
    { x: 0, z: 0 },
    280,
    [-95, -52, -10, 25, 60, 97, 135, 167, 200, 232],
    AVENUE,
  );
  const gates = ring.filter((_, i) => i % 2 === 0);
  const posterns = ring.filter((_, i) => i % 2 === 1);

  // The old town: a street from the market square to each gate, setting off
  // a little askew and bending toward the gate halfway.
  const market = { x: 15, z: -10 };
  const streets = gates.map((gate) => {
    const askew = turned(
      unitDirection(market, gate.position),
      between(-10, 10),
    );
    const street = pen(market, askew).forward(between(110, 150));
    const halfway = street.place;
    return { halfway, arrival: street.arcTo(gate.at).place };
  });

  // Lanes ringing the market from street to street, and a side street from
  // each postern meeting its lane halfway.
  streets.forEach(({ halfway }, i) => {
    const next = streets[(i + 1) % streets.length].halfway;
    const lane = pen(halfway.at, rightOf(halfway.heading)).connectTo(
      next.at,
      rightOf(next.heading),
    );
    pen(posterns[i].at, negate(posterns[i].heading)).lineTo(lane.along(0.5));
  });

  // East: a 19th-century grid of 110 m blocks, with a diagonal avenue
  // through its crossings out to a roundabout.
  const blocks = [0, 110, 220, 330, 440];
  const eixample = new Grid(
    pen,
    { x: 450, z: -200 },
    headingOf(0),
    0,
    random,
    blocks.map((at): GridLine => ({ at, spans: [[0, 4]] })),
    blocks.map((at, i): GridLine => ({
      at,
      spans: [[0, 4]],
      profile: i === 3 ? AVENUE : undefined,
    })),
  );
  eixample.build();
  const southEast = circle(
    pen,
    polar(eixample.crossing(4, 4), 45, 260),
    28,
    [-15, 105, 225],
  );
  const diagonal = pen(eixample.crossing(0, 0), headingOf(45), AVENUE);
  for (let i = 1; i <= 4; i++) {
    diagonal.lineTo(eixample.crossing(i, i));
  }
  diagonal.lineTo(southEast[2].at);
  pen(southEast[0].at, southEast[0].heading).forward(300);

  // From the ring out to the grid.
  pen(gates[1].at, streets[1].arrival.heading).connectTo(
    eixample.crossing(0, 1),
    headingOf(0),
  );
  pen(posterns[1].at, posterns[1].heading, AVENUE).connectTo(
    eixample.crossing(0, 3),
    headingOf(0),
  );
  pen(gates[2].at, streets[2].arrival.heading).connectTo(
    eixample.crossing(0, 4),
    headingOf(0),
  );

  // North: out to a roundabout, roads on west and round to the grid.
  const north = circle(pen, { x: -80, z: -690 }, 30, [-30, 90, 210]);
  pen(gates[0].at, streets[0].arrival.heading, AVENUE).connectTo(
    north[1].at,
    negate(north[1].heading),
  );
  pen(north[2].at, north[2].heading).forward(150).turn(500, -20).forward(300);
  pen(north[0].at, north[0].heading).connectTo(
    eixample.crossing(4, 0),
    headingOf(90),
  );

  // South: out to a roundabout, a road on west and one across to the
  // diagonal's roundabout.
  const south = circle(pen, { x: -20, z: 720 }, 28, [-90, 30, 150]);
  pen(posterns[2].at, posterns[2].heading, AVENUE).connectTo(
    south[0].at,
    negate(south[0].heading),
  );
  pen(south[1].at, south[1].heading).connectTo(
    southEast[1].at,
    negate(southEast[1].heading),
  );
  pen(south[2].at, south[2].heading).forward(200).turn(400, 20).forward(250);

  // South-west: a country road.
  pen(gates[3].at, streets[3].arrival.heading)
    .forward(250)
    .turn(600, 15)
    .forward(300);

  // West: a street village along the road out, lanes off either side.
  const village = pen(gates[4].at, streets[4].arrival.heading).forward(180);
  for (let i = 0; i < 5; i++) {
    const stop = village.forward(70).place;
    const side = i % 2 === 0 ? leftOf(stop.heading) : rightOf(stop.heading);
    pen(stop.at, side).forward(between(50, 80));
  }
  village.turn(500, -25).forward(250);
}
