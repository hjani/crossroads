import { describe, expect, it } from "vitest";
import { DASH_PERIOD_METERS, fittedPeriodOf } from "./markings";

function dashPeriodOf(lengthMeters: number): number | null {
  return fittedPeriodOf(lengthMeters, DASH_PERIOD_METERS);
}

describe("fittedPeriodOf", () => {
  it("keeps the period when it fits exactly", () => {
    expect(dashPeriodOf(27)).toBe(4.5);
  });

  it("squeezes the period when rounding adds one", () => {
    // 29.5 / 4.5 ≈ 6.56 → 7 periods
    expect(dashPeriodOf(29.5)).toBeCloseTo(29.5 / 7);
  });

  it("stretches the period when rounding drops one", () => {
    // 29 / 4.5 ≈ 6.44 → 6 periods
    expect(dashPeriodOf(29)).toBeCloseTo(29 / 6);
  });

  it("gives the shortest stretch with a mark one period", () => {
    expect(dashPeriodOf(2.25)).toBe(2.25);
  });

  it("gives no marks to a stretch too short for one", () => {
    expect(dashPeriodOf(2.2)).toBeNull();
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
