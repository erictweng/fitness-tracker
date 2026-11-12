import { describe, expect, it } from "vitest";
import { cmToFtIn, fromDisplayWeight, ftInToCm, toDisplayWeight } from "./units";

describe("units", () => {
  it("lb round trip", () => {
    expect(toDisplayWeight(fromDisplayWeight(180, "lb"), "lb")).toBe(180);
  });
  it("kg passes through", () => {
    expect(toDisplayWeight(80, "kg")).toBe(80);
  });
  it("height", () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8);
    expect(cmToFtIn(177.8)).toEqual({ ft: 5, in: 10 });
  });
});
