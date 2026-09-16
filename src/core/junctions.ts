import { angleOf, distance } from "./points";
import { sectionDirectionLeavingNode } from "./queries";
import type { RoadNetwork } from "./RoadNetwork";
import { lineCrossing } from "./segments";
import type { NodeId, Section, SectionId, Vec2 } from "./types";

/**
 * The junction at a node: where the roads meeting there stop being roadways.
 * See `docs/road-layout.md`.
 *
 * Worked out from the node and the sections meeting it alone, for roads
 * `widthMeters` wide:
 *
 * - each gap under a half turn sets both its roads back, as `gapSetbacks` says
 * - a road set back from both sides takes the longer setback
 *
 * Arcs are skipped: an arc is set back 0, and the straights are set back as if
 * it weren't there.
 */
export class Junction {
  private readonly setbacks: ReadonlyMap<SectionId, number>;

  constructor(
    network: RoadNetwork,
    readonly node: NodeId,
    widthMeters: number,
  ) {
    this.setbacks = setbacksAt(network, node, widthMeters);
  }

  /**
   * How far from the node a section's roadway ends, in meters, measured along
   * its centerline. Throws for a section not meeting the node.
   */
  setbackOf(section: SectionId): number {
    const setback = this.setbacks.get(section);
    if (setback === undefined) {
      throw new Error(`Section ${section} does not meet node ${this.node}`);
    }
    return setback;
  }
}

/**
 * How close to a half turn a gap counts as one. Two roads in line are a half
 * turn apart only up to rounding, and their edges then cross far away on
 * either side, or nowhere. The setback such a gap would give is under
 * `(w/2)·tolerance/2`, far below anything visible.
 */
const HALF_TURN_TOLERANCE_RADIANS = 1e-9;

/**
 * A leg of the junction: one section meeting the node, seen from the node.
 * (A T-junction has three legs.)
 */
interface Leg {
  readonly section: Section;
  /** Unit vector, leaving the node. */
  readonly direction: Vec2;
  readonly angle: number;
}

function setbacksAt(
  network: RoadNetwork,
  node: NodeId,
  widthMeters: number,
): Map<SectionId, number> {
  const sections = network.sectionsAt(node).map((id) => network.getSection(id));
  const setbacks = new Map(sections.map((section) => [section.id, 0]));

  const legs: Leg[] = sections
    .filter((section) => section.geometry.kind === "straight")
    .map((section) => {
      const direction = sectionDirectionLeavingNode(network, section, node);
      return { section, direction, angle: angleOf(direction) };
    })
    .sort((a, b) => a.angle - b.angle);

  // The gap after each leg lies between it and the next leg round.
  legs.forEach((first, index) => {
    const second = legs[(index + 1) % legs.length];
    const gap =
      index + 1 < legs.length
        ? second.angle - first.angle
        : // The last gap wraps round, past the full turn, to the first leg.
          second.angle + 2 * Math.PI - first.angle;
    if (gap >= Math.PI - HALF_TURN_TOLERANCE_RADIANS) {
      return;
    }

    const found = gapSetbacks(network, node, first, second, widthMeters);
    for (const [leg, setback] of [
      [first, found.first],
      [second, found.second],
    ] as const) {
      const id = leg.section.id;
      setbacks.set(id, Math.max(setbacks.get(id) ?? 0, setback));
    }
  });
  return setbacks;
}

/**
 * How far a gap under a half turn sets back each of its two straight legs, in
 * meters: far enough that both end square through `P`, where their edges on
 * the gap's side cross.
 *
 * `first` and `second` are the legs either side of the gap, counterclockwise.
 * Let `N` be the node, `w` the road width, and for each leg `d` its direction
 * leaving `N`, `E` its far end, `ℓ = |NE|`, and `n` its normal toward the gap:
 *
 *     first:  n = (−d.z, d.x)       (d turned counterclockwise)
 *     second: n = (d.z, −d.x)       (d turned clockwise)
 *
 * - its edge: the line through `N + (w/2)·n` and `E + (w/2)·n`
 *   → parallel to the centerline, and as long
 * - `P`: where the two edges cross (`lineCrossing`), at fraction `a` along each
 * - the foot of `P` on the centerline is as far along it as `P` is along the
 *   edge:
 *
 *       s = a·ℓ
 *
 * Where the network can't be drawn right, an error is logged and:
 * - parallel edges (a gap of 0) → no `P` → both 0
 * - `a < 0`: `P` is behind `N` → both 0
 * - `s > ℓ/2`: the section is too short → `ℓ/2`, so its two setbacks never
 *   overlap
 */
function gapSetbacks(
  network: RoadNetwork,
  node: NodeId,
  first: Leg,
  second: Leg,
  widthMeters: number,
): { first: number; second: number } {
  const pair = `sections ${first.section.id} and ${second.section.id}`;
  const halfWidth = widthMeters / 2;
  const firstEdge = edgeOf(network, node, first, {
    x: -first.direction.z * halfWidth,
    z: first.direction.x * halfWidth,
  });
  const secondEdge = edgeOf(network, node, second, {
    x: second.direction.z * halfWidth,
    z: -second.direction.x * halfWidth,
  });

  const crossing = lineCrossing(
    firstEdge.near,
    firstEdge.far,
    secondEdge.near,
    secondEdge.far,
  );
  if (crossing === null) {
    console.error(
      `Node ${node}: ${pair} leave it in the same direction, so their edges ` +
        `never cross; not set back`,
    );
    return { first: 0, second: 0 };
  }
  if (crossing.alongA < 0 || crossing.alongB < 0) {
    console.error(
      `Node ${node}: the edges of ${pair} cross behind it; not set back`,
    );
    return { first: 0, second: 0 };
  }
  return {
    first: clampedToHalf(network, node, first, crossing.alongA),
    second: clampedToHalf(network, node, second, crossing.alongB),
  };
}

/**
 * The setback `along·ℓ` of a leg `ℓ` long, but no more than `ℓ/2`; logs an
 * error where it had to be cut.
 */
function clampedToHalf(
  network: RoadNetwork,
  node: NodeId,
  leg: Leg,
  along: number,
): number {
  const half = halfLength(network, leg.section);
  const setback = along * 2 * half;
  if (setback <= half) {
    return setback;
  }
  console.error(
    `Node ${node}: section ${leg.section.id} is too short for its setback ` +
      `(${setback.toFixed(2)} m of ${(2 * half).toFixed(2)} m); ` +
      `set back by half its length`,
  );
  return half;
}

/** A straight leg's edge `offset` to its side, from the node's end out. */
function edgeOf(
  network: RoadNetwork,
  node: NodeId,
  leg: Leg,
  offset: Vec2,
): { near: Vec2; far: Vec2 } {
  const { section } = leg;
  const near = network.getNode(node).position;
  const far = network.getNode(
    section.from === node ? section.to : section.from,
  ).position;
  return {
    near: { x: near.x + offset.x, z: near.z + offset.z },
    far: { x: far.x + offset.x, z: far.z + offset.z },
  };
}

/** Half a straight section's length, in meters. */
function halfLength(network: RoadNetwork, section: Section): number {
  return (
    distance(
      network.getNode(section.from).position,
      network.getNode(section.to).position,
    ) / 2
  );
}
