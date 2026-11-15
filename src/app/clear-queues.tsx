"use client";

import { useEffect } from "react";
import { clearAllQueues } from "@/lib/offline-queue";

/** Shown after an account is deleted: nothing of it should stay on this phone. */
export function ClearQueues() {
  useEffect(() => { clearAllQueues(); }, []);
  return null;
}
