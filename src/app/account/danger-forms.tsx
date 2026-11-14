"use client";

import { useActionState, useState } from "react";
import { deleteAccount, removeUser, type DangerState } from "./actions";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<DangerState, FormData>(deleteAccount, null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost w-full text-danger" onClick={() => setOpen(true)}>
        Delete account…
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="delete-account">
      <p className="text-sm">
        This deletes your login and everything you&apos;ve logged, right now. It can&apos;t be undone. Export first if you want a copy.
        Encrypted backups still hold your data until they age out (up to 30 days).
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Type delete to confirm</span>
        <input name="confirm" className="input" autoComplete="off" aria-label="Type delete to confirm" />
      </label>
      {state?.message && <p role="alert" className="text-sm text-warn">{state.message}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn flex-1 bg-danger!" disabled={pending}>{pending ? "Deleting…" : "Delete forever"}</button>
      </div>
    </form>
  );
}

export function RemoveUserForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<DangerState, FormData>(removeUser, null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="self-start text-sm text-danger" onClick={() => setOpen(true)} aria-label={`Remove ${email}`}>
        Remove
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="remove-user">
      <input type="hidden" name="email" value={email} />
      <p className="text-sm">Deletes {email}&apos;s account and all their data now, and revokes their invite.</p>
      <input name="confirm" className="input" placeholder={email} aria-label="Type their email to confirm" autoComplete="off" />
      {state?.message && <p role="alert" className={`text-sm ${state.ok ? "text-accent" : "text-warn"}`}>{state.message}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn flex-1 bg-danger!" disabled={pending}>Remove</button>
      </div>
    </form>
  );
}
