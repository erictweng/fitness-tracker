"use client";

import { useActionState } from "react";
import { inviteAction, type ActionResult } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(inviteAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="text-sm text-muted" htmlFor="invite-email">Invite by email</label>
      <input
        id="invite-email"
        name="email"
        type="email"
        required
        autoComplete="off"
        placeholder="friend@gmail.com"
        className="input"
      />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Invite"}
      </button>
      {state && (
        <p role="status" className={state.ok ? "text-accent" : "text-warn"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
