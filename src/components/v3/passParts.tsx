"use client";

import { fmtTime, fromDateStr } from "@/lib/dates";
import type { PassDraft } from "@/lib/outpass";
import type { PassStatus } from "@/lib/v3/store";
import { cx } from "../ui";

const day = (s: string) => fromDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** "Fri, 28 Nov · 3:00 pm → 7:00 pm", or "6 Dec, 10:00 am → 9 Dec, 6:00 pm" for a leave. */
export function passDay(p: Pick<PassDraft, "kind" | "fromDate" | "fromTime" | "toDate" | "toTime">): string {
  if (p.kind === "dayout" || p.fromDate === p.toDate) return `${day(p.fromDate)} · ${fmtTime(p.fromTime)} → ${fmtTime(p.toTime)}`;
  return `${day(p.fromDate)}, ${fmtTime(p.fromTime)} → ${day(p.toDate)}, ${fmtTime(p.toTime)}`;
}

export const STATUS_LABEL: Record<PassStatus, string> = {
  saved: "Not applied yet",
  applied: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<PassStatus, string> = {
  saved: "bg-warn-soft text-warn",
  applied: "bg-warn-soft text-warn",
  approved: "bg-safe-soft text-safe",
  rejected: "bg-danger-soft text-danger",
  cancelled: "bg-danger-soft text-danger",
};

export function PassStatusChip({ status, className }: { status: PassStatus; className?: string }) {
  return (
    <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap", STATUS_TONE[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}
