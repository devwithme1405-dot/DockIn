"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { describe, fmtPct } from "@/lib/attendance";
import { fmtDay, fmtTime } from "@/lib/dates";
import type { CamuState } from "@/lib/native";
import type { AttendanceSummary, Subject } from "@/lib/types";
import { ProgressBar, STATE_TEXT, Sheet, cx } from "./ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Every class of one subject, as Camu recorded it: the list Camu's own
 * attendance page hides two menus deep, newest first and grouped by month.
 */
export function CamuHistorySheet({
  camu,
  stat,
  target,
  onClose,
}: {
  camu: CamuState;
  stat: { subject: Subject; summary: AttendanceSummary } | null;
  target: number;
  onClose: () => void;
}) {
  const camuId = stat?.subject.id.replace(/^camu:/, "") ?? "";
  const groups = useMemo(() => {
    const list = [...(camu.history?.[camuId] ?? [])].sort((a, b) =>
      a.date === b.date ? b.from.localeCompare(a.from) : b.date.localeCompare(a.date),
    );
    const out: { month: string; items: typeof list }[] = [];
    for (const c of list) {
      const [y, m] = c.date.split("-").map(Number);
      const month = `${MONTHS[m - 1]} ${y}`;
      const last = out[out.length - 1];
      if (last && last.month === month) last.items.push(c);
      else out.push({ month, items: [c] });
    }
    return out;
  }, [camu.history, camuId]);

  if (!stat) return null;
  const { subject, summary } = stat;
  const missed = groups.reduce((n, g) => n + g.items.filter((c) => !c.present).length, 0);

  return (
    <Sheet open onClose={onClose} title={subject.name}>
      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="flex items-baseline justify-between">
          <p className={cx("text-[28px] font-semibold tabular-nums leading-none", STATE_TEXT[summary.state])}>
            {fmtPct(summary.pct)}
          </p>
          <p className="text-[13px] text-muted tabular-nums">
            {summary.attended} of {summary.total} attended
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar pct={summary.pct} target={target} state={summary.state} />
        </div>
        <p className={cx("mt-3 text-[13.5px] font-medium", STATE_TEXT[summary.state])}>{describe(summary)}</p>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-[13.5px] text-muted">
          Camu has not sent the class list yet. Tap refresh on the Attendance screen.
        </p>
      ) : (
        <div className="mt-4 space-y-4 pb-2">
          {missed > 0 && (
            <p className="text-[13px] text-muted">
              Missed {missed} {missed === 1 ? "class" : "classes"} so far.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.month}>
              <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">{g.month}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl lift">
                {g.items.map((c) => (
                  <li key={`${c.date}-${c.from}`} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span
                      className={cx(
                        "grid size-7 shrink-0 place-items-center rounded-full",
                        c.present ? "bg-safe-soft text-safe" : "bg-danger-soft text-danger",
                      )}
                      aria-hidden
                    >
                      {c.present ? <Check size={15} strokeWidth={2.75} /> : <X size={15} strokeWidth={2.75} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium">{fmtDay(c.date)}</span>
                      <span className="block text-[12.5px] text-muted">
                        {c.from ? fmtTime(c.from) : ""}
                        {c.leave && !c.present ? ` · ${c.leave}` : ""}
                      </span>
                    </span>
                    <span className={cx("text-[13px] font-medium", c.present ? "text-safe" : "text-danger")}>
                      {c.present ? "Present" : "Absent"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  );
}
