import { describe, expect, it } from "vitest";
import { junctionPairs, spreadPairs, type Turn } from "./lanePairs";

describe("spreadPairs", () => {
  it("pairs equal counts lane for lane", () => {
    expect(spreadPairs(2, 2)).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("merges 3 into 2, the middle lane toward the curb", () => {
    expect(spreadPairs(3, 2)).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
    ]);
  });

  it("splits 2 into 3 as the mirror of the merge", () => {
    expect(spreadPairs(2, 3)).toEqual([
      [1, 1],
      [2, 2],
      [2, 3],
    ]);
  });

  it("gives each narrower lane an equal share where it divides evenly", () => {
    expect(spreadPairs(4, 2)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
    ]);
  });

  it("merges every lane into a single one", () => {
    expect(spreadPairs(3, 1)).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
  });

  it("sends a middle on a border toward the curb", () => {
    // Lane 3's middle, 2.5/5 across, is the border between the two.
    expect(spreadPairs(5, 2)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
      [5, 2],
    ]);
  });
});

const left = (lanes: number): Turn => ({ kind: "left", lanes });
const straight = (lanes: number): Turn => ({ kind: "straight", lanes });
const right = (lanes: number): Turn => ({ kind: "right", lanes });

describe("junctionPairs", () => {
  it("gives every turn the full width where its road is as wide as A", () => {
    const laneForLane = [
      [1, 1],
      [2, 2],
    ];
    expect(junctionPairs(2, [left(2), straight(2), right(2)])).toEqual([
      laneForLane,
      laneForLane,
      laneForLane,
    ]);
  });

  it("turns left from the left lanes, right from the right, straight on between", () => {
    // Straight on: 2 of 3 lanes, no middle → one lane toward the curb.
    expect(junctionPairs(3, [left(1), straight(2), right(1)])).toEqual([
      [[1, 1]],
      [
        [2, 1],
        [3, 2],
      ],
      [[3, 1]],
    ]);
  });

  it("goes straight on from the side with no turn", () => {
    expect(junctionPairs(3, [straight(2), right(2)])).toEqual([
      [
        [1, 1],
        [2, 2],
      ],
      [
        [2, 1],
        [3, 2],
      ],
    ]);
    expect(junctionPairs(3, [left(2), straight(2)])).toEqual([
      [
        [1, 1],
        [2, 2],
      ],
      [
        [2, 1],
        [3, 2],
      ],
    ]);
  });

  it("sizes a group by its widest road, a narrower one on the turn side", () => {
    expect(junctionPairs(3, [left(1), left(2), right(2), right(1)])).toEqual([
      [[1, 1]],
      [
        [1, 1],
        [2, 2],
      ],
      [
        [2, 1],
        [3, 2],
      ],
      [[3, 1]],
    ]);
  });

  it("splits A's lanes over a wider road", () => {
    const split = [
      [1, 1],
      [1, 2],
    ];
    expect(junctionPairs(1, [left(2), right(2)])).toEqual([split, split]);
  });

  it("gives a single-lane straight on the lane toward the curb", () => {
    expect(junctionPairs(2, [left(1), straight(1), right(1)])).toEqual([
      [[1, 1]],
      [[2, 1]],
      [[2, 1]],
    ]);
  });

  it("gives a lane in no window its nearest neighbor's turns, toward the curb on a tie", () => {
    // The 3-lane stem of a T into 1-lane arms: lane 2 between the two.
    expect(junctionPairs(3, [left(1), right(1)])).toEqual([
      [[1, 1]],
      [
        [2, 1],
        [3, 1],
      ],
    ]);
  });

  it("gives every lane past the only window that window's turns", () => {
    // A Y, both branches to the left.
    const merged = [
      [1, 1],
      [2, 1],
      [3, 1],
    ];
    expect(junctionPairs(3, [left(1), left(1)])).toEqual([merged, merged]);
  });
});
