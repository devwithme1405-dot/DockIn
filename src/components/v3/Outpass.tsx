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
  History as History_,
  X,
  XCircle,
} from "lucide-react";
import { useBackClose } from "@/lib/backClose";
import { addDays, fmtTime, toDateStr } from "@/lib/dates";
import { isNativeApp, onPhone } from "@/lib/native";
import {
  DAYOUT_END,
  needsProof,
  PASS_START,
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
  notesParts,
  openCamuToTeach,
  DIRECT_WHY,
  directState,
  type DirectState,
  parentText,
  cachedHistory,
  liveCamu,
  useCamuHistory,
  cancellable,
  clashes,
  fetchHistory,
  refreshFromCamu,
  sendable,
  sendPass,
  sendToCamu,
  shareText,
  isWrite,
  type CamuNotes,
  type CamuPass,
} from "@/lib/v3/pass";
import { v3db, type PassRecord, type PassStatus } from "@/lib/v3/store";
import { passProblem, savePass } from "@/lib/v3/tools";
import { closeOutpass, openOutpass, useV3Screens } from "@/lib/v3/ui";
import { canListen, savedVoiceLang, useVoice } from "@/lib/v3/voice";
import { Sheet, cx, inputCls, useToast } from "../ui";
import { useBlobUrl } from "./AskCards";
import { ApproveNow, CamuPassSheet, CamuTicket, CancelPass, inCamu, VerifyCard } from "./CamuPasses";
import { DockBot } from "./DockBot";
import { passDay, PassStatusChip, STATUS_LABEL } from "./passParts";

const DEFAULT_REASON = "Outing";
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
  const local = useLiveQuery(() => v3db.passes.count(), []) ?? 0;
  const camuList = useCamuHistory();
  const count = camuList ? camuList.items.length : local;
  const liveCount = camuList ? liveCamu(camuList.items, toDateStr()).length : 0;

  return (
    <div className="ask-screen paper-page fixed inset-0 z-[56] mx-auto flex w-full max-w-md flex-col" role="dialog" aria-label="Outpass">
      <header className="op-head relative z-10 overflow-hidden px-3 pt-[calc(var(--sat,0px)+0.5rem)] pb-3 text-white">
        <div className="relative flex items-center gap-2">
          <button type="button" onClick={closeOutpass} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-white/15 text-white active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[21px] leading-tight font-extrabold">Outpass</p>
            <p className="truncate text-[12px] text-white/80">
              {liveCount ? `${liveCount} active · ` : ""}Day out & leave, straight to MyCamu
            </p>
          </div>
          <span className="op-door grid size-11 place-items-center rounded-2xl bg-white/15" aria-hidden>
            <DoorOpen size={22} />
          </span>
        </div>
        <div role="tablist" aria-label="Outpass" className="relative mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-black/20 p-1">
          {(
            [
              ["new", "New pass", PenLine],
              ["history", "History", History_],
            ] as const
          ).map(([k, label, Icon]) => {
            const on = tab === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(k);
                  setSaved(null);
                }}
                className={cx(
                  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[14px] font-extrabold transition",
                  on ? "bg-[#fff4e6] text-[#7c3d1b] shadow-[0_2px_0_rgb(60_20_5/0.35)]" : "text-white/85",
                )}
              >
                <Icon size={16} /> {label}
                {k === "history" && count > 0 && (
                  <span className={cx("rounded-full px-1.5 text-[11px] tabular-nums", on ? "bg-[#7c3d1b] text-white" : "bg-white/20")}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </header>

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
  /** MyCamu said no — its reason, in plain words. */
  const [refusal, setRefusal] = useState<string | null>(null);
  /** The one-look summary before a pass goes into MyCamu. */
  const [review, setReview] = useState(false);
  /** MyCamu passes that overlap this one (null: still checking). */
  const [blockers, setBlockers] = useState<CamuPass[] | null>(null);
  /** This phone can send a day out to MyCamu itself. */
  const [direct, setDirect] = useState<DirectState | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const reasonBox = useRef<HTMLInputElement>(null);
  const fromTimeBox = useRef<HTMLInputElement>(null);
  const proofUrl = useBlobUrl(proof ?? undefined);
  const today = toDateStr();
  const voice = useVoice((text) => fill(romanise(text)));

  useEffect(() => {
    let gone = false;
    void directState().then((st) => {
      if (!gone) setDirect(st);
    });
    return () => {
      gone = true;
    };
  }, []);
  const listening = voice.state === "starting" || voice.state === "listening" || voice.state === "hearing" || voice.state === "processing";

  function patch(p: Partial<PassDraft>) {
    setRefusal(null);
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
    setRefusal(null);
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
  // No reason given → "Outing", what most passes say anyway.
  const reasonMissing = false;
  const reasonOf = (r: string) => r.trim() || DEFAULT_REASON;
  const open = reading ? reading.asks.length + (reading.needStart ? 1 : 0) : 0;

  const straight = direct === "ready" && sendable(d, proof);

  /** Reads MyCamu and finds the live passes this one would collide with. */
  function checkClashes(p: PassDraft = d) {
    setBlockers(null);
    fetchHistory()
      .then((list) => setBlockers(clashes(p, list)))
      .catch(() => setBlockers([]));
  }

  /** Times with both AM and PM possible, still not tapped. */
  const unanswered = reading?.asks.filter((a) => a.must) ?? [];

  function blocked(): boolean {
    setTried(true);
    setRefusal(null);
    return !!(problem || reasonMissing || unanswered.length);
  }

  async function save(toCamu: boolean) {
    if (blocked()) return;
    // Straight into MyCamu: one look at the whole pass first.
    if (toCamu && straight) {
      setReview(true);
      checkClashes();
      return;
    }
    setBusy(true);
    const clean = { ...d, reason: reasonOf(d.reason) };
    try {
      const id = await savePass(clean, proof ?? undefined, "manual");
      if (toCamu) {
        const how = await sendToCamu(clean, proof ?? undefined).catch(() => "copied" as const);
        if (how === "copied") toast.show("Details copied — paste them in MyCamu");
      }
      onSaved(id);
    } finally {
      setBusy(false);
    }
  }

  /** After the review: send to MyCamu, then trust only MyCamu's own list. */
  async function send() {
    setReview(false);
    setBusy(true);
    const clean = { ...d, reason: reasonOf(d.reason) };
    try {
      const r = await sendPass(clean, proof);
      if (r.kind === "refused") {
        setRefusal(r.message);
        checkClashes(clean);
        return;
      }
      if (r.kind === "made") {
        const id = await savePass(clean, proof ?? undefined, "manual");
        await v3db.passes.update(id, {
          status: r.status,
          camuId: r.camuId,
          camu: r.record ?? undefined,
          verifiedAt: Date.now(),
          sentByDockIn: true,
          updatedAt: Date.now(),
        });
        if (r.already) toast.show("It was already in MyCamu — not sent again");
        onSaved(id);
        return;
      }
      if (r.why === "unsure") {
        // It may have gone through: save it, but don't open MyCamu to send it twice.
        const id = await savePass(clean, undefined, "manual");
        await v3db.passes.update(id, { sentByDockIn: true, updatedAt: Date.now() });
        toast.show("Couldn't confirm it in MyCamu yet — check before sending again");
        onSaved(id);
        return;
      }
      toast.show(r.why === "expired" ? "MyCamu sign-in ended — opening MyCamu" : "Couldn't reach MyCamu — opening it instead");
      const id = await savePass(clean, undefined, "manual");
      await sendToCamu(clean).catch(() => "copied");
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
        <div className="op-write relative mt-3 rounded-2xl border-[1.5px] border-line bg-surface focus-within:border-accent">
          <textarea
            value={listening ? voice.partial || line : line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                fill();
              }
            }}
            placeholder={listening ? "Listening…" : "e.g. kal 4 baje market jaana hai"}
            aria-label="Describe the pass"
            enterKeyHint="go"
            rows={3}
            className="block min-h-[96px] w-full resize-none bg-transparent px-4 pt-3 pb-12 text-[17px] leading-snug font-semibold outline-none placeholder:font-medium placeholder:text-muted/70"
          />
          <div className="absolute right-2 bottom-2 left-3 flex items-center gap-2">
            <span className="flex-1 truncate text-[11.5px] text-muted">{listening ? "Speak now — Hindi, English or both" : "Hindi, English, Hinglish — all fine"}</span>
            {canListen() && (
              <button
                type="button"
                onClick={() => (listening ? voice.finish() : void voice.start(savedVoiceLang()))}
                aria-label={listening ? "Stop listening" : "Say it"}
                className={cx("grid size-10 place-items-center rounded-full transition", listening ? "op-mic-live bg-danger text-white" : "bg-accent-soft text-accent")}
              >
                <Mic size={18} />
              </button>
            )}
            <button type="button" onClick={() => fill()} className="btn-leather inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px]" aria-label="Fill the form">
              <Wand2 size={16} /> Fill
            </button>
          </div>
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
          {reading.asks.map((a, i) => {
            const current = a.which === "from" ? d.fromTime : d.toTime;
            const waiting = a.must && tried;
            return (
              <div
                key={`${reading.n}-${a.which}`}
                className={cx(
                  "ask-in rounded-2xl border-[1.5px] p-3",
                  waiting ? "border-danger/60 bg-danger-soft/40" : "border-accent/40 bg-accent-soft/50",
                )}
                style={{ animationDelay: `${250 + i * 80}ms` }}
              >
                <p className="text-[13.5px] font-bold">
                  {a.which === "from" ? "Going out at" : "Back by"} {a.said} — AM or PM?
                  {!a.must && <span className="ml-1 font-semibold text-muted">· tap to confirm</span>}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {a.options.map((t, j) => {
                    const ok = a.valid[j];
                    const on = !a.must && ok && current === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={!ok}
                        onClick={() => answer(a, t)}
                        aria-pressed={on}
                        className={cx(
                          "lip-sm inline-flex h-12 flex-col items-center justify-center rounded-xl text-[15px] font-extrabold leading-tight",
                          on ? "btn-leather" : "btn-paper",
                          !ok && "opacity-45",
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {j === 0 ? <Sunrise size={16} className={on ? "" : "text-warn"} /> : <Moon size={15} className={on ? "" : "text-accent"} />}
                          {fmtTime(t).toUpperCase()}
                        </span>
                        {!ok && <span className="text-[10.5px] font-bold text-muted">{t > DAYOUT_END ? "after 7 PM" : t < PASS_START ? "before 6 AM" : "not possible"}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
                <span
                  className={cx(
                    "grid size-10 place-items-center rounded-xl text-white shadow-[0_3px_8px_-3px_rgb(60_20_5/0.5)]",
                    k === "dayout" ? "bg-[linear-gradient(135deg,#ffb347,#e8772e)]" : "bg-[linear-gradient(135deg,#3fb6a8,#227a8a)]",
                  )}
                >
                  <Icon size={20} />
                </span>
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
          <p className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-muted">
            Reason {!d.reason.trim() && <span className="text-[11.5px]">none picked → “{DEFAULT_REASON}”</span>}
          </p>
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

        {d.kind === "dayout" && direct && direct !== "ready" && direct !== "web" && (
          <p className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-[12.5px] text-muted">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" /> {DIRECT_WHY[direct]}
          </p>
        )}

        {tried && (problem || reasonMissing || unanswered.length > 0) && (
          <p className="anim-pop text-[13px] font-semibold text-danger">
            {problem ?? (unanswered.length ? `Tap AM or PM for ${unanswered[0].said} above.` : "Pick or write a reason.")}
          </p>
        )}

      </div>

      <Sheet open={review} onClose={() => setReview(false)} title="Send this to MyCamu?">
        <div className="space-y-4 pb-1">
          <div className="pass-ticket overflow-hidden rounded-2xl border-[1.5px] border-card-edge bg-card text-center">
            <p className="pt-4 text-[12px] font-bold tracking-[0.12em] text-muted uppercase">{d.kind === "dayout" ? "Day Out Pass" : "Leave Out Pass"}</p>
            {d.fromDate === d.toDate ? (
              <>
                <p className="font-display mt-1 text-[22px] font-extrabold">{dayShort(d.fromDate)}</p>
                <p className="font-display text-[30px] leading-tight font-extrabold tnum">
                  {fmtTime(d.fromTime)} <span className="text-muted">→</span> {fmtTime(d.toTime)}
                </p>
              </>
            ) : (
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
                <div>
                  <p className="font-display text-[19px] font-extrabold">{dayShort(d.fromDate)}</p>
                  <p className="text-[15px] font-bold text-muted">{fmtTime(d.fromTime)}</p>
                </div>
                <span className="text-[22px] text-muted">→</span>
                <div>
                  <p className="font-display text-[19px] font-extrabold">{dayShort(d.toDate)}</p>
                  <p className="text-[15px] font-bold text-muted">{fmtTime(d.toTime)}</p>
                </div>
              </div>
            )}
            <div className="mx-4 my-3 border-t-2 border-dashed border-line" />
            <p className={cx("px-4 text-[15px] font-bold", d.kind === "dayout" ? "pb-4" : "pb-1")}>“{reasonOf(d.reason)}”</p>
            {d.kind === "leave" && (
              <p className="inline-flex items-center gap-1 pb-4 text-[12.5px] font-bold text-safe">
                <ImagePlus size={14} /> Mail screenshot goes with it
              </p>
            )}
          </div>
          <Clashes blockers={blockers} onChange={() => checkClashes()} />
          <p className="text-center text-[12.5px] text-muted">DockIn sends it, then reads it back from MyCamu to check every field.</p>
          <div className="grid grid-cols-[1fr_1.6fr] gap-2">
            <button type="button" onClick={() => setReview(false)} className="btn-paper h-12 rounded-2xl text-[14.5px] font-bold">
              Change
            </button>
            <button
              type="button"
              disabled={!!blockers?.length}
              onClick={() => void send()}
              className="btn-leather inline-flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] disabled:opacity-50"
            >
              <Send size={17} /> {blockers?.length ? "Cancel the clash first" : "Yes, send it"}
            </button>
          </div>
        </div>
      </Sheet>

      {/* actions */}
      <div className="glass-bar fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md flex-wrap gap-2 px-4 pt-2.5 pb-[max(0.875rem,var(--sab))]">
      {refusal && (
        <div className="anim-pop mb-2 basis-full rounded-2xl border-[1.5px] border-danger/50 bg-danger-soft p-3" role="alert">
          <p className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-danger">
            <XCircle size={16} /> MyCamu didn&apos;t take it
          </p>
          <p className="mt-1 text-[13px]">{refusal}</p>
          {!!blockers?.length && (
            <div className="mt-2">
              <Clashes blockers={blockers} onChange={() => checkClashes()} />
            </div>
          )}
          <button
            type="button"
            onClick={() => void sendToCamu({ ...d, reason: reasonOf(d.reason) })}
            className="btn-paper lip-sm mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px]"
          >
            <ExternalLink size={14} /> Open MyCamu
          </button>
        </div>
      )}
        <button type="button" disabled={busy} onClick={() => void save(false)} className="btn-paper h-12 flex-1 rounded-2xl text-[14.5px] font-bold">
          Save only
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(true)}
          className="btn-leather inline-flex h-12 flex-[1.7] items-center justify-center gap-2 rounded-2xl text-[15px]"
        >
          {busy ? <RefreshCw size={17} className="animate-spin" /> : <Send size={17} />}{" "}
          {busy && straight ? "Sending to MyCamu…" : straight ? "Submit to MyCamu" : "Make the pass"}
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
  const sent = !!p.sentByDockIn;
  return (
    <div className="flex flex-col items-center px-5 pt-5 pb-10 text-center">
      <div className="anim-pop">
        <DockBot mood="happy" size={96} />
      </div>
      <h2 className="font-display mt-1 text-[22px] font-extrabold">{sent ? "Sent to MyCamu" : "Your pass is ready"}</h2>
      <p className="mt-1 max-w-[19rem] text-[13.5px] text-muted">
        {sent ? "It's in MyCamu's list. Now it just needs approval." : "Two quick steps left — both in MyCamu."}
      </p>

      <div className="relative mt-4 w-full">
        <div className="pass-print">
          <Ticket p={p} />
        </div>
        <span className="pass-stamp pointer-events-none absolute top-3 right-4 rounded-md border-[2.5px] border-safe px-2 py-0.5 text-[13px] font-black tracking-[0.14em] text-safe uppercase">
          {sent && p.status === "applied" ? "Sent" : applied ? STATUS_LABEL[p.status].split(" ")[0] : "Ready"}
        </span>
      </div>

      {sent && (
        <div className="mt-4 w-full">
          <VerifyCard p={p} />
        </div>
      )}

      <ol className="mt-5 w-full space-y-2.5 text-left">
        {sent ? (
          <Step n={1} done title="Submitted in MyCamu" delay={380}>
            <p className="text-[12.5px] text-muted">DockIn sent it and found it in MyCamu&apos;s list.</p>
          </Step>
        ) : (
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
        )}
        <Step n={2} title="Get it approved" delay={520}>
          <p className="text-[12.5px] text-muted">Approve it yourself with your college approval login, or send your parents a ready message.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ApproveNow camuId={p.camuId} />
            <button
              type="button"
              onClick={() => void shareText(parentText(p), "Send to parents")}
              className="btn-paper lip-sm inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px]"
            >
              <Share2 size={15} /> Tell parents
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

/** "This one is in the way" — the overlapping MyCamu passes, each cancellable right here. */
function Clashes({ blockers, onChange }: { blockers: CamuPass[] | null; onChange: () => void }) {
  if (blockers === null) {
    return (
      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-muted">
        <RefreshCw size={13} className="animate-spin" /> Checking MyCamu for clashes…
      </p>
    );
  }
  if (!blockers.length) return null;
  return (
    <div className="anim-pop space-y-2 rounded-2xl border-[1.5px] border-warn/60 bg-warn-soft/50 p-3 text-left" role="alert" aria-label="Clashes in MyCamu">
      <p className="text-[13.5px] font-extrabold">
        {blockers.length === 1 ? "This pass in MyCamu overlaps it:" : `These ${blockers.length} passes in MyCamu overlap it:`}
      </p>
      <p className="-mt-1 text-[12px] text-muted">MyCamu won&apos;t take a new one over it. Cancel it here, or pick another time.</p>
      {blockers.map((c) => (
        <div key={c.id} className="space-y-1.5">
          <CamuTicket c={c} />
          {cancellable(c) ? (
            <CancelPass c={c} onDone={onChange} />
          ) : (
            <p className="text-[12px] font-semibold text-muted">This one can&apos;t be cancelled from DockIn (already in use).</p>
          )}
        </div>
      ))}
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
      className="pass-ticket relative block w-full overflow-hidden rounded-2xl border-[1.5px] border-card-edge bg-card text-left shadow-[0_3px_0_var(--pbtn-lip)] transition active:scale-[0.99]"
    >
      <span
        aria-hidden
        className={cx(
          "absolute inset-y-0 left-0 w-1.5",
          p.status === "approved" ? "bg-safe" : p.status === "cancelled" || p.status === "rejected" ? "bg-danger" : p.status === "applied" ? "bg-warn" : "bg-line",
        )}
      />
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <span
          className={cx(
            "grid size-11 shrink-0 place-items-center rounded-xl text-white",
            p.kind === "dayout" ? "bg-[linear-gradient(135deg,#ffb347,#e8772e)]" : "bg-[linear-gradient(135deg,#3fb6a8,#227a8a)]",
          )}
        >
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
        <span className="text-[11.5px] text-muted">{p.sentByDockIn ? "sent by DockIn" : p.proof ? "with mail screenshot" : p.via === "assistant" ? "via DockBot" : "made in DockIn"}</span>
      </div>
    </Body>
  );
}

const dayShort = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

// ------------------------------------------------------------------ history

function History({ focus, onFocusDone, onNew }: { focus: string | null; onFocusDone: () => void; onNew: () => void }) {
  const passes = useLiveQuery(() => v3db.passes.orderBy("createdAt").reverse().toArray(), []);
  const [openId, setOpenId] = useState<string | null>(focus);
  const [openCamu, setOpenCamu] = useState<CamuPass | null>(null);
  const [filter, setFilter] = useState<"all" | PassKind>("all");
  const [status, setStatus] = useState<StatusGroup | "all">("all");
  /** MyCamu's own list: shown from the last read at once, then refreshed. */
  const [camu, setCamu] = useState<{ at: number; items: CamuPass[] } | null>(() => cachedHistory());
  const native = isNativeApp();
  const [loading, setLoading] = useState(native);
  const [offline, setOffline] = useState(false);
  const toast = useToast();

  async function load(loud: boolean) {
    if (!native) return;
    setLoading(true);
    try {
      const items = await fetchHistory();
      setCamu({ at: Date.now(), items });
      setOffline(false);
      // DockIn's own copies follow MyCamu.
      await refreshFromCamu(await v3db.passes.toArray()).catch(() => 0);
      if (loud) toast.show("Up to date with MyCamu");
    } catch {
      setOffline(true);
      if (loud) toast.show("Couldn't reach MyCamu");
    } finally {
      setLoading(false);
    }
  }

  // Read MyCamu as History opens (the cached list shows meanwhile).
  useEffect(() => {
    if (!isNativeApp()) return;
    let gone = false;
    fetchHistory()
      .then(async (items) => {
        if (gone) return;
        setCamu({ at: Date.now(), items });
        setOffline(false);
        await refreshFromCamu(await v3db.passes.toArray()).catch(() => 0);
      })
      .catch(() => {
        if (!gone) setOffline(true);
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, []);

  const today = toDateStr();
  if (!passes) return null;
  const fromCamu = camu?.items ?? null;
  const pick = <T extends { kind: string }>(xs: T[]) => (filter === "all" ? xs : xs.filter((x) => x.kind === filter));
  const byStatus = <T,>(xs: T[], group: (x: T) => StatusGroup) => (status === "all" ? xs : xs.filter((x) => group(x) === status));

  // Passes only DockIn knows about (saved, or not found in MyCamu).
  const onlyHereAll = pick(fromCamu ? passes.filter((p) => !inCamu(p, fromCamu)) : passes);
  const onlyHere = byStatus(onlyHereAll, localGroup);
  const current = passes.find((p) => p.id === openId) ?? null;

  if (!passes.length && !fromCamu?.length) {
    return (
      <div className="flex flex-col items-center px-6 pt-12 pb-10 text-center">
        <div className="anim-float">
          <DockBot size={110} />
        </div>
        <h2 className="font-display mt-3 text-[20px] font-extrabold">{loading ? "Reading MyCamu…" : "No outpasses yet"}</h2>
        <p className="mt-1 text-[13.5px] text-muted">Make one in a few seconds — just type “kal 4 baje market”.</p>
        <button type="button" onClick={onNew} className="btn-leather mt-5 h-11 rounded-2xl px-5">
          Make a pass
        </button>
        <TeachCamu />
      </div>
    );
  }

  const month = today.slice(0, 7);
  const counted = fromCamu
    ? fromCamu.filter((c) => c.fromDate.slice(0, 7) === month && c.state !== "cancelled" && c.kind !== "other")
    : passes.filter((p) => p.fromDate.slice(0, 7) === month && p.status !== "cancelled");
  const camuKind = fromCamu ? pick(fromCamu) : [];
  const camuShown = byStatus(camuKind, camuGroup);
  // How many of each, for the status chips (only the ones that exist).
  const groupCount = new Map<StatusGroup, number>();
  for (const c of camuKind) groupCount.set(camuGroup(c), (groupCount.get(camuGroup(c)) ?? 0) + 1);
  for (const p of onlyHereAll) groupCount.set(localGroup(p), (groupCount.get(localGroup(p)) ?? 0) + 1);
  const camuLive = camuShown.filter((c) => c.toDate >= today && c.state !== "cancelled" && c.state !== "rejected" && c.state !== "back");
  const camuPast = camuShown.filter((c) => !camuLive.includes(c));
  const localLive = onlyHere.filter((p) => p.toDate >= today && p.status !== "cancelled" && p.status !== "rejected");
  const localPast = onlyHere.filter((p) => !localLive.includes(p));

  return (
    <div className="space-y-5 px-4 pt-3 pb-10">
      <div className="grid grid-cols-3 gap-2">
        <Count label="This month" value={counted.length} />
        <Count label="Day outs" value={counted.filter((p) => p.kind === "dayout").length} tone="amber" />
        <Count label="Leaves" value={counted.filter((p) => p.kind === "leave").length} tone="teal" />
      </div>
      <div className="flex items-center gap-1.5">
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
        {native && (
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            aria-label="Refresh from MyCamu"
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-bold text-accent"
          >
            <RefreshCw size={14} className={cx(loading && "animate-spin")} /> MyCamu
          </button>
        )}
      </div>

      {groupCount.size > 1 && (
        <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Status">
          {(["all", ...GROUPS.filter((g) => groupCount.has(g))] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setStatus(g)}
              aria-pressed={status === g}
              className={cx(
                "lip-sm inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] transition",
                status === g ? "btn-leather" : "btn-paper",
              )}
            >
              {g === "all" ? "Any status" : GROUP_LABEL[g]}
              {g !== "all" && <span className="tnum opacity-70">{groupCount.get(g)}</span>}
            </button>
          ))}
        </div>
      )}

      {fromCamu && (
        <p className="-mt-2 px-1 text-[11.5px] text-muted">
          From MyCamu · {offline ? "offline, showing " : ""}updated {new Date(camu!.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </p>
      )}

      {camuLive.length + localLive.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 px-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
            <span className="live-dot size-2 rounded-full bg-safe" /> Upcoming & active
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular-nums">{camuLive.length + localLive.length}</span>
          </h3>
          <div className="space-y-3">
            {camuLive.map((c, i) => (
              <div key={c.id} className="ask-in" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="live-ring rounded-[18px]">
                  <CamuTicket c={c} onClick={() => setOpenCamu(c)} />
                </div>
              </div>
            ))}
            {localLive.map((p, i) => (
              <div key={p.id} className="ask-in" style={{ animationDelay: `${(camuLive.length + i) * 50}ms` }}>
                <Ticket p={p} onClick={() => setOpenId(p.id)} />
              </div>
            ))}
          </div>
        </section>
      )}
      {camuPast.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Past · from MyCamu</h3>
          <div className="space-y-3">
            {camuPast.slice(0, 60).map((c) => (
              <div key={c.id} className="opacity-85">
                <CamuTicket c={c} onClick={() => setOpenCamu(c)} />
              </div>
            ))}
          </div>
        </section>
      )}
      {localPast.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">{fromCamu ? "Only in DockIn" : "Past"}</h3>
          <div className="space-y-3 opacity-80">
            {localPast.map((p) => (
              <Ticket key={p.id} p={p} onClick={() => setOpenId(p.id)} />
            ))}
          </div>
        </section>
      )}
      {!camuShown.length && !onlyHere.length && <p className="py-6 text-center text-[13.5px] text-muted">None of these yet.</p>}
      <TeachCamu />
      <PassSheet
        p={current}
        onClose={() => {
          setOpenId(null);
          onFocusDone();
        }}
      />
      <CamuPassSheet c={openCamu} onClose={() => setOpenCamu(null)} />
    </div>
  );
}

/** History's status groups, in the order the chips show. */
type StatusGroup = "submitted" | "approved" | "running" | "completed" | "cancelled" | "rejected" | "notsent";
const GROUPS: StatusGroup[] = ["submitted", "approved", "running", "completed", "cancelled", "rejected", "notsent"];
const GROUP_LABEL: Record<StatusGroup, string> = {
  submitted: "Submitted",
  approved: "Approved",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  notsent: "Not sent",
};
const camuGroup = (c: CamuPass): StatusGroup =>
  c.state === "applied" ? "submitted" : c.state === "out" ? "running" : c.state === "back" ? "completed" : c.state;
const localGroup = (p: PassRecord): StatusGroup =>
  p.status === "saved" ? "notsent" : p.status === "applied" ? "submitted" : p.status;

function Count({ label, value, tone = "accent" }: { label: string; value: number; tone?: "accent" | "amber" | "teal" }) {
  const t = { accent: "#9a4d1f", amber: "#e8772e", teal: "#227a8a" }[tone];
  return (
    <div className="tile-tint rounded-2xl px-3 py-2.5" style={{ "--tint": t } as React.CSSProperties}>
      <p className="font-display text-[24px] leading-none font-extrabold tnum" style={{ color: t }}>
        {value}
      </p>
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
  const parts = notes && anything ? notesParts(notes) : [];
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
              onClick={() => notes && void shareText(notesParts(notes)[0], "Share with DockIn team")}
              className="btn-paper lip-sm inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] disabled:opacity-50"
            >
              <Share2 size={15} /> {parts.length > 1 ? "Share part 1" : "Share with team"}
            </button>
          </div>
          {parts.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {parts.slice(1).map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void shareText(t, "Share with DockIn team")}
                  className="btn-paper lip-sm inline-flex h-9 items-center justify-center gap-1 rounded-xl text-[12.5px]"
                >
                  <Share2 size={13} /> Part {i + 2}
                </button>
              ))}
            </div>
          )}
          {parts.length > 1 && <p className="text-[12px] text-muted">Send every part — {parts.length} in all.</p>}
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
