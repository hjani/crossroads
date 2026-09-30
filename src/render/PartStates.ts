import type { NodeId, SectionId } from "../core/network/types";

/**
 * What a tool says about a part of the layout (`docs/part-states.md`).
 *
 * The number is the priority: a part in several states shows the highest.
 */
export const PART_STATE = {
  NONE: 0,
  AIMED: 1,
  SELECTED: 2,
  PLANNED: 3,
  REFUSED: 4,
  HIDDEN: 5,
} as const;

export type PartState = (typeof PART_STATE)[keyof typeof PART_STATE];

/** A state a part can be put in. `NONE` is only ever the absence of these. */
export type SetPartState = Exclude<PartState, typeof PART_STATE.NONE>;

/**
 * The states every part is in: a junction by its node, a roadway by its
 * section. A part can be in several at once, and shows the highest.
 */
export class PartStates {
  /** Per part, bit `s` set for each state `s` it is in. */
  private readonly junctionFlags = new Map<NodeId, number>();
  private readonly roadwayFlags = new Map<SectionId, number>();
  private currentVersion = 0;

  /** Changes whenever what any part shows might have. */
  get version(): number {
    return this.currentVersion;
  }

  /** Puts exactly these junctions in `state`: it comes off every other. */
  setJunctionsInState(state: SetPartState, nodes: Iterable<NodeId>): void {
    this.changed(this.updateAll(this.junctionFlags, state, new Set(nodes)));
  }

  /** Puts exactly these roadways in `state`: it comes off every other. */
  setRoadwaysInState(state: SetPartState, sections: Iterable<SectionId>): void {
    this.changed(this.updateAll(this.roadwayFlags, state, new Set(sections)));
  }

  /** Takes every state off every part. */
  reset(): void {
    if (this.junctionFlags.size === 0 && this.roadwayFlags.size === 0) return;
    this.junctionFlags.clear();
    this.roadwayFlags.clear();
    this.currentVersion++;
  }

  /** Every junction in a state, with the one it shows. */
  *junctions(): IterableIterator<[NodeId, SetPartState]> {
    for (const [node, flags] of this.junctionFlags) {
      yield [node, highest(flags)];
    }
  }

  /** Every roadway in a state, with the one it shows. */
  *roadways(): IterableIterator<[SectionId, SetPartState]> {
    for (const [section, flags] of this.roadwayFlags) {
      yield [section, highest(flags)];
    }
  }

  /** Counts one change, if there was one. */
  private changed(changed: boolean): void {
    if (changed) this.currentVersion++;
  }

  /**
   * Turns one state of a part on or off, and says whether that changed it.
   * A part left in no state is dropped, so only parts in one are held.
   */
  private update<Id>(
    flags: Map<Id, number>,
    id: Id,
    state: SetPartState,
    on: boolean,
  ): boolean {
    const held = flags.get(id) ?? 0;
    const bit = 1 << state;
    const changed = on ? held | bit : held & ~bit;
    if (changed === held) return false;

    if (changed === 0) {
      flags.delete(id);
    } else {
      flags.set(id, changed);
    }
    return true;
  }

  /**
   * Puts exactly `ids` in `state`, and says whether that changed any part:
   * off every part held that isn't one of them, on each of them.
   */
  private updateAll<Id>(
    flags: Map<Id, number>,
    state: SetPartState,
    ids: ReadonlySet<Id>,
  ): boolean {
    let changed = false;
    // Copied: `update` drops the parts it leaves in no state.
    for (const id of [...flags.keys()]) {
      if (!ids.has(id)) {
        if (this.update(flags, id, state, false)) changed = true;
      }
    }
    for (const id of ids) {
      if (this.update(flags, id, state, true)) changed = true;
    }
    return changed;
  }
}

/** The highest state set in `flags`, which is never empty: its top bit. */
function highest(flags: number): SetPartState {
  return (31 - Math.clz32(flags)) as SetPartState;
}
