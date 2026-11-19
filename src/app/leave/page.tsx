"use client";

import { useState } from "react";
import { DoorOpen, FileImage, Sparkles, Wand2 } from "lucide-react";
import { BackHeader } from "@/components/PageHeader";
import { Notebook, Segmented } from "@/components/Paper";
import { ConnectCamu } from "@/components/College";
import { Chip, cx, inputCls, useToast } from "@/components/ui";
import { useCollege } from "@/lib/college";
import { DockIn } from "@/lib/native";
import { DAYOUT_END, needsProof, parsePass, passSummary, type LeaveType, type PassDraft, type PassKind } from "@/lib/outpass";

const EXAMPLES = ["2:40pm-7pm day outpass", "kal 4 baje day out", "6-10 leave", "medical leave 6 dec to 9 dec"];
const KINDS = [
  ["dayout", "Day Out Pass"],
  ["leave", "Leave Out Pass"],
] as const;
const LEAVE_TYPES: LeaveType[] = ["Leave", "On Duty", "Medical"];

/**
 * Leave + gate pass. Say it in plain words, check the fields, then Camu's own
 * form opens (signed in) with the details pinned on top to copy across.
 */
export default function LeavePage() {
  const { state, native } = useCollege();
  const toast = useToast();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<PassDraft | null>(null);
  const camu = !!state.camu?.connected;

  function fill(line = text) {
    if (!line.trim()) return;
    setText(line);
    setDraft(parsePass(line));
  }

  function patch(p: Partial<PassDraft>) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...p };
      // A day out is one day, back by 7 PM.
      if (next.kind === "dayout") {
        next.toDate = next.fromDate;
        if (p.kind === "dayout") next.toTime = DAYOUT_END;
      } else if (next.toDate < next.fromDate) next.toDate = next.fromDate;
      return next;
    });
  }

  async function apply() {
    if (!draft) return;
    const note = passSummary(draft);
    try {
      await navigator.clipboard?.writeText(note);
    } catch {
      /* clipboard is a nicety */
    }
    if (!native) {
      toast.show("Copied — open Camu and paste the details");
      return;
    }
    DockIn.openCamu({ path: "/", note }).catch((e: Error) => toast.show(e.message || "Could not open Camu"));
  }

  async function shareLearned() {
    try {
      const { items } = await DockIn.camuCaptured();
      const list = JSON.parse(items || "[]") as unknown[];
      if (!list.length) {
        toast.show("Nothing yet — apply once through Camu here first");
        return;
      }
      await navigator.clipboard.writeText(items);
      toast.show(`Copied ${list.length} Camu requests — send them to the developer`);
    } catch {
      toast.show("Could not read it");
    }
  }

  return (
    <div className="page-wash pb-10">
      <BackHeader href="/" backLabel="Today" title="Leave & Outpass" />

      {native && !camu && (
        <div className="mx-5 mt-2">
          <ConnectCamu />
        </div>
      )}

      <Notebook className="mx-5 mt-3 px-4 pb-4" label="Say it">
        <label htmlFor="pass-text" className="flex items-center gap-2 text-[14.5px] font-extrabold">
          <Wand2 size={17} className="text-orange" /> Tell DockIn what you need
        </label>
        <textarea
          id="pass-text"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              fill();
            }
          }}
          placeholder="e.g. 2:40pm-7pm day outpass"
          className={cx(inputCls, "mt-2.5 resize-none py-2.5 leading-snug")}
        />
        <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          {EXAMPLES.map((e) => (
            <Chip key={e} onClick={() => fill(e)}>
              {e}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          onClick={() => fill()}
          disabled={!text.trim()}
          className="btn-leather mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[15px] disabled:opacity-50"
        >
          <Sparkles size={17} /> Fill the form
        </button>
      </Notebook>

      {draft && (
        <section className="mx-5 mt-5 rounded-3xl border-[1.5px] border-card-edge bg-card p-4" aria-label="Check the details">
          <p className="text-[15px] font-extrabold">Check before applying</p>
          <Segmented
            value={draft.kind}
            onChange={(k: PassKind) => patch({ kind: k })}
            options={KINDS}
            label="Gate pass type"
            className="mt-3"
            small
          />

          {draft.kind === "leave" && (
            <div className="mt-3 flex gap-2">
              {LEAVE_TYPES.map((t) => (
                <Chip key={t} active={draft.leaveType === t} onClick={() => patch({ leaveType: t })}>
                  {t}
                </Chip>
              ))}
            </div>
          )}

          <Row label="From">
            <input type="date" value={draft.fromDate} onChange={(e) => e.target.value && patch({ fromDate: e.target.value })} aria-label="From date" className={cx(inputCls, "min-w-0")} />
            <input type="time" value={draft.fromTime} onChange={(e) => e.target.value && patch({ fromTime: e.target.value })} aria-label="From time" className={cx(inputCls, "min-w-0")} />
          </Row>
          <Row label={draft.kind === "dayout" ? "Back by" : "To"}>
            <input
              type="date"
              value={draft.toDate}
              disabled={draft.kind === "dayout"}
              onChange={(e) => e.target.value && patch({ toDate: e.target.value })}
              aria-label="To date"
              className={cx(inputCls, "min-w-0 disabled:opacity-60")}
            />
            <input type="time" value={draft.toTime} onChange={(e) => e.target.value && patch({ toTime: e.target.value })} aria-label="To time" className={cx(inputCls, "min-w-0")} />
          </Row>

          <p className="mt-3.5 mb-1.5 text-[12.5px] font-bold text-muted">Reason</p>
          <input value={draft.reason} onChange={(e) => patch({ reason: e.target.value })} aria-label="Reason" className={inputCls} />

          {needsProof(draft) && (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-orange/10 px-3 py-2.5 text-[13px] leading-snug">
              <FileImage size={16} className="mt-0.5 shrink-0 text-orange" />
              Keep the parent-approval mail screenshot ready — Camu asks for it with a leave.
            </p>
          )}

          <button
            type="button"
            onClick={apply}
            disabled={native && !camu}
            className="btn-leather mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] disabled:opacity-50"
          >
            <DoorOpen size={18} /> Apply in Camu
          </button>
          <p className="mt-2 text-center text-[12px] leading-snug text-muted">
            Camu opens signed in, with these details pinned on top (also copied). Parents approve on their side.
          </p>
        </section>
      )}

      {native && camu && (
        <button type="button" onClick={shareLearned} className="mx-auto mt-6 block text-[12.5px] font-semibold text-muted underline underline-offset-4">
          Help build one-tap submit
        </button>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <p className="mt-3.5 mb-1.5 text-[12.5px] font-bold text-muted">{label}</p>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </>
  );
}
