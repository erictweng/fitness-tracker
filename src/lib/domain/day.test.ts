import { describe, expect, it } from "vitest";
import { addDays, ageOn, isIsoDate, logDateFor, mealFor } from "./day";

const LA = "America/Los_Angeles";
// 2026-11-12 01:30 PST = 09:30 UTC
const at = (iso: string) => new Date(iso);

describe("logDateFor", () => {
  it("puts 1:30 AM on the previous day with a 3 AM day end", () => {
    expect(logDateFor(at("2026-11-12T09:30:00Z"), LA, 3)).toBe("2026-11-11");
  });
  it("keeps 1:30 AM on the same day with a midnight day end", () => {
    expect(logDateFor(at("2026-11-12T09:30:00Z"), LA, 0)).toBe("2026-11-12");
  });
  it("3:00 AM sharp starts the new day", () => {
    expect(logDateFor(at("2026-11-12T11:00:00Z"), LA, 3)).toBe("2026-11-12");
  });
  it("uses the given timezone, not UTC", () => {
    // 2026-11-12 20:00 PST is already the 13th in UTC
    expect(logDateFor(at("2026-11-13T04:00:00Z"), LA, 3)).toBe("2026-11-12");
    expect(logDateFor(at("2026-11-13T04:00:00Z"), "Asia/Tokyo", 3)).toBe("2026-11-13");
  });
  it("crosses month and year boundaries", () => {
    expect(logDateFor(at("2027-01-01T09:30:00Z"), LA, 3)).toBe("2026-12-31");
  });
  it("handles the DST change night (2026-11-01, 1:30 AM happens twice)", () => {
    expect(logDateFor(at("2026-11-01T08:30:00Z"), LA, 3)).toBe("2026-10-31"); // 1:30 PDT
    expect(logDateFor(at("2026-11-01T09:30:00Z"), LA, 3)).toBe("2026-10-31"); // 1:30 PST
  });
});

describe("mealFor", () => {
  it.each([
    ["2026-11-12T15:00:00Z", "breakfast"], // 7 AM
    ["2026-11-12T20:00:00Z", "lunch"], // noon
    ["2026-11-13T02:00:00Z", "dinner"], // 6 PM
    ["2026-11-13T06:00:00Z", "snack"], // 10 PM
    ["2026-11-12T09:30:00Z", "snack"], // 1:30 AM, before day end
  ])("%s -> %s", (iso, meal) => {
    expect(mealFor(at(iso), LA, 3)).toBe(meal);
  });
  it("1:30 AM is breakfast when the day ends at midnight", () => {
    expect(mealFor(at("2026-11-12T09:30:00Z"), LA, 0)).toBe("breakfast");
  });
});

describe("date helpers", () => {
  it("addDays", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("isIsoDate rejects impossible dates", () => {
    expect(isIsoDate("2026-11-12")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-1-2")).toBe(false);
    expect(isIsoDate("<x>")).toBe(false);
  });
  it("ageOn counts birthdays", () => {
    expect(ageOn("2000-11-12", "2026-11-11")).toBe(25);
    expect(ageOn("2000-11-12", "2026-11-12")).toBe(26);
  });
});
