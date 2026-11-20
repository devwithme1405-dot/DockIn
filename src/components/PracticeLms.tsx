"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Eye, FlaskConical, RotateCcw } from "lucide-react";
import { db } from "@/lib/db";
import { PRACTICE, resetPractice, setNextAnswer, startPractice, stopPractice, useNextAnswer, usePracticeOn, type NextAnswer } from "@/lib/practiceLms";
import { handOver } from "./AssignmentFile";
import { cx, useToast } from "./ui";

const ANSWERS: [NextAnswer, string][] = [
  ["ok", "Works"],
  ["fail", "Fails"],
  ["draft", "Stays draft"],
  ["webonly", "Website-only login"],
];

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).toLowerCase();

/** Settings → Practice LMS: switch it on, choose how it answers, see what was handed in. */
export function PracticeLmsPanel() {
  const on = usePracticeOn();
  const next = useNextAnswer();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const subs = useLiveQuery(() => db.practiceSubs.toArray(), []) ?? [];
  const tasks = useLiveQuery(() => db.tasks.where("id").anyOf(PRACTICE.map((p) => `lms-assign-${p.instance}`)).toArray(), []) ?? [];

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await stopPractice();
        toast.show("Practice LMS off — its assignments are gone");
      } else {
        await startPractice();
        toast.show("Practice LMS on — 3 practice assignments are in Tasks");
      }
    } catch {
      toast.show("Could not change that.");
    }
    setBusy(false);
  }

  return (
    <div>
      <p className="text-[13.5px] leading-snug text-muted">
        A pretend LMS for trying assignment solutions. Nothing here ever reaches the real LMS — submitted files stay on this
        phone so you can open them and check the name.
      </p>

      <button
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={on}
        className={cx(
          "mt-4 flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-3 text-left transition active:scale-[0.99] disabled:opacity-60",
          on ? "border-[#e07a2c] bg-mess-soft" : "border-card-edge bg-card",
        )}
      >
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", on ? "bg-[#e07a2c] text-white" : "bg-surface-2 text-muted")}>
          <FlaskConical size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold">Practice LMS</span>
          <span className="block text-[12.5px] text-muted">{on ? "On — 3 practice assignments in Tasks" : "Off"}</span>
        </span>
        <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-[#e07a2c]" : "bg-line")}>
          <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-[left]", on ? "left-6" : "left-1")} />
        </span>
      </button>

      {on && (
        <>
          <ol className="mt-4 space-y-1.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] leading-snug">
            <li>
              <b>1.</b> Turn this on on <b>both</b> phones (yours and a friend&apos;s).
            </li>
            <li>
              <b>2.</b> In a chat, send a Word/PDF → <i>Solution for an LMS assignment</i> → pick a <i>(practice)</i> one.
            </li>
            <li>
              <b>3.</b> On the other phone: <i>Edit &amp; submit</i> → check → <i>Submit to LMS</i>.
            </li>
            <li>
              <b>4.</b> Come back here and open the handed-in file.
            </li>
          </ol>

          <p className="mt-4 mb-1.5 text-[12px] font-extrabold tracking-wide text-muted uppercase">The next submit</p>
          <div className="flex flex-wrap gap-1.5">
            {ANSWERS.map(([id, label]) => (
              <button key={id} onClick={() => setNextAnswer(id)} aria-pressed={next === id} className={cx("chip", next === id && "on")}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {next === "ok" ? "Goes in like a normal submission." : "Only the next one — then it works again."}
          </p>

          <p className="mt-4 mb-1.5 text-[12px] font-extrabold tracking-wide text-muted uppercase">Practice assignments</p>
          <ul className="space-y-1.5">
            {PRACTICE.map((p) => {
              const sub = subs.find((s) => s.instance === p.instance);
              const task = tasks.find((t) => t.id === `lms-assign-${p.instance}` && !t.deletedAt);
              const done = sub?.status === "submitted";
              return (
                <li key={p.instance} className="rounded-2xl border-[1.5px] border-card-edge bg-card px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">{p.title}</span>
                      <span className="block text-[12px] text-muted">
                        {p.course}
                        {task?.dueDate ? ` · due ${task.dueDate.slice(8)}/${task.dueDate.slice(5, 7)}` : ""}
                      </span>
                    </span>
                    <span
                      className={cx(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        done ? "bg-safe/15 text-safe" : sub ? "bg-orange/15 text-mess" : "bg-surface-2 text-muted",
                      )}
                    >
                      {done ? "Submitted" : sub ? "Draft" : "Not submitted"}
                    </span>
                  </div>
                  {sub && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2">
                      {done ? <Check size={15} className="shrink-0 text-safe" /> : <span className="size-2 shrink-0 rounded-full bg-[#e07a2c]" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{sub.name}</span>
                        <span className="block text-[11.5px] text-muted">
                          {sub.size < 1048576 ? `${Math.max(1, Math.round(sub.size / 1024))} KB` : `${(sub.size / 1048576).toFixed(1)} MB`} · {when(sub.at)}
                        </span>
                      </span>
                      <button onClick={() => void handOver(sub.blob, sub.name)} className="btn-paper inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-bold">
                        <Eye size={13} /> Open
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            onClick={async () => {
              await resetPractice();
              toast.show("Practice LMS reset — nothing submitted");
            }}
            className="mt-3 mb-1 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[14px] font-bold"
          >
            <RotateCcw size={16} /> Start over
          </button>
        </>
      )}
    </div>
  );
}
