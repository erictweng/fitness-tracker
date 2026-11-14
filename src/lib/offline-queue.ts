"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { addEntry } from "@/app/entries/actions";
import { logFood, logMeal } from "@/app/foods/actions";

/**
 * Offline logging (spec: "No signal"). New entries made without a connection are kept
 * on the phone and sent when it's back. Every queued item carries the client-generated
 * entry id(s), and the server upserts by id, so a retry never creates a duplicate.
 *
 * Stored in localStorage, keyed by user id, so a queue never syncs into another account.
 * Only *new* logs are queued; edits and deletes need a connection.
 */
export type QueueKind = "entry" | "food" | "meal";
export type Pending = {
  key: string;
  kind: QueueKind;
  fields: Record<string, string>;
  preview: { name: string; kcal: number; meal: string; log_date: string };
  queuedAt: string;
  failed?: string;
};
type Result = { ok: true } | { ok: false; errors?: Record<string, string>; message?: string };

const EVENT = "ft-queue";
const storageKey = (userId: string) => `ft-queue-v1:${userId}`;
const ACTIONS: Record<QueueKind, (fd: FormData) => Promise<Result>> = { entry: addEntry, food: logFood, meal: logMeal };

function readRaw(userId: string): string {
  try {
    return localStorage.getItem(storageKey(userId)) ?? "[]";
  } catch {
    return "[]";
  }
}

export function readQueue(userId: string): Pending[] {
  try {
    const v = JSON.parse(readRaw(userId));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, q: Pending[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(q));
  window.dispatchEvent(new Event(EVENT));
}

function toFormData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function enqueue(userId: string, item: Pending) {
  const q = readQueue(userId).filter((p) => p.key !== item.key);
  writeQueue(userId, [...q, item]);
}

export type SubmitOutcome = { status: "saved" } | { status: "queued" } | { status: "error"; result: Result & { ok: false } };

/** Send a new log now, or keep it on the phone if there's no connection. */
export async function submitOrQueue(
  userId: string,
  kind: QueueKind,
  fd: FormData,
  preview: Pending["preview"],
): Promise<SubmitOutcome> {
  const fields: Record<string, string> = {};
  fd.forEach((v, k) => { fields[k] = String(v); });
  const item: Pending = { key: fields.id || fields.ids, kind, fields, preview, queuedAt: new Date().toISOString() };
  if (!navigator.onLine) {
    enqueue(userId, item);
    return { status: "queued" };
  }
  try {
    const r = await ACTIONS[kind](fd);
    return r.ok ? { status: "saved" } : { status: "error", result: r };
  } catch {
    // The request never got an answer (dropped signal): keep it and retry later.
    enqueue(userId, item);
    return { status: "queued" };
  }
}

let flushing = false;

/** Send queued items in order. Returns how many were saved. Stops at the first network failure. */
export async function flushQueue(userId: string): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let saved = 0;
  try {
    for (const item of readQueue(userId)) {
      if (item.failed) continue;
      let r: Result;
      try {
        r = await ACTIONS[item.kind](toFormData(item.fields));
      } catch {
        break; // still offline
      }
      const q = readQueue(userId);
      if (r.ok) {
        saved += 1;
        writeQueue(userId, q.filter((p) => p.key !== item.key));
      } else if (r.errors && Object.keys(r.errors).length) {
        // The server rejected it (e.g. a deleted food): keep it visible so it isn't lost silently.
        const why = Object.values(r.errors)[0];
        writeQueue(userId, q.map((p) => (p.key === item.key ? { ...p, failed: why } : p)));
      } else if (r.message && /gone|no foods|bad request/i.test(r.message)) {
        writeQueue(userId, q.map((p) => (p.key === item.key ? { ...p, failed: r.message } : p)));
      } else {
        break; // server hiccup: try again later
      }
    }
  } finally {
    flushing = false;
  }
  return saved;
}

export function discardPending(userId: string, key: string) {
  writeQueue(userId, readQueue(userId).filter((p) => p.key !== key));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Live view of this user's queue; syncs on load, when the phone comes back online, and every 30 s. */
export function useOfflineQueue(userId: string): Pending[] {
  const raw = useSyncExternalStore(subscribe, () => readRaw(userId), () => "[]");
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const n = await flushQueue(userId);
      if (n > 0 && alive) router.refresh();
    };
    void run();
    window.addEventListener("online", run);
    const t = setInterval(run, 30_000);
    return () => {
      alive = false;
      window.removeEventListener("online", run);
      clearInterval(t);
    };
  }, [userId, router]);
  return useMemo(() => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as Pending[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
}
