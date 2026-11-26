"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  DoorOpen,
  ExternalLink,
  GraduationCap,
  House,
  ImagePlus,
  Mic,
  Moon,
  PenLine,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Sun,
  Sunrise,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { useBackClose } from "@/lib/backClose";
import { addDays, fmtTime, toDateStr } from "@/lib/dates";
import { isNativeApp, onPhone } from "@/lib/native";
import {
  DAYOUT_END,
  needsProof,
  readPass,
  REASONS,
  startChoices,
  type LeaveType,
  type PassDraft,
  type PassKind,
  type TimeAsk,
} from "@/lib/outpass";
import { romanise } from "@/lib/v3/demoBrain";
import {
  camuNotes,
  clearCamuNotes,
  notePath,
  notesReport,
  openCamuToTeach,
  parentText,
  sendToCamu,
  shareText,
  isWrite,
  type CamuNotes,
} from "@/lib/v3/pass";
import { v3db, type PassRecord, type PassStatus } from "@/lib/v3/store";
import { passProblem, savePass } from "@/lib/v3/tools";
import { closeOutpass, openOutpass, useV3Screens } from "@/lib/v3/ui";
import { canListen, savedVoiceLang, useVoice } from "@/lib/v3/voice";
import { Segmented } from "../Paper";
import { Sheet, cx, inputCls, useToast } from "../ui";
import { useBlobUrl } from "./AskCards";
import { DockBot } from "./DockBot";
import { passDay, PassStatusChip, STATUS_LABEL } from "./passParts";

const EXAMPLES = ["Kal 4 baje market", "Abhi day out, walking", "Kal se 3 din ghar", "Medical leave 2 to 4 dec"];
const LEAVE_TYPES: LeaveType[] = ["Leave", "On Duty", "Medical"];

function blank(kind: PassKind = "dayout"): PassDraft {
  const now = new Date();
  const mins = Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes() + 30) / 30) * 30, 18 * 60);
  const from = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const today = toDateStr(now);
  if (kind === "leave") return { kind, leaveType: "Leave", fromDate: today, fromTime: from, toDate: addDays(today, 1), toTime: DAYOUT_END, reason: "" };
  return { kind, leaveType: "Leave", fromDate: today, fromTime: from, toDate: today, toTime: DAYOUT_END, reason: "" };
}

/** Fill in what a draft is missing, without inventing a reason. */
function settle(d: PassDraft): PassDraft {
  const p = { ...d };
  if (p.kind === "dayout") {
    p.toDate = p.fromDate;
    if (!p.toTime || p.toTime > DAYOUT_END) p.toTime = DAYOUT_END;
  } else if (p.toDate < p.fromDate) p.toDate = p.fromDate;
  if (p.reason === ".") p.reason = "";
  return p;
}

/**
 * Outpass: one screen for a day out or a leave out pass. Type it (or say it)
 * the way you'd tell a friend, tap what DockIn could not be sure of, and it
 * opens MyCamu signed in with everything pinned on top — and, for a leave, the
 * mail screenshot ready for MyCamu's upload button. Approval happens in MyCamu,
 * by whoever approves; DockIn only makes asking for it one tap.
 */
export function Outpass() {
  const { pass } = useV3Screens();
  const open = !!pass;
  useBackClose(open, closeOutpass);
  if (!pass || typeof document === "undefined") return null;
  return createPortal(
    <OutpassScreen key={`${pass.tab}-${pass.kind ?? ""}-${pass.draft?.fromDate ?? ""}-${pass.focus ?? ""}`} start={pass} />,
    document.body,
  );
}

function OutpassScreen({ start }: { start: NonNullable<ReturnType<typeof useV3Screens>["pass"]> }) {
  const [tab, setTab] = useState<"new" | "history">(start.tab);
  const [saved, setSaved] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(start.focus ?? null);
  const count = useLiveQuery(() => v3db.passes.count(), []) ?? 0;

  return (
    <div className="ask-screen paper-page fixed inset-0 z-[56] mx-auto flex w-full max-w-md flex-col" role="dialog" aria-label="Outpass">
      <header className="glass-bar relative z-10 flex items-center gap-2 px-2 pt-[calc(var(--sat,0px)+0.5rem)] pb-2">
        <button type="button" onClick={closeOutpass} aria-label="Back" className="grid size-10 place-items-center rounded-full text-accent">
          <ChevronLeft size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[19px] leading-tight font-extrabold">Outpass</p>
          <p className="text-[12px] text-muted">Day out & leave, straight to MyCamu</p>
        </div>
        <span className="op-door grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent" aria-hidden>
          <DoorOpen size={20} />
        </span>
      </header>

      <div className="px-4 pt-3 pb-1">
        <Segmented
          label="Outpass"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setSaved(null);
          }}
          options={[
            ["new", "New pass"],
            ["history", count ? `History · ${count}` : "History"],
          ]}
          small
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {saved ? (
          <Saved
            id={saved}
            onHistory={() => {
              setFocus(saved);
              setSaved(null);
              setTab("history");
            }}
            onAnother={() => setSaved(null)}
          />
        ) : tab === "new" ? (
          <NewPass initial={start.draft} kind={start.kind} onSaved={setSaved} />
        ) : (
          <History focus={focus} onFocusDone={() => setFocus(null)} onNew={() => setTab("new")} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ new pass

interface Reading {
  /** Bumped on every read, so the "got it" chips animate again. */
  n: number;
  heard: string[];
  asks: TimeAsk[];
  needStart: boolean;
}

function NewPass({ initial, kind, onSaved }: { initial?: PassDraft; kind?: PassKind; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [d, setD] = useState<PassDraft>(() => (initial ? settle(initial) : blank(kind)));
  const [line, setLine] = useState("");
  const [reading, setReading] = useState<Reading | null>(null);
  const [writing, setWriting] = useState(false);
  const [proof, setProof] = useState<Blob | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const reasonBox = useRef<HTMLInputElement>(null);
  const fromTimeBox = useRef<HTMLInputElement>(null);
  const proofUrl = useBlobUrl(proof ?? undefined);
  const today = toDateStr();
  const voice = useVoice((text) => fill(romanise(text)));
  const listening = voice.state === "starting" || voice.state === "listening" || voice.state === "hearing" || voice.state === "processing";

  function patch(p: Partial<PassDraft>) {
    setD((cur) => {
      const next = { ...cur, ...p };
      if (next.kind === "dayout") {
        next.toDate = next.fromDate;
        if (p.kind === "dayout" || next.toTime > DAYOUT_END) next.toTime = DAYOUT_END;
      } else if (next.toDate < next.fromDate) next.toDate = next.fromDate;
      if (p.kind === "leave" && cur.kind === "dayout" && next.toDate === next.fromDate) next.toDate = addDays(next.fromDate, 1);
      return next;
    });
    // A time set by hand answers the question about it.
    if (reading && (p.fromTime || p.toTime || p.kind)) {
      setReading({
        ...reading,
        asks: p.kind ? [] : reading.asks.filter((a) => !(a.which === "from" ? p.fromTime : p.toTime)),
        needStart: p.fromTime || p.kind ? false : reading.needStart,
      });
    }
  }

  function fill(text = line) {
    const words = text.trim();
    if (!words) return;
    setLine(words);
    const r = readPass(words);
    setD(r.draft);
    setWriting(!!r.draft.reason && !REASONS[r.draft.kind].includes(r.draft.reason));
    setReading({ n: (reading?.n ?? 0) + 1, heard: r.heard, asks: r.asks, needStart: r.needStart });
  }

  function answer(a: TimeAsk, t: string) {
    setD((cur) => ({ ...cur, [a.which === "from" ? "fromTime" : "toTime"]: t }));
    if (reading) setReading({ ...reading, asks: reading.asks.filter((x) => x !== a) });
  }

  const reasons = REASONS[d.kind];
  const custom = writing || (!!d.reason && !reasons.includes(d.reason));
  const problem = passProblem({ ...d, reason: d.reason || "x" }, !!proof);
  const reasonMissing = !d.reason.trim();
  const open = reading ? reading.asks.length + (reading.needStart ? 1 : 0) : 0;

  async function save(toCamu: boolean) {
    setTried(true);
    if (problem || reasonMissing) return;
    setBusy(true);
    try {
      const id = await savePass({ ...d, reason: d.reason.trim() }, proof ?? undefined, "manual");
      if (toCamu) {
        const how = await sendToCamu(d, proof ?? undefined).catch(() => "copied" as const);
        if (how === "copied") toast.show("Details copied — paste them in MyCamu");
      }
      onSaved(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pt-3 pb-[calc(7rem+var(--sab))]">
      {/* say it */}
      <div className="op-hero relative overflow-hidden rounded-[22px] border-[1.5px] border-card-edge bg-card p-3.5 shadow-[0_3px_0_var(--pbtn-lip)]">
        <div className="flex items-center gap-2.5">
          <DockBot size={44} mood={listening ? "listening" : reading ? "happy" : "idle"} />
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-extrabold leading-tight">Tell me the pass you need</p>
            <p className="text-[12px] text-muted">Type it like you&apos;d text a friend — I&apos;ll fill the form</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <input
              value={listening ? voice.partial || line : line}
              onChange={(e) => setLine(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fill()}
              placeholder={listening ? "Listening…" : "kal 4 baje market…"}
              aria-label="Describe the pass"
              enterKeyHint="go"
              className={cx(inputCls, "h-12 w-full pr-11 text-[15px]")}
            />
            {canListen() && (
              <button
                type="button"
                onClick={() => (listening ? voice.finish() : void voice.start(savedVoiceLang()))}
                aria-label={listening ? "Stop listening" : "Say it"}
                className={cx(
                  "absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-full transition",
                  listening ? "op-mic-live bg-danger text-white" : "text-accent",
                )}
              >
                <Mic size={18} />
              </button>
            )}
          </div>
          <button type="button" onClick={() => fill()} className="btn-leather grid size-12 shrink-0 place-items-center rounded-xl" aria-label="Fill the form">
            <Wand2 size={19} />
          </button>
        </div>
        {voice.state === "error" && voice.error && <p className="mt-2 text-[12.5px] font-semibold text-danger">{voice.error}</p>}
        <div className="-mx-3.5 mt-2.5 flex gap-1.5 overflow-x-auto px-3.5 pb-0.5">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => fill(x)} className="btn-paper lip-sm shrink-0 rounded-full px-3 py-1.5 text-[12.5px]">
              {x}
            </button>
          ))}
        </div>

        {/* what it understood */}
        {reading && (
          <div key={reading.n} className="mt-3 border-t border-dashed border-line pt-3">
            <p className="mb-1.5 flex items-center gap-1 text-[11.5px] font-bold tracking-[0.08em] text-safe uppercase">
              <Sparkles size={13} /> Got it{open ? ` · ${open} quick ${open === 1 ? "question" : "questions"}` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {reading.heard.map((h, i) => (
                <span key={`${h}-${i}`} className="anim-pop rounded-full bg-safe-soft px-2.5 py-1 text-[12.5px] font-bold text-safe" style={{ "--d": `${i * 90}ms` } as React.CSSProperties}>
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* the quick questions */}
      {reading && (reading.asks.length > 0 || reading.needStart) && (
        <div className="mt-3 space-y-2.5">
          {reading.asks.map((a, i) => (
            <div key={`${reading.n}-${a.which}`} className="ask-in rounded-2xl border-[1.5px] border-accent/40 bg-accent-soft/50 p-3" style={{ animationDelay: `${250 + i * 80}ms` }}>
              <p className="text-[13.5px] font-bold">
                {a.which === "from" ? "Leaving at" : "Back by"} {a.said} — morning or evening?
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {a.options.map((t, j) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => answer(a, t)}
                    className="btn-paper lip-sm inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-extrabold"
                  >
                    {j === 0 ? <Sunrise size={17} className="text-warn" /> : <Moon size={16} className="text-accent" />}
                    {fmtTime(t).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {reading.needStart && (
            <div className="ask-in rounded-2xl border-[1.5px] border-accent/40 bg-accent-soft/50 p-3" style={{ animationDelay: "250ms" }}>
              <p className="text-[13.5px] font-bold">When are you heading out?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {startChoices(d.fromDate).map((t, j) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => patch({ fromTime: t })}
                    className="btn-paper lip-sm h-10 rounded-full px-3.5 text-[13.5px] font-bold"
                  >
                    {j === 0 && d.fromDate === today ? `Now · ${fmtTime(t)}` : fmtTime(t)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    patch({ fromTime: d.fromTime });
                    fromTimeBox.current?.focus();
                    fromTimeBox.current?.showPicker?.();
                  }}
                  className="lip-sm h-10 rounded-full px-3.5 text-[13.5px] font-bold text-accent"
                >
                  Other…
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div key={reading?.n ?? 0} className={cx("mt-4 space-y-4", reading && "op-filled")}>
        {/* kind */}
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              ["dayout", Sun, "Day Out", "Same day · back by 7 PM"],
              ["leave", House, "Leave", "Out for a day or more"],
            ] as const
          ).map(([k, Icon, title, sub]) => {
            const on = d.kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => patch({ kind: k })}
                aria-pressed={on}
                className={cx("relative flex flex-col items-start gap-1.5 rounded-2xl p-3.5 text-left transition active:scale-[0.98]", on ? "btn-leather" : "btn-paper")}
              >
                <Icon size={22} className={on ? "text-[#ffd59e]" : "text-accent"} />
                <span className="text-[15.5px] font-extrabold">{title}</span>
                <span className={cx("text-[12px] leading-tight", on ? "text-[#f6dcbc]" : "text-muted")}>{sub}</span>
                {on && <CheckCircle2 size={18} className="anim-check absolute top-3 right-3 text-[#ffd59e]" />}
              </button>
            );
          })}
        </div>

        {d.kind === "leave" && (
          <div className="ask-in">
            <p className="mb-1.5 text-[13px] font-medium text-muted">Leave type</p>
            <div className="flex gap-2">
              {LEAVE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => patch({ leaveType: t })}
                  className={cx("lip-sm h-9 flex-1 rounded-full text-[13.5px]", d.leaveType === t ? "btn-leather" : "btn-paper")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* when */}
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
            <CalendarClock size={15} className="text-accent" /> When
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="contents">
              <span className="sr-only">From date</span>
              <input type="date" min={today} value={d.fromDate} onChange={(e) => e.target.value && patch({ fromDate: e.target.value })} className={cx(inputCls, "h-11 text-[15px]")} />
            </label>
            <label className="contents">
              <span className="sr-only">From time</span>
              <input
                ref={fromTimeBox}
                type="time"
                value={d.fromTime}
                onChange={(e) => e.target.value && patch({ fromTime: e.target.value })}
                className={cx(inputCls, "h-11 w-32 text-[15px]")}
              />
            </label>
          </div>
          <p className="my-1.5 text-center text-[12px] font-bold tracking-[0.1em] text-muted uppercase">to</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="contents">
              <span className="sr-only">To date</span>
              <input
                type="date"
                min={d.fromDate}
                disabled={d.kind === "dayout"}
                value={d.toDate}
                onChange={(e) => e.target.value && patch({ toDate: e.target.value })}
                className={cx(inputCls, "h-11 text-[15px] disabled:opacity-60")}
              />
            </label>
            <label className="contents">
              <span className="sr-only">To time</span>
              <input
                type="time"
                max={d.kind === "dayout" ? DAYOUT_END : undefined}
                value={d.toTime}
                onChange={(e) => e.target.value && patch({ toTime: e.target.value })}
                className={cx(inputCls, "h-11 w-32 text-[15px]")}
              />
            </label>
          </div>
          <p className="mt-2 text-[12.5px] text-muted">{passDay(d)}</p>
        </div>

        {/* reason */}
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Reason</p>
          <div className={cx("flex flex-wrap gap-1.5 rounded-2xl", tried && reasonMissing && "ring-2 ring-danger/60 ring-offset-2 ring-offset-[var(--bg)]")}>
            {reasons.map((r) => {
              const on = !custom && d.reason === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setWriting(false);
                    patch({ reason: on ? "" : r });
                  }}
                  aria-pressed={on}
                  className={cx("lip-sm inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-[13.5px] transition", on ? "btn-leather" : "btn-paper")}
                >
                  {on && <Check size={14} className="anim-check" />}
                  {r}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setWriting(true);
                if (!custom) patch({ reason: "" });
                setTimeout(() => reasonBox.current?.focus(), 30);
              }}
              aria-pressed={custom}
              className={cx("lip-sm inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-[13.5px]", custom ? "btn-leather" : "btn-paper")}
            >
              <PenLine size={14} /> Write my own
            </button>
          </div>
          {custom && (
            <input
              ref={reasonBox}
              value={d.reason}
              onChange={(e) => patch({ reason: e.target.value })}
              placeholder={d.kind === "dayout" ? "e.g. Meeting a friend in Noida" : "e.g. Cousin's wedding"}
              maxLength={120}
              className={cx(inputCls, "ask-in mt-2 h-11 w-full text-[15px]")}
            />
          )}
        </div>

        {/* proof */}
        {needsProof(d) && (
          <div className="ask-in">
            <p className="mb-1.5 text-[13px] font-medium text-muted">Parent-approval mail (screenshot)</p>
            {proof ? (
              <div className="anim-pop flex items-center gap-3 rounded-2xl border border-line bg-surface p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {proofUrl && <img src={proofUrl} alt="" className="size-16 rounded-xl object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-safe">Attached ✓</p>
                  <p className="text-[12px] text-muted">MyCamu&apos;s upload button will offer this one</p>
                </div>
                <button type="button" onClick={() => setProof(null)} className="grid size-9 place-items-center rounded-full text-muted" aria-label="Remove">
                  <X size={17} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => pick.current?.click()}
                className={cx("flex w-full items-center gap-3 rounded-2xl border-2 border-dashed bg-surface p-4 text-left", tried ? "border-danger/60" : "border-line")}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-warn-soft text-warn">
                  <ImagePlus size={20} />
                </span>
                <span className="flex-1">
                  <span className="block text-[14px] font-bold">Attach the screenshot</span>
                  <span className="block text-[12.5px] text-muted">MyCamu asks for it with a leave</span>
                </span>
              </button>
            )}
            <input
              ref={pick}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setProof(f);
              }}
            />
          </div>
        )}

        {tried && (problem || reasonMissing) && <p className="anim-pop text-[13px] font-semibold text-danger">{problem ?? "Pick or write a reason."}</p>}
      </div>

      {/* actions */}
      <div className="glass-bar fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md gap-2 px-4 pt-2.5 pb-[max(0.875rem,var(--sab))]">
        <button type="button" disabled={busy} onClick={() => void save(false)} className="btn-paper h-12 flex-1 rounded-2xl text-[14.5px] font-bold">
          Save only
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(true)}
          className="btn-leather inline-flex h-12 flex-[1.7] items-center justify-center gap-2 rounded-2xl text-[15px]"
        >
          {busy ? <RefreshCw size={17} className="animate-spin" /> : <Send size={17} />} Make the pass
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ saved

function Saved({ id, onHistory, onAnother }: { id: string; onHistory: () => void; onAnother: () => void }) {
  const toast = useToast();
  const p = useLiveQuery(() => v3db.passes.get(id), [id]);
  if (!p) return null;
  const applied = p.status !== "saved";
  const leave = needsProof(p);
  return (
    <div className="flex flex-col items-center px-5 pt-5 pb-10 text-center">
      <div className="anim-pop">
        <DockBot mood="happy" size={96} />
      </div>
      <h2 className="font-display mt-1 text-[22px] font-extrabold">Your pass is ready</h2>
      <p className="mt-1 max-w-[19rem] text-[13.5px] text-muted">Two quick steps left — both in MyCamu.</p>

      <div className="relative mt-4 w-full">
        <div className="pass-print">
          <Ticket p={p} />
        </div>
        <span className="pass-stamp pointer-events-none absolute top-3 right-4 rounded-md border-[2.5px] border-safe px-2 py-0.5 text-[13px] font-black tracking-[0.14em] text-safe uppercase">
          {applied ? STATUS_LABEL[p.status].split(" ")[0] : "Ready"}
        </span>
      </div>

      <ol className="mt-5 w-full space-y-2.5 text-left">
        <Step n={1} done={applied} title="Submit it in MyCamu" delay={380}>
          <p className="text-[12.5px] text-muted">
            Everything is pinned on top of MyCamu{leave ? ". Tap upload and pick “The mail screenshot from DockIn”." : "."}
          </p>
          <div className="mt-2 grid grid-cols-[1.4fr_1fr] gap-2">
            <button
              type="button"
              onClick={() => void sendToCamu(p, p.proof).then((how) => how === "copied" && toast.show("Details copied — paste them in MyCamu"))}
              className="btn-leather inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13.5px]"
            >
              <ExternalLink size={15} /> Open MyCamu
            </button>
            <button
              type="button"
              onClick={() => void v3db.passes.update(p.id, { status: applied ? "saved" : "applied", updatedAt: Date.now() })}
              className={cx("lip-sm inline-flex h-10 items-center justify-center gap-1 rounded-xl text-[13px]", applied ? "btn-leather" : "btn-paper")}
            >
              <Check size={15} /> {applied ? "Submitted" : "I submitted"}
            </button>
          </div>
        </Step>
        <Step n={2} title="Get it approved" delay={520}>
          <p className="text-[12.5px] text-muted">Send your parents a ready message, or open MyCamu if you approve it there.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void shareText(parentText(p), "Send to parents")}
              className="btn-paper lip-sm inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px]"
            >
              <Share2 size={15} /> Tell parents
            </button>
            <button
              type="button"
              onClick={() => void sendToCamu(p)}
              className="btn-paper lip-sm inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px]"
            >
              <GraduationCap size={15} /> Approve in MyCamu
            </button>
          </div>
        </Step>
      </ol>

      <div className="mt-4 grid w-full grid-cols-2 gap-2">
        <button type="button" onClick={onHistory} className="btn-paper h-11 rounded-2xl text-[14px] font-bold">
          See history
        </button>
        <button type="button" onClick={onAnother} className="btn-paper h-11 rounded-2xl text-[14px] font-bold">
          New pass
        </button>
      </div>
    </div>
  );
}

function Step({ n, title, done, delay, children }: { n: number; title: string; done?: boolean; delay: number; children: React.ReactNode }) {
  return (
    <li className="ask-in flex gap-3 rounded-2xl border border-line bg-surface p-3" style={{ animationDelay: `${delay}ms` }}>
      <span
        className={cx(
          "grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-black transition",
          done ? "bg-safe text-white" : "bg-accent-soft text-accent",
        )}
      >
        {done ? <Check size={15} className="anim-check" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-extrabold">{title}</p>
        {children}
      </div>
    </li>
  );
}

function Ticket({ p, onClick }: { p: PassRecord; onClick?: () => void }) {
  const Body = onClick ? "button" : "div";
  return (
    <Body
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="pass-ticket block w-full overflow-hidden rounded-2xl border-[1.5px] border-card-edge bg-card text-left shadow-[0_3px_0_var(--pbtn-lip)] transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <span className={cx("grid size-11 shrink-0 place-items-center rounded-xl", p.kind === "dayout" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>
          {p.kind === "dayout" ? <Sun size={21} /> : <House size={21} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold">{p.kind === "dayout" ? "Day Out Pass" : p.leaveType === "Leave" ? "Leave Out Pass" : `Leave · ${p.leaveType}`}</p>
          <p className="truncate text-[12.5px] text-muted">{p.reason}</p>
        </div>
      </div>
      <div className="mx-4 border-t-2 border-dashed border-line" />
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">From</p>
          <p className="text-[13.5px] font-bold">{dayShort(p.fromDate)}</p>
          <p className="text-[12.5px] text-muted">{fmtTime(p.fromTime)}</p>
        </div>
        <DoorOpen size={18} className="text-muted" />
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">To</p>
          <p className="text-[13.5px] font-bold">{dayShort(p.toDate)}</p>
          <p className="text-[12.5px] text-muted">{fmtTime(p.toTime)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line bg-surface px-4 py-2">
        <PassStatusChip status={p.status} />
        <span className="text-[11.5px] text-muted">{p.proof ? "with mail screenshot" : p.via === "assistant" ? "via DockBot" : "made in DockIn"}</span>
      </div>
    </Body>
  );
}

const dayShort = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

// ------------------------------------------------------------------ history

function History({ focus, onFocusDone, onNew }: { focus: string | null; onFocusDone: () => void; onNew: () => void }) {
  const passes = useLiveQuery(() => v3db.passes.orderBy("createdAt").reverse().toArray(), []);
  const [openId, setOpenId] = useState<string | null>(focus);
  const [filter, setFilter] = useState<"all" | PassKind>("all");
  const today = toDateStr();
  if (!passes) return null;
  if (!passes.length) {
    return (
      <div className="flex flex-col items-center px-6 pt-12 pb-10 text-center">
        <div className="anim-float">
          <DockBot size={110} />
        </div>
        <h2 className="font-display mt-3 text-[20px] font-extrabold">No outpasses yet</h2>
        <p className="mt-1 text-[13.5px] text-muted">Make one in a few seconds — just type “kal 4 baje market”.</p>
        <button type="button" onClick={onNew} className="btn-leather mt-5 h-11 rounded-2xl px-5">
          Make a pass
        </button>
        <TeachCamu />
      </div>
    );
  }
  const shown = filter === "all" ? passes : passes.filter((p) => p.kind === filter);
  const live = shown.filter((p) => p.toDate >= today && p.status !== "cancelled" && p.status !== "rejected");
  const past = shown.filter((p) => !live.includes(p));
  const current = passes.find((p) => p.id === openId) ?? null;
  const month = passes.filter((p) => p.fromDate.slice(0, 7) === today.slice(0, 7) && p.status !== "cancelled");
  return (
    <div className="space-y-5 px-4 pt-3 pb-10">
      <div className="grid grid-cols-3 gap-2">
        <Count label="This month" value={month.length} />
        <Count label="Day outs" value={month.filter((p) => p.kind === "dayout").length} />
        <Count label="Leaves" value={month.filter((p) => p.kind === "leave").length} />
      </div>
      <div className="flex gap-1.5">
        {(
          [
            ["all", "All"],
            ["dayout", "Day out"],
            ["leave", "Leave"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cx("lip-sm h-8 rounded-full px-3.5 text-[12.5px]", filter === k ? "btn-leather" : "btn-paper")}
          >
            {label}
          </button>
        ))}
      </div>
      {live.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Upcoming & active</h3>
          <div className="space-y-3">
            {live.map((p, i) => (
              <div key={p.id} className="ask-in" style={{ animationDelay: `${i * 50}ms` }}>
                <Ticket p={p} onClick={() => setOpenId(p.id)} />
              </div>
            ))}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Past</h3>
          <div className="space-y-3 opacity-80">
            {past.map((p) => (
              <Ticket key={p.id} p={p} onClick={() => setOpenId(p.id)} />
            ))}
          </div>
        </section>
      )}
      {!live.length && !past.length && <p className="py-6 text-center text-[13.5px] text-muted">None of these yet.</p>}
      <TeachCamu />
      <PassSheet
        p={current}
        onClose={() => {
          setOpenId(null);
          onFocusDone();
        }}
      />
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-2.5">
      <p className="font-display text-[22px] leading-none font-extrabold tnum">{value}</p>
      <p className="mt-1 text-[11.5px] font-bold text-muted">{label}</p>
    </div>
  );
}

const NEXT: { status: PassStatus; label: string; icon: typeof Check }[] = [
  { status: "applied", label: "I've applied in MyCamu", icon: Check },
  { status: "approved", label: "Approved", icon: CheckCircle2 },
  { status: "rejected", label: "Rejected", icon: XCircle },
  { status: "cancelled", label: "Cancelled", icon: X },
];

function PassSheet({ p, onClose }: { p: PassRecord | null; onClose: () => void }) {
  const toast = useToast();
  const proofUrl = useBlobUrl(p?.proof);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Sheet open={!!p} onClose={onClose} title="Outpass">
      {p && (
        <div className="space-y-4 pb-2">
          <Ticket p={p} />
          {proofUrl && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-muted">Mail screenshot</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proofUrl} alt="Parent-approval mail" className="max-h-64 w-full rounded-2xl border border-line object-contain" />
            </div>
          )}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted">Status · {STATUS_LABEL[p.status]}</p>
            <div className="grid grid-cols-2 gap-2">
              {NEXT.map((n) => (
                <button
                  key={n.status}
                  type="button"
                  onClick={() => void v3db.passes.update(p.id, { status: n.status, updatedAt: Date.now() })}
                  className={cx(
                    "lip-sm inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px]",
                    p.status === n.status ? "btn-leather" : "btn-paper",
                    n.status === "applied" && "col-span-2",
                  )}
                >
                  <n.icon size={15} /> {n.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void sendToCamu(p, p.proof).then((how) => how === "copied" && toast.show("Details copied — paste them in MyCamu"))}
              className="btn-leather inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px]"
            >
              <ExternalLink size={15} /> Open MyCamu
            </button>
            <button
              type="button"
              onClick={() => void shareText(parentText(p), "Send to parents")}
              className="btn-paper inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px]"
            >
              <Share2 size={15} /> Tell parents
            </button>
            <button
              type="button"
              onClick={() => {
                const shift = Math.max(0, Math.round((Date.parse(toDateStr()) - Date.parse(p.fromDate)) / 864e5));
                onClose();
                // Same pass again, moved up to today if its dates have gone.
                const { kind, leaveType, fromTime, toTime, reason } = p;
                openOutpass("new", { kind, leaveType, fromTime, toTime, reason, fromDate: addDays(p.fromDate, shift), toDate: addDays(p.toDate, shift) });
              }}
              className="btn-paper col-span-2 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px]"
            >
              <Copy size={15} /> Use again
            </button>
          </div>
          {confirmDelete ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-paper h-11 flex-1 rounded-xl text-[13.5px]">
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  void v3db.passes.delete(p.id);
                  setConfirmDelete(false);
                  onClose();
                }}
                className="h-11 flex-1 rounded-xl bg-danger text-[13.5px] font-bold text-white"
              >
                Delete for good
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex w-full items-center justify-center gap-1.5 py-2 text-[13.5px] font-bold text-danger">
              <Trash2 size={15} /> Delete from history
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ teach DockIn

/**
 * Once: make a pass in MyCamu through DockIn so DockIn can note how MyCamu sends
 * it (never a password), then share those notes with the DockIn team. That is
 * what lets a later version submit straight from this screen.
 */
function TeachCamu() {
  const toast = useToast();
  const [notes, setNotes] = useState<CamuNotes | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let gone = false;
    const load = () =>
      void camuNotes().then((n) => {
        if (!gone) setNotes(n);
      });
    load();
    const off = onPhone("resume", load);
    return () => {
      gone = true;
      off();
    };
  }, []);

  if (!isNativeApp()) return null;
  const picked = notes?.picked ?? [];
  const sent = notes ? [...notes.writes, ...notes.picked].filter(isWrite) : [];
  const anything = !!notes && (picked.length > 0 || notes.recent.length > 0 || notes.writes.length > 0);
  return (
    <section className="mt-6 w-full rounded-2xl border-[1.5px] border-dashed border-line bg-surface p-3.5 text-left">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <GraduationCap size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-extrabold">Teach DockIn to submit for you</span>
          <span className={cx("block text-[12px]", sent.length ? "font-bold text-safe" : "text-muted")}>
            {sent.length ? `MyCamu submit noted ✓ — share it` : picked.length ? "Pass page seen · now submit a pass" : "One-time · takes a minute"}
          </span>
        </span>
        <ChevronLeft size={18} className={cx("text-muted transition", open ? "rotate-90" : "-rotate-90")} />
      </button>
      {open && (
        <div className="ask-in mt-3 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-muted">
            <li>Tap “Open MyCamu” and make one Day Out pass and one Leave pass, exactly as you always do.</li>
            <li>DockIn notes how MyCamu sends the form — never your password.</li>
            <li>Tap “Share with DockIn team”. The next version then submits straight from here.</li>
          </ol>
          {picked.length > 0 && (
            <p className="text-[12px] font-semibold text-muted">Newest first. A pass is learned when a non-“get” line shows up.</p>
          )}
          {picked.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-card p-2 text-[11.5px]">
              {[...picked].reverse().slice(0, 8).map((n) => (
                <li key={`${n.at}-${n.url}`} className="flex items-center gap-2">
                  <span className={cx("rounded px-1.5 py-0.5 font-bold", n.status >= 200 && n.status < 300 ? "bg-safe-soft text-safe" : "bg-warn-soft text-warn")}>{n.status || "…"}</span>
                  <span className="truncate font-mono">
                    {n.method} {notePath(n)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void openCamuToTeach()} className="btn-leather inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px]">
              <ExternalLink size={15} /> Open MyCamu
            </button>
            <button
              type="button"
              disabled={!anything}
              onClick={() => notes && void shareText(notesReport(notes), "Share with DockIn team")}
              className="btn-paper lip-sm inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] disabled:opacity-50"
            >
              <Share2 size={15} /> Share with team
            </button>
          </div>
          {anything && (
            <button
              type="button"
              onClick={() =>
                void clearCamuNotes().then(() => {
                  setNotes({ writes: [], picked: [], recent: [] });
                  toast.show("Cleared");
                })
              }
              className="w-full py-1 text-center text-[12.5px] font-bold text-muted"
            >
              Clear the notes
            </button>
          )}
        </div>
      )}
    </section>
  );
}
