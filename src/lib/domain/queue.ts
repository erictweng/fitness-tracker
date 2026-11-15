/** Pure rules for the offline queue (unit-tested); the browser glue is in lib/offline-queue.ts. */
export type SendResult = { ok: true } | { ok: false; errors?: Record<string, string>; message?: string; needsConfirm?: boolean };
export type Step = { kind: "saved" } | { kind: "failed"; why: string } | { kind: "retry"; why: string };

/** After this many "try again later" answers for one item, show it as failed instead of retrying forever. */
export const MAX_ATTEMPTS = 10;

export function classify(r: SendResult): Step {
  if (r.ok) return { kind: "saved" };
  if (r.errors && Object.keys(r.errors).length) return { kind: "failed", why: Object.values(r.errors)[0] };
  if (r.needsConfirm) return { kind: "failed", why: "over 5,000 kcal needs a confirm. Discard it and log it again." };
  if (r.message && /gone|no foods|bad request/i.test(r.message)) return { kind: "failed", why: r.message };
  return { kind: "retry", why: r.message ?? "server error" };
}

type Item = { key: string; failed?: string; attempts?: number };

/** New queue after one item's answer. A retry never blocks the items behind it. */
export function applyStep<T extends Item>(q: T[], key: string, step: Step): T[] {
  if (step.kind === "saved") return q.filter((p) => p.key !== key);
  return q.map((p) => {
    if (p.key !== key) return p;
    if (step.kind === "failed") return { ...p, failed: step.why };
    const attempts = (p.attempts ?? 0) + 1;
    return attempts >= MAX_ATTEMPTS ? { ...p, attempts, failed: `kept failing (${step.why})` } : { ...p, attempts };
  });
}

/** Retry button: put a failed item back in line. */
export function resetItem<T extends Item>(q: T[], key: string): T[] {
  return q.map((p) => (p.key === key ? { ...p, failed: undefined, attempts: 0 } : p));
}
