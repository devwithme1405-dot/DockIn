"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { BadgeCheck, ChevronRight, DoorOpen, House, Sun } from "lucide-react";
import { toDateStr } from "@/lib/dates";
import { usePreview } from "@/lib/v3/flags";
import { verifyPass } from "@/lib/v3/pass";
import { v3db } from "@/lib/v3/store";
import { openOutpass } from "@/lib/v3/ui";
import { cx } from "../ui";
import { passDay, PassStatusChip } from "./passParts";

/**
 * Today's way into Outpass (preview build only): the pass that's live right
 * now if there is one, and one tap to start a day out or a leave.
 */
export function OutpassEntry({ className }: { className?: string }) {
  const on = usePreview();
  const today = toDateStr();
  const live = useLiveQuery(
    () =>
      v3db.passes
        .orderBy("createdAt")
        .reverse()
        .filter((p) => p.toDate >= today && p.status !== "cancelled" && p.status !== "rejected")
        .first(),
    [today],
  );
  if (!on) return null;
  return (
    <section className={cx("px-5", className)} aria-label="Outpass">
      <div className="pass-ticket op-entry overflow-hidden rounded-3xl border-[1.5px] border-card-edge bg-card shadow-[0_3px_0_var(--pbtn-lip)]">
        <button
          type="button"
          onClick={() => (live ? openOutpass("history", undefined, live.id) : openOutpass("new"))}
          className="flex w-full items-center gap-3 px-4 pt-3.5 pb-3 text-left transition active:scale-[0.99]"
        >
          <span className="op-door grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <DoorOpen size={23} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-display block text-[17px] leading-tight font-extrabold">Outpass</span>
            {live ? (
              <span className="mt-0.5 block">
                <span className="block truncate text-[12.5px] text-muted">
                  {live.kind === "dayout" ? "Day out" : "Leave"} · {passDay(live)}
                </span>
                {live.camu && verifyPass(live, live.camu).every((c) => c.ok) && (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-bold text-safe">
                    <BadgeCheck size={14} /> Checked in MyCamu
                  </span>
                )}
              </span>
            ) : (
              <span className="block text-[12.5px] text-muted">Type “kal 4 baje market” — done in seconds</span>
            )}
          </span>
          {live ? <PassStatusChip status={live.status} /> : <ChevronRight size={20} className="shrink-0 text-muted" />}
        </button>
        <div className="mx-4 border-t-2 border-dashed border-line" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <button
            type="button"
            onClick={() => openOutpass("new", undefined, undefined, "dayout")}
            className="btn-paper lip-sm inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold"
          >
            <Sun size={16} className="text-warn" /> Day out
          </button>
          <button
            type="button"
            onClick={() => openOutpass("new", undefined, undefined, "leave")}
            className="btn-paper lip-sm inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold"
          >
            <House size={16} className="text-accent" /> Leave
          </button>
        </div>
      </div>
    </section>
  );
}
