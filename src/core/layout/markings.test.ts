import { describe, expect, it } from "vitest";
import { dashPeriodOf } from "./markings";

describe("dashPeriodOf", () => {
  it("keeps the period when it fits exactly", () => {
    expect(dashPeriodOf(30)).toBe(2);
  });

  it("squeezes the period when rounding adds one", () => {
    // 31 / 2 = 15.5 → 16 periods
    expect(dashPeriodOf(31)).toBeCloseTo(1.9375);
  });

  it("stretches the period when rounding drops one", () => {
    // 30.9 / 2 = 15.45 → 15 periods
    expect(dashPeriodOf(30.9)).toBeCloseTo(2.06);
  });

  it("gives the shortest roadway with a dash one period", () => {
    expect(dashPeriodOf(1)).toBe(1);
  });

  it("gives no dashes to a roadway too short for one", () => {
    expect(dashPeriodOf(0.99)).toBeNull();
    expect(dashPeriodOf(0)).toBeNull();
    expect(dashPeriodOf(-5)).toBeNull();
  });

  it("fits a whole number of periods into the length", () => {
    for (const length of [1.7, 12.3, 30, 47.25, 100.9]) {
      const period = dashPeriodOf(length)!;
      const n = length / period;
      expect(n).toBeCloseTo(Math.round(n));
    }
  });
});
