"use client";

import { clearQueue, readQueue } from "@/lib/offline-queue";

/** Signing out forgets entries still waiting on this phone; warn first if there are any. */
export function SignOutButton({ userId }: { userId: string }) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const n = readQueue(userId).length;
    if (n > 0 && !window.confirm(`${n} ${n === 1 ? "entry hasn't" : "entries haven't"} synced yet. Sign out anyway and discard ${n === 1 ? "it" : "them"}?`)) {
      e.preventDefault();
      return;
    }
    clearQueue(userId);
  }
  return (
    <form action="/auth/signout" method="post" onSubmit={onSubmit}>
      <button className="btn btn-ghost w-full" type="submit">Sign out</button>
    </form>
  );
}
