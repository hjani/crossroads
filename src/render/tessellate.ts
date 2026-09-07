import { arcPolyline } from "../core/arcs";
import { positionOfNode } from "../core/queries";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Section, Vec2 } from "../core/types";

/**
 * A section as the run of positions it is drawn along.
 *
 * Shared by everything that draws sections rather than owned by one of them,
 * so a mark on a section lands on the same shape the section itself is drawn
 * in — a coarser one would visibly cut inside the road it marks.
 */

/**
 * How far a drawn arc may stray from the curve it stands for, in meters.
 *
 * A distance on the ground rather than on screen, so the geometry depends on
 * the network alone and is rebuilt only when the network changes. Zoom far
 * enough in and the chords do eventually show, which is where a tolerance
 * that follows `Viewport.metersPerPixel` would take over.
 */
const ARC_SAG_METERS = 0.05;

/**
 * The positions a section is drawn along: its two ends for a straight, and
 * enough points to pass for the curve for an arc.
 *
 * Where the two kinds stop differing. Everything past here works on points,
 * so an arc costs a drawing no more than a straight with a lot of ends.
 *
 * Named for the job rather than for the shape of the answer: when sections
 * gain width, what a drawing wants of one is a ribbon rather than a line,
 * and this is the question that changes its answer while its callers stay
 * as they are.
 */
export function tessellate(
  network: RoadNetwork,
  section: Section,
): readonly Vec2[] {
  const from = positionOfNode(network, section.from);
  const to = positionOfNode(network, section.to);

  return section.geometry.kind === "arc"
    ? arcPolyline(from, to, section.geometry.via, ARC_SAG_METERS)
    : [from, to];
}
