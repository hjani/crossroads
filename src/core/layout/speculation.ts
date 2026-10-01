import { applySectionPlan, type BuildableSectionPlan } from "../network/edits";
import type { RoadNetwork } from "../network/RoadNetwork";
import type { NodeId, SectionId } from "../network/types";
import { RoadLayout } from "./RoadLayout";

/**
 * The network as a plan would leave it, and its layout.
 */
export interface LayoutSpeculation {
  /** The network with the plan applied, on a throwaway copy. */
  readonly speculativeNetwork: RoadNetwork;
  /** The layout of the speculative network. */
  readonly speculativeLayout: RoadLayout;
  /** The nodes whose junctions the edit changes. */
  readonly changedNodes: ReadonlySet<NodeId>;
  /** The sections whose roadways the edit changes. */
  readonly changedSections: ReadonlySet<SectionId>;
  /** The real network's sections the edit takes away: the ones it cuts. */
  readonly removedSections: ReadonlySet<SectionId>;
  /** The planned road's own nodes: the ends of its sections. */
  readonly plannedRoadNodes: ReadonlySet<NodeId>;
  /** The planned road's own sections. */
  readonly plannedRoadSections: ReadonlySet<SectionId>;
}

/** Applies the plan to a copy of `network`, and finds what it changes. */
export function speculateLayout(
  network: RoadNetwork,
  plan: BuildableSectionPlan,
): LayoutSpeculation {
  const speculativeNetwork = network.clone();
  const built = applySectionPlan(speculativeNetwork, plan);

  const speculativeLayout = new RoadLayout(speculativeNetwork);
  const changedNodes = affectedNodes(network, speculativeNetwork);
  const changedSections = affectedSections(speculativeNetwork, changedNodes);
  const removedSections = sectionsRemoved(
    network,
    speculativeNetwork,
    changedNodes,
  );
  const plannedRoadNodes = new Set(built.flatMap((s) => [s.from, s.to]));
  const plannedRoadSections = new Set(built.map((s) => s.id));
  return {
    speculativeNetwork,
    speculativeLayout,
    changedNodes,
    changedSections,
    removedSections,
    plannedRoadNodes,
    plannedRoadSections,
  };
}

/**
 * The ends of every section the real network doesn't have: the plan's own
 * pieces and the pieces of what it cut → the plan's points and the far ends
 * of the cut sections. Their junctions are the ones the edit changed.
 */
function affectedNodes(
  real: RoadNetwork,
  speculative: RoadNetwork,
): Set<NodeId> {
  const existing = new Set(Array.from(real.allSections(), (s) => s.id));
  const nodes = new Set<NodeId>();
  for (const section of speculative.allSections()) {
    if (!existing.has(section.id)) {
      nodes.add(section.from);
      nodes.add(section.to);
    }
  }
  return nodes;
}

/**
 * Every section meeting one of the nodes. Their roadways are the ones the
 * edit changed.
 */
function affectedSections(
  speculative: RoadNetwork,
  nodes: ReadonlySet<NodeId>,
): Set<SectionId> {
  const sections = new Set<SectionId>();
  for (const node of nodes) {
    for (const section of speculative.sectionsAt(node)) {
      sections.add(section);
    }
  }
  return sections;
}

/**
 * The real sections the speculative network no longer has, found around the
 * changed nodes alone:
 *
 *     removed = { s ∈ real.sectionsAt(n) : s ∉ speculative.sectionsAt(n) },  n ∈ changed
 *
 * - complete: a cut section is replaced end to end by new pieces → both its
 *   ends get a new section → both are changed nodes
 * - a node the plan makes isn't in the real network → `sectionsAt` is empty
 * - an edit never removes a node: a cut adds its pieces before removing the
 *   section → no removed nodes to look for
 */
function sectionsRemoved(
  real: RoadNetwork,
  speculative: RoadNetwork,
  changed: ReadonlySet<NodeId>,
): Set<SectionId> {
  const removed = new Set<SectionId>();
  for (const node of changed) {
    const kept = new Set(speculative.sectionsAt(node));
    for (const section of real.sectionsAt(node)) {
      if (!kept.has(section)) {
        removed.add(section);
      }
    }
  }
  return removed;
}
