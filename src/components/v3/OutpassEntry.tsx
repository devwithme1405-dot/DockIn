"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, DoorOpen, House, Sun } from "lucide-react";
import { fmtTime, fromDateStr, toDateStr } from "@/lib/dates";
import { isNativeApp } from "@/lib/native";
import { usePreview } from "@/lib/v3/flags";
import { ensureCamuLoginId } from "@/lib/college";
import { useFlags } from "@/lib/telemetry";
import { fetchHistory, liveCamu, useCamuHistory, type CamuPass } from "@/lib/v3/pass";
import { v3db } from "@/lib/v3/store";
import { openOutpass } from "@/lib/v3/ui";
import { openWebCamu, WebCamu } from "@/components/camu/WebCamu";
import { cx } from "../ui";
import { CamuChip } from "./CamuPasses";

const day = (s: string) => fromDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/**
 * Today's way into Outpass (preview build only). It doesn't start a pass here —
 * it opens the Outpass page. A pass that counts right now (or later) is shown
 * with a light running round its edge, so it's found at a glance at the gate.
 */
export function OutpassEntry({ className }: { className?: string }) {
  const flags = useFlags();
  const native = isNativeApp();
  const on = usePreview() && flags.outpass;
  // On the web / iPhone there's no native plugin — MyCamu goes through DockIn's
  // server instead, so the same outpass + attendance work in a browser.
  const web = !native && flags.outpass;
  const today = toDateStr();
  const camu = useCamuHistory();
  // DockIn's own copies, for phones that haven't read MyCamu yet.
  const local = useLiveQuery(
    () =>
      v3db.passes
        .orderBy("createdAt")
        .reverse()
        .filter((p) => p.toDate >= today && (p.status === "applied" || p.status === "approved"))
        .first(),
    [today],
  );

  // Keep the list fresh while Today is open (quietly; the card updates by itself).
  useEffect(() => {
    if (!on || !isNativeApp()) return;
    void fetchHistory().catch(() => {});
    void ensureCamuLoginId();
  }, [on]);

  if (web) {
    return (
      <section className={cx("px-5", className)} aria-label="MyCamu">
        <button
          type="button"
          onClick={openWebCamu}
          className="op-entry block w-full overflow-hidden rounded-3xl border-[1.5px] border-card-edge bg-card text-left shadow-[0_3px_0_var(--pbtn-lip)] transition active:scale-[0.99]"
        >
          <span className="flex items-center gap-3 px-4 py-3.5">
            <span className="op-door grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <DoorOpen size={23} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display block text-[17px] leading-tight font-extrabold">MyCamu</span>
              <span className="block text-[12.5px] text-muted">Outpass, approve & attendance — right here</span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-muted" />
          </span>
        </button>
        <WebCamu />
      </section>
    );
  }

  if (!on) return null;
  const live: CamuPass | null = camu ? (liveCamu(camu.items, today).sort((a, b) => (a.fromDate + a.fromTime).localeCompare(b.fromDate + b.fromTime))[0] ?? null) : null;
  const pass =
    live ??
    (local
      ? ({
          id: local.id,
          kind: local.kind,
          type: local.kind === "dayout" ? "Day Out Pass" : "Leave Out Pass",
          fromDate: local.fromDate,
          fromTime: local.fromTime,
          toDate: local.toDate,
          toTime: local.toTime,
          reason: local.reason,
          state: local.status === "approved" ? "approved" : "applied",
          parent: local.status === "approved" ? "approved" : "pending",
          files: 0,
        } satisfies CamuPass)
      : null);
  const now = new Date();
  const wall = `${today}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const running = !!pass && `${pass.fromDate}T${pass.fromTime || "00:00"}` <= wall && wall < `${pass.toDate}T${pass.toTime || "23:59"}`;

  return (
    <section className={cx("px-5", className)} aria-label="Outpass">
      <button
        type="button"
        onClick={() => openOutpass(pass ? "history" : "new")}
        className="op-entry block w-full overflow-hidden rounded-3xl border-[1.5px] border-card-edge bg-card text-left shadow-[0_3px_0_var(--pbtn-lip)] transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-3 px-4 py-3.5">
          <span className="op-door grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <DoorOpen size={23} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-display block text-[17px] leading-tight font-extrabold">Outpass</span>
            <span className="block text-[12.5px] text-muted">Day out & leave — make, check and cancel</span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-muted" />
        </span>

        {pass && (
          <span className="block px-3 pb-3">
            <span className={cx("live-ring block rounded-2xl", running && "live-ring-on")}>
              <span className="flex items-center gap-3 rounded-[14px] bg-surface px-3 py-2.5">
                <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", pass.kind === "dayout" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>
                  {pass.kind === "dayout" ? <Sun size={17} /> : <House size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cx("size-2 shrink-0 rounded-full", running ? "live-dot bg-safe" : "bg-warn")} />
                    <span className="text-[11px] font-extrabold tracking-[0.08em] text-muted uppercase">{running ? "Live now" : "Upcoming"}</span>
                  </span>
                  <span className="block truncate text-[13.5px] font-bold">
                    {pass.type} · {day(pass.fromDate)}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {pass.fromTime ? fmtTime(pass.fromTime) : ""}
                    {pass.toDate !== pass.fromDate ? ` → ${day(pass.toDate)} ` : " → "}
                    {pass.toTime ? fmtTime(pass.toTime) : ""}
                  </span>
                </span>
                <CamuChip state={pass.state} />
              </span>
            </span>
          </span>
        )}
      </button>
    </section>
  );
}
