import { arcPolyline } from "../core/arcs";
import { positionOfNode } from "../core/queries";
import type { RoadNetwork } from "../core/RoadNetwork";
import type { Section, SectionGeometry, Vec2 } from "../core/types";

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
  return polylineBetween(
    positionOfNode(network, section.from),
    positionOfNode(network, section.to),
    section.geometry,
  );
}

/**
 * The same shape, for a stretch of road the network does not have yet: a
 * piece of a plan, whose ends are positions rather than nodes.
 *
 * `tessellate` is this with the nodes looked up first, and nothing else —
 * the two exist because one caller has a section and another has the
 * positions a section would be made from. A planned piece and the section
 * it becomes are the same two positions in the same geometry, so drawing
 * them any other way would move the preview under the click that commits
 * it.
 */
export function polylineBetween(
  from: Vec2,
  to: Vec2,
  geometry: SectionGeometry,
): readonly Vec2[] {
  return geometry.kind === "arc"
    ? arcPolyline(from, to, geometry.via, ARC_SAG_METERS)
    : [from, to];
}
