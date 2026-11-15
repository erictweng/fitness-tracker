import { describe, expect, it } from "vitest";
import { averageBurn, cyclesToDays, kjToKcal, netKcal, workoutToImport, type DayRow } from "./whoop";

const LA = { timezone: "America/Los_Angeles", day_end_hour: 3 };

describe("kjToKcal", () => {
  it("divides by 4.184", () => {
    expect(kjToKcal(10460)).toBe(2500);
  });
});

describe("cyclesToDays", () => {
  it("puts a cycle on the app day its start falls on (user's timezone)", () => {
    // 2026-11-20 07:00 in LA = 15:00Z
    const d = cyclesToDays(
      [{ id: 1, start: "2026-11-20T15:00:00Z", end: "2026-11-21T07:00:00Z", score_state: "SCORED", score: { kilojoule: 10460 } }],
      LA,
      "2026-11-01",
    );
    expect(d).toEqual([{ log_date: "2026-11-20", kcal: 2500, in_progress: false }]);
  });
  it("a cycle starting at 1:30 AM belongs to the previous day (3 AM day end)", () => {
    const d = cyclesToDays([{ id: 1, start: "2026-11-21T09:30:00Z", end: null, score_state: "SCORED", score: { kilojoule: 4184 } }], LA, "2026-11-01");
    expect(d[0].log_date).toBe("2026-11-20");
  });
  it("marks the open cycle in progress and unscored days unknown (not 0)", () => {
    const d = cyclesToDays(
      [
        { id: 1, start: "2026-11-19T15:00:00Z", end: "2026-11-20T07:00:00Z", score_state: "PENDING_SCORE", score: null },
        { id: 2, start: "2026-11-20T15:00:00Z", end: null, score_state: "SCORED", score: { kilojoule: 4184 } },
      ],
      LA,
      "2026-11-01",
    );
    expect(d).toEqual([
      { log_date: "2026-11-19", kcal: null, in_progress: false },
      { log_date: "2026-11-20", kcal: 1000, in_progress: true },
    ]);
  });
  it("adds two cycles on the same day and drops days before fromDate", () => {
    const d = cyclesToDays(
      [
        { id: 1, start: "2026-11-18T15:00:00Z", end: "2026-11-19T07:00:00Z", score_state: "SCORED", score: { kilojoule: 4184 } },
        { id: 2, start: "2026-11-19T15:00:00Z", end: "2026-11-19T20:00:00Z", score_state: "SCORED", score: { kilojoule: 4184 } },
        { id: 3, start: "2026-11-19T21:00:00Z", end: "2026-11-20T07:00:00Z", score_state: "SCORED", score: { kilojoule: 8368 } },
      ],
      LA,
      "2026-11-19",
    );
    expect(d).toEqual([{ log_date: "2026-11-19", kcal: 3000, in_progress: false }]);
  });
});

describe("workoutToImport", () => {
  it("maps a scored workout", () => {
    expect(
      workoutToImport(
        { id: "abc", start: "2026-11-20T16:00:00Z", end: "2026-11-20T16:45:20Z", sport_name: "functional-fitness", score_state: "SCORED", score: { kilojoule: 1255.2, strain: 9.06 } },
        LA,
      ),
    ).toEqual({ external_id: "abc", log_date: "2026-11-20", type: "Functional fitness", minutes: 45, kcal: 300, notes: "Strain 9.1" });
  });
  it("keeps unscored kcal unknown and clamps minutes", () => {
    const w = workoutToImport({ id: "x", start: "2026-11-20T16:00:00Z", end: "2026-11-20T16:00:10Z", sport_name: "running", score_state: "PENDING_SCORE" }, LA);
    expect(w.kcal).toBeNull();
    expect(w.minutes).toBe(1);
    expect(w.notes).toBeNull();
  });
});

describe("averageBurn", () => {
  const day = (log_date: string, kcal: number | null, in_progress = false): DayRow => ({ log_date, kcal, in_progress });
  const today = "2026-11-30";
  it("needs 7 finished, scored days in the 14 before today", () => {
    const six = Array.from({ length: 6 }, (_, i) => day(`2026-11-2${i}`, 2500));
    expect(averageBurn(six, today)).toBeNull();
    expect(averageBurn([...six, day("2026-11-27", 2600)], today)).toEqual({ kcal: 2514, days: 7 });
  });
  it("ignores today, in-progress, unknown and out-of-window days", () => {
    const base = Array.from({ length: 7 }, (_, i) => day(`2026-11-2${i}`, 2000));
    const noise = [day(today, 900, true), day("2026-11-29", null), day("2026-11-28", 5000, true), day("2026-11-15", 9000)];
    expect(averageBurn([...base, ...noise], today)).toEqual({ kcal: 2000, days: 7 });
  });
});

describe("netKcal", () => {
  it("eaten minus burned, unknown when burn is", () => {
    expect(netKcal(1800, 2500)).toBe(-700);
    expect(netKcal(1800, null)).toBeNull();
  });
});
