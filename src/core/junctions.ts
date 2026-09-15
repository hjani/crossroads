import { angleOf, distance } from "./points";
import { sectionDirectionLeavingNode } from "./queries";
import type { RoadNetwork } from "./RoadNetwork";
import type { NodeId, Section, SectionId } from "./types";

/**
 * The junction at a node: where the roads meeting there stop being roadways.
 * See `docs/road-layout.md`.
 *
 * Worked out from the node and the sections meeting it alone, for roads
 * `widthMeters` wide:
 *
 * - each gap under a half turn sets both its roads back, as `gapSetback` says
 * - a road set back from both sides takes the longer setback
 * - never more than half the section's length
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

function setbacksAt(
  network: RoadNetwork,
  node: NodeId,
  widthMeters: number,
): Map<SectionId, number> {
  const sections = network.sectionsAt(node).map((id) => network.getSection(id));
  const setbacks = new Map(sections.map((section) => [section.id, 0]));

  const roads = sections
    .filter((section) => section.geometry.kind === "straight")
    .map((section) => ({
      section,
      angle: angleOf(sectionDirectionLeavingNode(network, section, node)),
    }))
    .sort((a, b) => a.angle - b.angle);

  // gaps[i] lies between roads[i] and the next road round.
  const gaps = roads.map((road, index) =>
    index + 1 < roads.length
      ? roads[index + 1].angle - road.angle
      : // The last gap wraps round, past the full turn, to the first road.
        roads[0].angle + 2 * Math.PI - road.angle,
  );

  roads.forEach((road, index) => {
    const beforeGap = gaps[(index + roads.length - 1) % roads.length];
    const afterGap = gaps[index];
    const longerGap = Math.max(
      gapSetback(beforeGap, widthMeters),
      gapSetback(afterGap, widthMeters),
    );
    setbacks.set(
      road.section.id,
      Math.min(longerGap, halfLength(network, road.section)),
    );
  });
  return setbacks;
}

/**
 * How far a gap sets back each of its two straight roads, in meters: far enough
 * that both end square through `P`, where their edges on the gap's side cross.
 * 0 for a gap of a half turn or more.
 *
 * Let `φ` be the gap, `w` the road width, `N` the node, `ρ = |NP|`, and `F` the
 * foot of `P` on either centerline.
 *
 * - `P` is `w/2` from both centerlines → on the line splitting the gap in half
 * - right triangle `N F P`, with angle `φ/2` at `N`:
 *   `|PF| = ρ·sin(φ/2) = w/2`
 * - the setback is `|NF| = ρ·cos(φ/2)`
 *
 *       s = (w/2) / tan(φ/2)
 *
 * - `φ → π`: `s → 0` → a gap of a half turn or more is 0, with no jump
 * - `φ → 0`: `s` grows without limit; `φ = 0` gives `Infinity`, which the
 *   clamp to half a section catches
 */
function gapSetback(gap: number, widthMeters: number): number {
  return gap < Math.PI ? widthMeters / 2 / Math.tan(gap / 2) : 0;
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
