"use client";

import { useMemo, useState } from "react";
import { Copy, Search } from "lucide-react";
import { copyTask, deleteTask } from "@/lib/repo";
import { KIND_BY_ID, KINDS } from "@/lib/tasks";
import { addDays, fmtDay, fmtTime, toDateStr } from "@/lib/dates";
import type { Subject, Task, TaskKind } from "@/lib/types";
import { Chip, EmptyState, Sheet, cx, useToast } from "./ui";
import { KIND_ICON } from "./TaskParts";

/**
 * Everything you have finished, kept for good and grouped by the day it was
 * done. Any of it can be copied onto a day again — the weekly lab record, the
 * same quiz prep before every mid-sem — without typing it out a second time.
 */
export function TaskHistory({
  tasks,
  subjects,
  today,
  onOpen,
}: {
  tasks: Task[];
  subjects: Map<string, Subject>;
  today: string;
  onOpen: (t: Task) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<TaskKind | "all">("all");
  const [copying, setCopying] = useState<Task | null>(null);
  const [pick, setPick] = useState(today);

  const done = useMemo(
    () => tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
    [tasks],
  );
  const kindsUsed = useMemo(() => KINDS.filter((k) => done.some((t) => t.kind === k.id)), [done]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { key: string; label: string; items: Task[] }[] = [];
    for (const t of done) {
      if (kind !== "all" && t.kind !== kind) continue;
      if (q) {
        const subject = t.subjectId ? subjects.get(t.subjectId)?.name ?? "" : "";
        if (!`${t.title} ${t.notes} ${subject}`.toLowerCase().includes(q)) continue;
      }
      const d = t.doneAt ? toDateStr(new Date(t.doneAt)) : "";
      const label = !d ? "Earlier" : d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : fmtDay(d);
      const last = out[out.length - 1];
      if (last && last.key === d) last.items.push(t);
      else out.push({ key: d, label, items: [t] });
    }
    return out;
  }, [done, kind, query, subjects, today]);

  async function copyTo(date: string | null) {
    if (!copying) return;
    const made = await copyTask(copying.id, date);
    setCopying(null);
    const where = date === null ? "with no date" : date === today ? "to today" : date === addDays(today, 1) ? "to tomorrow" : `to ${fmtDay(date)}`;
    toast.show(`Copied ${where}`, made ? () => void deleteTask(made.id) : undefined);
  }

  if (done.length === 0) {
    return <EmptyState title="No history yet" body="Everything you tick off is kept here, day by day — copy any of it again in one tap." />;
  }

  return (
    <div className="px-5">
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border-[1.5px] border-card-edge bg-card px-4 shadow-[inset_0_1px_3px_rgb(var(--shadow-ink)/0.14)] focus-within:border-accent">
        <Search size={18} className="shrink-0 text-muted" />
        <input
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
          placeholder="Search history"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search history"
        />
      </label>
      {kindsUsed.length > 1 && (
        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pt-0.5 pb-1.5 [scrollbar-width:none]">
          <Chip active={kind === "all"} onClick={() => setKind("all")}>All {done.length}</Chip>
          {kindsUsed.map((k) => (
            <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
            </Chip>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nothing matches.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <section key={g.key || "earlier"}>
              <h3 className="mb-2 text-[12px] font-extrabold tracking-[0.08em] text-muted uppercase">
                {g.label} <span className="font-semibold tnum">· {g.items.length}</span>
              </h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl lift">
                {g.items.map((t) => {
                  const Icon = KIND_ICON[t.kind];
                  const subject = t.subjectId ? subjects.get(t.subjectId) : undefined;
                  const when = t.doneAt ? fmtTime(new Date(t.doneAt).toTimeString().slice(0, 5)) : "";
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-3.5 py-3">
                      <button onClick={() => onOpen(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                          <Icon size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold text-muted line-through decoration-1">{t.title}</span>
                          <span className="block truncate text-[12.5px] text-muted">
                            {KIND_BY_ID[t.kind].label}
                            {subject ? ` · ${subject.name}` : ""}
                            {t.source === "lms" ? " · LMS" : ""}
                            {when ? ` · done ${when}` : ""}
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setPick(today);
                          setCopying(t);
                        }}
                        aria-label={`Copy ${t.title} to a day`}
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-card-edge bg-card px-3 text-[13px] font-bold text-accent active:scale-95"
                      >
                        <Copy size={14} /> Copy
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!copying} onClose={() => setCopying(null)} title="Copy to a day">
        {copying && (
          <div className="pb-2">
            <p className="mb-4 truncate text-[14px] text-muted">
              <b className="text-text">{copying.title}</b> comes back as a fresh task{copying.subtasks.length ? ", steps unticked" : ""}.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={() => void copyTo(today)} className="btn-leather h-12 rounded-2xl text-[15px] font-bold">
                Today
              </button>
              <button onClick={() => void copyTo(addDays(today, 1))} className="h-12 rounded-2xl border border-card-edge bg-card text-[15px] font-bold">
                Tomorrow
              </button>
            </div>
            <div className="mt-3 flex gap-2.5">
              <input
                type="date"
                value={pick}
                min={today}
                onChange={(e) => setPick(e.target.value)}
                aria-label="Pick a day"
                className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-bg px-3.5 text-[16px] outline-none focus:border-accent"
              />
              <button
                onClick={() => void copyTo(pick || today)}
                className={cx("h-12 shrink-0 rounded-2xl border border-card-edge bg-card px-5 text-[15px] font-bold text-accent")}
              >
                Copy
              </button>
            </div>
            <button onClick={() => void copyTo(null)} className="mt-3 h-11 w-full text-[14px] font-semibold text-muted">
              Copy with no date
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
