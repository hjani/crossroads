import { arcLength, pointOnArc } from "../geometry/arc";
import { unitDirection, type Vec2 } from "../geometry/point";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { LineGeometry } from "../geometry/lineGeometry";
import type { Section } from "../network/types";

/**
 * A section between the setbacks at its two ends: a shorter section of the
 * same kind. See `docs/road-layout.md`.
 */
export interface Roadway {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly centerlineGeometry: LineGeometry;
}

/**
 * The roadway along a section, given how far back the junctions at its two
 * ends set it — `s₁` at `from` and `s₂` at `to`, in meters along the
 * centerline (`Junction.setbackOf`).
 *
 * Straight, with `d = unitDirection(from, to)`:
 *
 *     from + s₁·d  →  to − s₂·d
 *
 * Arc, with `L` its length and `p(t)` = `pointOnArc` — a fraction of the
 * length is the same fraction of the angle, so the setbacks are fractions
 * `t₁ = s₁/L` and `t₂ = 1 − s₂/L`:
 *
 *     p(t₁)  →  p(t₂),  via p((t₁ + t₂)/2)
 *
 * - a new `via`: the old one can lie on the part cut away, and the arc
 *   through it would then run the other way round the circle
 *
 * Both:
 * - each setback is at most half the section → the ends never pass each other
 * - both clamped → a roadway of zero length, halfway along
 */
export function roadwayOf(
  network: RoadNetwork,
  section: Section,
  setbacks: { readonly from: number; readonly to: number },
): Roadway {
  const from = network.getNode(section.from).position;
  const to = network.getNode(section.to).position;
  const { from: s1, to: s2 } = setbacks;

  if (section.centerlineGeometry.kind === "arc") {
    const { via } = section.centerlineGeometry;
    const length = arcLength(from, to, via);
    const t1 = s1 / length;
    const t2 = 1 - s2 / length;
    return {
      from: pointOnArc(from, to, via, t1),
      to: pointOnArc(from, to, via, t2),
      centerlineGeometry: {
        kind: "arc",
        via: pointOnArc(from, to, via, (t1 + t2) / 2),
      },
    };
  }

  const d = unitDirection(from, to);
  return {
    from: { x: from.x + s1 * d.x, z: from.z + s1 * d.z },
    to: { x: to.x - s2 * d.x, z: to.z - s2 * d.z },
    centerlineGeometry: section.centerlineGeometry,
  };
}
