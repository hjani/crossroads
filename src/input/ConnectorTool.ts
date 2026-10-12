import * as THREE from "three";
import { biarcBetween } from "../core/geometry/biarc";
import type { LineGeometry } from "../core/geometry/lineGeometry";
import { angleOf, distance, type Vec2 } from "../core/geometry/point";
import { geometryLeaving } from "../core/network/directions";
import { sectionDirectionAt, sectionFractionAt } from "../core/network/queries";
import {
  applyRoadPlan,
  planRoad,
  type RoadPlan,
} from "../core/layout/roadPlan";
import type { RoadLayout } from "../core/layout/RoadLayout";
import type { RoadNetwork } from "../core/network/RoadNetwork";
import type { NodeId, Section, SectionId } from "../core/network/types";
import { JunctionHighlight } from "../render/JunctionHighlight";
import type { PartStates } from "../render/PartStates";
import { SectionPlanView } from "../render/SectionPlanView";
import type { ScreenPoint, Viewport } from "../render/Viewport";
import type { SectionSettingsPanel } from "../ui/SectionSettingsPanel";
import {
  arrivalDirection,
  capturedDirection,
  sweepsWithinLimit,
} from "./curvedRoadHelpers";
import type { SectionSettings } from "./SectionSettings";
import {
  endpointFrom,
  placeSectionEnd,
  withinPickRadius,
  type Placement,
} from "./sectionPointPlacement";
import { hideSpeculatedParts, showLanding, showPlacedEnd } from "./toolHelpers";
import type { Modifiers, Tool } from "./Tool";

/**
 * How much of the cursor's latest movement its heading is read over. In
 * pixels, as the capture radius: a movement of the hand, the same at every
 * zoom. Long enough that a pixel of jitter doesn't turn it, short enough to be
 * the way the cursor is going now rather than where it came from.
 */
const HEADING_TRAIL_PIXELS = 30;

/**
 * How far the cursor may get from where the far end was last welded before
 * the arrival is dropped. In pixels, as the capture radius: a slip of the hand,
 * the same at every zoom. Wider than the pick radius, so a slip off the road
 * while tuning the place, or a small overshoot, keeps the angle.
 */
const RELEASE_DISTANCE_PIXELS = 30;

/** A far end welded onto the network: a node, or a place on a road. */
type Weld = Extract<Placement, { kind: "node" | "section" }>;

/**
 * An arrival direction kept relative to a road, so that it turns with the
 * road.
 */
interface RelativeArrival {
  readonly section: SectionId;
  /** Whether forward is against the section's own from → to. */
  readonly reversed: boolean;
  /** From forward to the arrival direction, in radians, as `angleOf` measures. */
  readonly angle: number;
}

/**
 * How the connector arrives at its far end (`docs/tools.md`, Placing a
 * connector), carried while the end slides along the network.
 */
interface Arrival {
  /** The direction the connector is heading as it reaches `weld`. */
  readonly direction: Vec2;
  /**
   * The same direction, relative to the last road the far end was welded
   * onto, so it can turn with that road. Null until the end has been on one.
   */
  readonly relative: RelativeArrival | null;
  /** What the far end was last welded onto. */
  readonly weld: Weld;
}

/**
 * Draws a road that leaves its start smoothly and arrives smoothly at the road
 * its far end welds onto (`docs/tools.md`, Placing a connector).
 *
 * - A click picks the start, and a flick its direction, as in `SmartArcTool`.
 *   From then on the cursor is the far end.
 * - Far end welded onto a node or a road: the road is a biarc, arriving there
 *   in the arrival direction. The cursor's heading picks it when the end first
 *   welds; sliding on carries it, and only pulling away drops it.
 * - Far end on open ground: the smart arc's arc.
 * - Planned and drawn as what building it would do, refusals included.
 * - A click builds the plan on screen where it can be built, and its far end
 *   starts the next connector, which needs a flick of its own.
 *
 * Cancelling ends the run and keeps what was already built.
 */
export class ConnectorTool implements Tool {
  /** Where the next click would land. */
  private readonly landingMark: JunctionHighlight;
  /** The start, once placed. */
  private readonly startMark: JunctionHighlight;
  private readonly planView = new SectionPlanView("surface");
  private readonly decoration = new THREE.Group();
  private readonly unsubscribeSettingsChanged: () => void;

  private start: Placement | null = null;
  /**
   * The direction a flick picked at the start:
   * - null until the cursor first leaves the capture circle
   * - null again once the cursor is back inside the start's pick radius
   * - null again once a click has built the connector, for the next one to
   *   flick
   */
  private flickedDirection: Vec2 | null = null;
  /**
   * What the cursor was last aimed at: the raw position on the ground and the
   * resolved placement.
   */
  private aim: { ground: Vec2; placed: Placement } | null = null;
  /**
   * The cursor's latest positions on the ground, oldest first, reaching back
   * `HEADING_TRAIL_PIXELS` along its path.
   */
  private trail: Vec2[] = [];
  /**
   * How the connector arrives at its far end, carried while the end slides:
   * - null until the end first welds, and the cursor has a heading
   * - kept through a slip off the network, null once the cursor is further
   *   than `RELEASE_DISTANCE_PIXELS` from where the end was last welded
   * - null again once a click has built the connector: its weld names the
   *   road the click just cut
   */
  private arrival: Arrival | null = null;
  /**
   * The road from the start to the far end at the aim: what is drawn, and what
   * a click builds. Null where there is none (`updatePlan`).
   */
  private plan: RoadPlan | null = null;

  constructor(
    private readonly network: RoadNetwork,
    private readonly layout: RoadLayout,
    private readonly viewport: Viewport,
    private readonly partStates: PartStates,
    private readonly settings: SectionSettings,
    private readonly settingsPanel: SectionSettingsPanel,
  ) {
    this.landingMark = new JunctionHighlight(settings.profile.width);
    this.startMark = new JunctionHighlight(settings.profile.width);
    this.unsubscribeSettingsChanged = settingsPanel.onSettingsChanged(() =>
      this.afterSettingsChange(),
    );

    partStates.reset();
    // The plan first, so the marks draw over it.
    this.decoration.add(
      this.planView.sceneObject,
      this.landingMark.sceneObject,
      this.startMark.sceneObject,
    );
  }

  get overlay(): THREE.Object3D {
    return this.decoration;
  }

  /**
   * Places the start, or builds the plan on screen. A refused plan builds
   * nothing and the connector stays in progress, so the click can be made
   * again somewhere it works.
   */
  onPointerDown(point: ScreenPoint, modifiers: Modifiers): void {
    if (this.start === null) {
      const ground = this.viewport.screenToGround(point);
      if (ground === null) return;
      this.start = this.placeAt(ground, modifiers);
      return;
    }

    const plan = this.plan;
    if (plan === null || !plan.buildable) return;
    const far = applyRoadPlan(this.network, plan);

    // The far end starts the next connector, as in `SmartArcTool`. Its
    // position is asked for rather than assumed: the click may have landed on
    // a junction already there, a centimeter away.
    this.start = {
      kind: "node",
      node: far,
      position: this.network.getNode(far).position,
    };
    this.flickedDirection = null;
    this.arrival = null;
  }

  /**
   * Records the cursor's trail, then picks the direction the cursor is
   * flicked in at the start, and releases it, as in `SmartArcTool`:
   * - leaving the capture circle picks one (`capturedDirection`), if none is
   *   picked yet
   * - coming back inside the pick radius releases it
   *
   * Only on a move of the cursor, not after every change of view: a pan or a
   * zoom sliding the start away under a still cursor is not a flick.
   */
  onPointerMove(point: ScreenPoint): void {
    const ground = this.viewport.screenToGround(point);
    if (ground === null) return;
    this.recordTrail(ground);

    if (this.start === null) return;
    if (withinPickRadius(this.viewport, ground, this.start.position)) {
      this.flickedDirection = null;
    } else {
      this.flickedDirection ??= capturedDirection(
        this.viewport,
        this.network,
        this.start,
        ground,
      );
    }
  }

  /** Ends the run. What was built stays. */
  cancel(): void {
    this.start = null;
    this.flickedDirection = null;
    this.arrival = null;
  }

  /**
   * Works out what the cursor aims at, how it arrives there and the road to
   * it, and redraws.
   */
  afterInputOrViewChange(
    cursor: ScreenPoint | null,
    modifiers: Modifiers,
  ): void {
    const ground =
      cursor === null ? null : this.viewport.screenToGround(cursor);
    this.aim =
      ground === null
        ? null
        : { ground, placed: this.placeAt(ground, modifiers) };
    this.updateArrival();
    this.updatePlan();
    this.redraw();
  }

  /**
   * Plans again for the new profile, and redraws. Where a click lands doesn't
   * depend on it, so the aim stays as it was.
   */
  afterSettingsChange(): void {
    this.landingMark.setRoadWidth(this.settings.profile.width);
    this.startMark.setRoadWidth(this.settings.profile.width);
    this.updatePlan();
    this.redraw();
  }

  /**
   * Adds the cursor's position to its trail, and drops the oldest positions
   * the trail no longer needs: it keeps the newest ones back to the first that
   * is `HEADING_TRAIL_PIXELS` along the path, at the current zoom.
   */
  private recordTrail(ground: Vec2): void {
    this.trail.push(ground);
    const reach = HEADING_TRAIL_PIXELS * this.viewport.metersPerPixel;
    let along = 0;
    for (let index = this.trail.length - 1; index > 0; index--) {
      along += distance(this.trail[index], this.trail[index - 1]);
      if (along >= reach) {
        this.trail.splice(0, index - 1);
        return;
      }
    }
  }

  /**
   * The way the cursor has been heading over its trail, or null before it has
   * moved.
   */
  private trailHeading(): Vec2 | null {
    const oldest = this.trail.at(0);
    const newest = this.trail.at(-1);
    if (oldest === undefined || newest === undefined) return null;

    const heading = { x: newest.x - oldest.x, z: newest.z - oldest.z };
    return heading.x === 0 && heading.z === 0 ? null : heading;
  }

  /**
   * Picks, carries or drops the arrival for the far end at the aim:
   * - welded, with none carried: a first weld, picked by the cursor's heading.
   *   Not yet where the cursor hasn't moved, as when a zoom welds it: the
   *   next move picks it
   * - entering a junction: picked by the heading again, as a first weld. A
   *   road beside the junction may have caught the cursor on its way in, and
   *   that road's pick is not the way it came. The angle to the last road
   *   stays, for the road slid onto next
   * - welded, with one carried: carried onto the new weld (`carryArrival`)
   * - not welded: kept through a slip, dropped once the cursor is further than
   *   `RELEASE_DISTANCE_PIXELS` from where the end was last welded
   */
  private updateArrival(): void {
    if (this.start === null) {
      this.arrival = null;
      return;
    }
    if (this.aim === null) return;

    const end = this.endAt(this.start, this.aim.ground, this.aim.placed);
    if (end === null || !isWeld(end)) {
      const release = RELEASE_DISTANCE_PIXELS * this.viewport.metersPerPixel;
      if (
        this.arrival !== null &&
        distance(this.aim.ground, this.arrival.weld.position) > release
      ) {
        this.arrival = null;
      }
      return;
    }

    const last = this.arrival?.weld ?? null;
    const entersJunction =
      end.kind === "node" && !(last?.kind === "node" && last.node === end.node);
    if (this.arrival !== null && !entersJunction) {
      this.arrival = carryArrival(this.network, this.arrival, end);
      return;
    }
    const heading = this.trailHeading();
    const direction =
      heading === null ? null : arrivalDirection(this.network, end, heading);
    this.arrival =
      direction === null
        ? null
        : {
            direction,
            relative:
              end.kind === "section"
                ? relativeOnSection(this.network, end, direction)
                : (this.arrival?.relative ?? null),
            weld: end,
          };
  }

  /**
   * Plans the road from the start to the far end at the aim, leaving in the
   * flicked direction and, while the end is welded, arriving in the carried
   * one. None before a start, before a flick, or while the cursor has not
   * left the start (`endAt`).
   */
  private updatePlan(): void {
    this.plan = null;
    if (this.start === null || this.aim === null) return;
    const end = this.endAt(this.start, this.aim.ground, this.aim.placed);
    if (end === null || this.flickedDirection === null) return;

    // Kept through a slip, but only used while the end is welded.
    const arriving = isWeld(end) ? (this.arrival?.direction ?? null) : null;
    this.plan = this.planTo(this.start, end, this.flickedDirection, arriving);
  }

  /**
   * Draws the plan, and the marks around it:
   * - before a start: a mark on where it would start from
   * - after: a mark on the start, the plan with a mark on where its far end
   *   lands
   */
  private redraw(): void {
    if (this.start === null) {
      this.startMark.hide();
      this.showPlan(null);
      hideSpeculatedParts(this.partStates, null);
      showLanding(this.landingMark, this.aim?.placed ?? null, null);
      return;
    }

    this.showPlan(this.plan);
    hideSpeculatedParts(this.partStates, this.plan);
    showPlacedEnd(this.startMark, this.start, this.plan);
    // A plan's far end is where the aim landed (`endAt`).
    showLanding(
      this.landingMark,
      this.plan !== null ? (this.aim?.placed ?? null) : null,
      this.plan,
    );
  }

  /**
   * The road from start to end, leaving in `leaving` and arriving heading
   * `arriving`, or null where it is no road worth drawing: no shape for it
   * (`geometryBetween`), or a plan with no piece because the end resolved onto
   * the start's own place. A plan that does come back may still be
   * unbuildable.
   */
  private planTo(
    start: Placement,
    end: Placement,
    leaving: Vec2,
    arriving: Vec2 | null,
  ): RoadPlan | null {
    const geometry = geometryBetween(
      start.position,
      leaving,
      end.position,
      arriving,
    );
    if (geometry === null) return null;

    const plan = planRoad(
      this.network,
      this.layout,
      endpointFrom(start),
      endpointFrom(end),
      geometry,
      this.settings.profile,
    );
    return plan.sectionPlan.pieces.length > 0 ? plan : null;
  }

  private showPlan(plan: RoadPlan | null): void {
    if (plan !== null) {
      this.planView.showRoadPlan(this.network, plan);
    } else {
      this.planView.hide();
    }
  }

  /** The place a click at `ground` would land on: the start, or the far end. */
  private placeAt(ground: Vec2, modifiers: Modifiers): Placement {
    return placeSectionEnd(this.network, this.layout, this.viewport, ground, {
      useGrid: !modifiers.ctrl,
    });
  }

  /**
   * The far end a click at `ground`, landing on `placed`, would make, or null
   * while it has not left the start's pick radius. Measured from the cursor,
   * as in `StraightSectionTool`: zoomed out, the radius covers neighboring
   * nodes too, and a cursor still on the start has not aimed anywhere.
   */
  private endAt(
    start: Placement,
    ground: Vec2,
    placed: Placement,
  ): Placement | null {
    return withinPickRadius(this.viewport, ground, start.position)
      ? null
      : placed;
  }

  /** Releases GPU buffers and any UI. */
  dispose(): void {
    this.unsubscribeSettingsChanged();
    this.settingsPanel.dispose();
    this.landingMark.dispose();
    this.startMark.dispose();
    this.planView.dispose();
  }
}

/**
 * The shape of the road leaving `from` in `leaving` and ending at `to`:
 * - with `arriving`, the biarc that reaches `to` heading that way
 * - without, the smart arc's arc
 *
 * Null where there is no such shape, or where it sweeps further round than
 * `sweepsWithinLimit` allows.
 */
function geometryBetween(
  from: Vec2,
  leaving: Vec2,
  to: Vec2,
  arriving: Vec2 | null,
): LineGeometry | null {
  let geometry: LineGeometry | null;
  if (arriving === null) {
    geometry = geometryLeaving(from, leaving, to);
  } else {
    const biarc = biarcBetween(from, leaving, to, arriving);
    geometry = biarc === null ? null : { kind: "biarc", biarc };
  }
  return geometry !== null && sweepsWithinLimit(from, to, geometry)
    ? geometry
    : null;
}

function isWeld(placement: Placement): placement is Weld {
  return placement.kind === "node" || placement.kind === "section";
}

/**
 * The arrival carried from `previous` onto the far end's new weld `end`
 * (`docs/tools.md`, Placing a connector):
 * - onto the road it is kept relative to, or one meeting it at a node: the
 *   same angle to the road (`carriedOnto`)
 * - anything else: the offered direction nearest the carried one. On a
 *   junction the relative arrival stays, for the road the end slides onto
 *   next
 */
function carryArrival(
  network: RoadNetwork,
  previous: Arrival,
  end: Weld,
): Arrival {
  if (end.kind === "section" && previous.relative !== null) {
    const relative = carriedOnto(
      network,
      previous.relative,
      end.section,
      previous.weld,
    );
    if (relative !== null) {
      return {
        direction: absoluteAt(network, relative, end.position),
        relative,
        weld: end,
      };
    }
  }

  const direction =
    arrivalDirection(network, end, previous.direction) ?? previous.direction;
  return {
    direction,
    relative:
      end.kind === "section"
        ? relativeOnSection(network, end, direction)
        : previous.relative,
    weld: end,
  };
}

/**
 * `relative`, moved onto `section`: as it is on the same section; on one
 * meeting it at a node, with forward carried on through that node. Null where
 * the two don't meet.
 *
 * Forward running into the node along the old section runs out of it along
 * the new one, and the other way round — whichever way either section is
 * drawn. So the arrival stays on the same side of the road.
 *
 * Where the two meet at both their ends, the node the end was last welded
 * onto is preferred.
 */
function carriedOnto(
  network: RoadNetwork,
  relative: RelativeArrival,
  section: SectionId,
  lastWeld: Weld,
): RelativeArrival | null {
  if (section === relative.section) return relative;

  const old = network.getSection(relative.section);
  const next = network.getSection(section);
  const shared = [next.from, next.to].filter(
    (node) => node === old.from || node === old.to,
  );
  const node =
    lastWeld.kind === "node" && shared.includes(lastWeld.node)
      ? lastWeld.node
      : shared.at(0);
  if (node === undefined) return null;

  // Reversed where the new section's own heading runs the same way at the
  // node as forward did along the old one.
  const reversed =
    forwardRunsInto(next, node, false) ===
    forwardRunsInto(old, node, relative.reversed);
  return { section, reversed, angle: relative.angle };
}

/** Whether forward along `section` runs into `node`, rather than out of it. */
function forwardRunsInto(
  section: Section,
  node: NodeId,
  reversed: boolean,
): boolean {
  return (section.to === node) !== reversed;
}

/**
 * `direction` at a place on a road, kept relative to that road, with the
 * section's own from → to as forward.
 */
function relativeOnSection(
  network: RoadNetwork,
  end: Extract<Weld, { kind: "section" }>,
  direction: Vec2,
): RelativeArrival {
  const forward = forwardAt(network, end.section, false, end.position);
  return {
    section: end.section,
    reversed: false,
    angle: angleOf(direction) - angleOf(forward),
  };
}

/** The direction a relative arrival gives at `place` on its road. */
function absoluteAt(
  network: RoadNetwork,
  relative: RelativeArrival,
  place: Vec2,
): Vec2 {
  const forward = forwardAt(
    network,
    relative.section,
    relative.reversed,
    place,
  );
  const angle = angleOf(forward) + relative.angle;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/** Which way is forward at `place` on a road: its own heading, or reversed. */
function forwardAt(
  network: RoadNetwork,
  sectionId: SectionId,
  reversed: boolean,
  place: Vec2,
): Vec2 {
  const section = network.getSection(sectionId);
  const heading = sectionDirectionAt(
    network,
    section,
    sectionFractionAt(network, section, place),
  );
  return reversed ? { x: -heading.x, z: -heading.z } : heading;
}
