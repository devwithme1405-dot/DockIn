"use client";

import { usePreview } from "@/lib/v3/flags";
import { Outpass } from "./Outpass";

/**
 * DockIn 3 on the preview build only. The assistant (DockBot chat) is parked
 * for now; the Outpass screen opens from Today and Profile.
 */
export function V3Host() {
  const on = usePreview();
  if (!on) return null;
  return <Outpass />;
}
