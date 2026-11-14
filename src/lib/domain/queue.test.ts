import { describe, expect, it } from "vitest";
import { applyStep, classify, MAX_ATTEMPTS, resetItem } from "./queue";

describe("classify", () => {
  it("saved / field errors / big entries / gone foods are final", () => {
    expect(classify({ ok: true })).toEqual({ kind: "saved" });
    expect(classify({ ok: false, errors: { kcal: "Too high" } })).toEqual({ kind: "failed", why: "Too high" });
    expect(classify({ ok: false, needsConfirm: true }).kind).toBe("failed");
    expect(classify({ ok: false, message: "That food is gone." }).kind).toBe("failed");
  });
  it("anything else is retried", () => {
    expect(classify({ ok: false, message: "Couldn't save. Try again." })).toEqual({ kind: "retry", why: "Couldn't save. Try again." });
    expect(classify({ ok: false })).toEqual({ kind: "retry", why: "server error" });
  });
});

describe("applyStep", () => {
  const q = [{ key: "a" }, { key: "b" }];
  it("removes saved items and marks failed ones", () => {
    expect(applyStep(q, "a", { kind: "saved" })).toEqual([{ key: "b" }]);
    expect(applyStep(q, "b", { kind: "failed", why: "x" })).toEqual([{ key: "a" }, { key: "b", failed: "x" }]);
  });
  it("counts retries and gives up after MAX_ATTEMPTS so the queue can't stall forever", () => {
    let cur: { key: string; failed?: string; attempts?: number }[] = q;
    for (let i = 1; i < MAX_ATTEMPTS; i++) cur = applyStep(cur, "a", { kind: "retry", why: "boom" });
    expect(cur[0]).toEqual({ key: "a", attempts: MAX_ATTEMPTS - 1 });
    cur = applyStep(cur, "a", { kind: "retry", why: "boom" });
    expect(cur[0]).toEqual({ key: "a", attempts: MAX_ATTEMPTS, failed: "kept failing (boom)" });
    expect(cur[1]).toEqual({ key: "b" });
    expect(resetItem(cur, "a")[0]).toEqual({ key: "a", attempts: 0, failed: undefined });
  });
});
