"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { autoSyncWhoop } from "../whoop/actions";

/** Renders nothing. When Today opens, pulls fresh WHOOP numbers if the last sync is stale. */
export function WhoopAutoSync() {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    autoSyncWhoop()
      .then((r) => { if (live && r === "synced") router.refresh(); })
      .catch(() => {});
    return () => { live = false; };
  }, [router]);
  return null;
}
