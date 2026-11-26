"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  DoorOpen,
  ExternalLink,
  House,
  ImagePlus,
  Info,
  Sun,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { useBackClose } from "@/lib/backClose";
import { addDays, fmtTime, toDateStr } from "@/lib/dates";
import { DAYOUT_END, needsProof, parsePass, type LeaveType, type PassDraft } from "@/lib/outpass";
import { openInCamu } from "@/lib/v3/brain";
import { v3db, type PassRecord, type PassStatus } from "@/lib/v3/store";
import { passProblem, savePass, tidyPass } from "@/lib/v3/tools";
import { closeOutpass, openAssistant, openOutpass, useV3Screens } from "@/lib/v3/ui";
import { Segmented } from "../Paper";
import { Sheet, cx, inputCls, useToast } from "../ui";
import { useBlobUrl } from "./AskCards";
import { DockBot } from "./DockBot";
import { passDay, PassStatusChip, STATUS_LABEL } from "./passParts";

const EXAMPLES = ["Kal 3 baje day outpass", "Aaj 4pm se day out", "6-10 dec leave for home", "Medical leave 2 to 4 dec"];
const LEAVE_TYPES: LeaveType[] = ["Leave", "On Duty", "Medical"];

function blank(): PassDraft {
  const now = new Date();
  const mins = Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes() + 30) / 30) * 30, 18 * 60);
  const from = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const today = toDateStr(now);
  return { kind: "dayout", leaveType: "Leave", fromDate: today, fromTime: from, toDate: today, toTime: DAYOUT_END, reason: "" };
}

/**
 * Outpass: make a day out or leave out pass, by typing it in plain words or
 * filling the form, and keep a history of them. Saving opens MyCamu signed in
 * with the details pinned on top, so applying there is a copy, not a chore.
 * Approval happens in MyCamu, by whoever approves — never by DockIn.
 */
export function Outpass() {
  const { pass } = useV3Screens();
  const open = !!pass;
  useBackClose(open, closeOutpass);
  if (!pass || typeof document === "undefined") return null;
  return createPortal(<OutpassScreen key={`${pass.tab}-${pass.draft?.fromDate ?? ""}-${pass.focus ?? ""}`} start={pass} />, document.body);
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
        <button
          type="button"
          onClick={() => {
            closeOutpass();
            openAssistant();
          }}
          aria-label="Ask DockBot"
          className="btn-paper flex h-10 items-center gap-1 rounded-full pr-3 pl-1"
        >
          <DockBot size={30} />
          <span className="text-[13px] font-bold">Ask</span>
        </button>
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
          <NewPass initial={start.draft} onSaved={setSaved} />
        ) : (
          <History focus={focus} onFocusDone={() => setFocus(null)} onNew={() => setTab("new")} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ new pass

function NewPass({ initial, onSaved }: { initial?: PassDraft; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [d, setD] = useState<PassDraft>(() => (initial ? tidyPass(initial) : blank()));
  const [line, setLine] = useState("");
  const [proof, setProof] = useState<Blob | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const proofUrl = useBlobUrl(proof ?? undefined);
  const today = toDateStr();

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
  }

  function fill(text = line) {
    if (!text.trim()) return;
    setLine(text);
    const p = parsePass(text);
    setD({ ...p, reason: p.reason === "." ? "" : p.reason });
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
  }

  const problem = passProblem({ ...d, reason: d.reason || "x" }, !!proof);
  const reasonMissing = !d.reason.trim();

  async function save(openCamu: boolean) {
    setTried(true);
    if (problem || reasonMissing) return;
    setBusy(true);
    try {
      const id = await savePass(d, proof ?? undefined, "manual");
      if (openCamu) {
        const how = await openInCamu(tidyPass(d)).catch(() => "copied" as const);
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
      <div className="rounded-2xl border-[1.5px] border-card-edge bg-card p-3 shadow-[0_3px_0_var(--pbtn-lip)]">
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
          <Wand2 size={15} className="text-accent" /> Say it like you would to a friend
        </p>
        <div className="flex gap-2">
          <input
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fill()}
            placeholder="kal 3 baje day out…"
            className={cx(inputCls, "h-11 flex-1 text-[15px]")}
          />
          <button type="button" onClick={() => fill()} className="btn-leather grid size-11 shrink-0 place-items-center rounded-xl" aria-label="Fill the form">
            <Wand2 size={18} />
          </button>
        </div>
        <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => fill(x)} className="btn-paper lip-sm shrink-0 rounded-full px-3 py-1.5 text-[12.5px]">
              {x}
            </button>
          ))}
        </div>
      </div>

      <div className={cx("mt-4 space-y-4 transition", flash && "animate-[pop_.5s_ease]")}>
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
                className={cx(
                  "relative flex flex-col items-start gap-1.5 rounded-2xl p-3.5 text-left transition",
                  on ? "btn-leather" : "btn-paper",
                )}
              >
                <Icon size={22} className={on ? "text-[#ffd59e]" : "text-accent"} />
                <span className="text-[15.5px] font-extrabold">{title}</span>
                <span className={cx("text-[12px] leading-tight", on ? "text-[#f6dcbc]" : "text-muted")}>{sub}</span>
                {on && <CheckCircle2 size={18} className="absolute top-3 right-3 text-[#ffd59e]" />}
              </button>
            );
          })}
        </div>

        {d.kind === "leave" && (
          <div>
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
              <input type="time" value={d.fromTime} onChange={(e) => e.target.value && patch({ fromTime: e.target.value })} className={cx(inputCls, "h-11 w-32 text-[15px]")} />
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
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Reason</span>
          <textarea
            value={d.reason}
            onChange={(e) => patch({ reason: e.target.value })}
            rows={2}
            placeholder={d.kind === "dayout" ? "Market, bank, doctor…" : "Going home, family function…"}
            className={cx("field w-full resize-none px-3.5 py-2.5 text-[15px]", tried && reasonMissing && "ring-2 ring-danger/60")}
          />
        </label>

        {/* proof */}
        {needsProof(d) && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted">Parent-approval mail (screenshot)</p>
            {proof ? (
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {proofUrl && <img src={proofUrl} alt="" className="size-16 rounded-xl object-cover" />}
                <p className="flex-1 text-[13.5px] font-semibold text-safe">Attached ✓</p>
                <button type="button" onClick={() => setProof(null)} className="grid size-9 place-items-center rounded-full text-muted" aria-label="Remove">
                  <X size={17} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => pick.current?.click()}
                className={cx(
                  "flex w-full items-center gap-3 rounded-2xl border-2 border-dashed bg-surface p-4 text-left",
                  tried ? "border-danger/60" : "border-line",
                )}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-warn-soft text-warn">
                  <ImagePlus size={20} />
                </span>
                <span className="flex-1">
                  <span className="block text-[14px] font-bold">Attach the screenshot</span>
                  <span className="block text-[12.5px] text-muted">Camu asks for it with a leave</span>
                </span>
              </button>
            )}
            <input
              ref={pick}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setProof(f);
              }}
            />
          </div>
        )}

        <p className="flex gap-2 rounded-xl bg-accent-soft/60 px-3 py-2.5 text-[12.5px] leading-snug">
          <Info size={15} className="mt-px shrink-0 text-accent" />
          Saving opens MyCamu, signed in, with these details pinned on top to submit there. Approval then happens in MyCamu.
        </p>
        {tried && (problem || reasonMissing) && (
          <p className="text-[13px] font-semibold text-danger">{problem ?? "Write a reason."}</p>
        )}
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
          className="btn-leather inline-flex h-12 flex-[1.6] items-center justify-center gap-2 rounded-2xl text-[15px]"
        >
          <ExternalLink size={17} /> Save & open MyCamu
        </button>
      </div>
    </div>
  );
}

function Saved({ id, onHistory, onAnother }: { id: string; onHistory: () => void; onAnother: () => void }) {
  const p = useLiveQuery(() => v3db.passes.get(id), [id]);
  if (!p) return null;
  return (
    <div className="flex flex-col items-center px-5 pt-6 pb-10 text-center">
      <DockBot mood="happy" size={110} />
      <h2 className="font-display mt-2 text-[22px] font-extrabold">Pass saved</h2>
      <p className="mt-1 max-w-[18rem] text-[13.5px] text-muted">Submit it in MyCamu — the details are pinned on top there. Then mark it applied here.</p>
      <div className="relative mt-5 w-full">
        <Ticket p={p} />
        <span className="pass-stamp pointer-events-none absolute top-3 right-4 rounded-md border-[2.5px] border-safe px-2 py-0.5 text-[13px] font-black tracking-[0.14em] text-safe uppercase">
          Saved
        </span>
      </div>
      <div className="mt-5 grid w-full gap-2">
        <button type="button" onClick={() => void openInCamu(p)} className="btn-leather inline-flex h-12 items-center justify-center gap-2 rounded-2xl">
          <ExternalLink size={17} /> Open MyCamu again
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onHistory} className="btn-paper h-11 rounded-2xl text-[14px] font-bold">
            See history
          </button>
          <button type="button" onClick={onAnother} className="btn-paper h-11 rounded-2xl text-[14px] font-bold">
            New pass
          </button>
        </div>
      </div>
    </div>
  );
}

function Ticket({ p, onClick }: { p: PassRecord; onClick?: () => void }) {
  const Body = onClick ? "button" : "div";
  return (
    <Body
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="pass-ticket block w-full overflow-hidden rounded-2xl border-[1.5px] border-card-edge bg-card text-left shadow-[0_3px_0_var(--pbtn-lip)]"
    >
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <span className={cx("grid size-11 shrink-0 place-items-center rounded-xl", p.kind === "dayout" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>
          {p.kind === "dayout" ? <Sun size={21} /> : <House size={21} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold">{p.kind === "dayout" ? "Day Out Pass" : `Leave · ${p.leaveType}`}</p>
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
        <span className="text-[11.5px] text-muted">{p.via === "assistant" ? "via DockBot" : "filled by you"}</span>
      </div>
    </Body>
  );
}

const dayShort = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

// ------------------------------------------------------------------ history

function History({ focus, onFocusDone, onNew }: { focus: string | null; onFocusDone: () => void; onNew: () => void }) {
  const passes = useLiveQuery(() => v3db.passes.orderBy("createdAt").reverse().toArray(), []);
  const [openId, setOpenId] = useState<string | null>(focus);
  const today = toDateStr();
  if (!passes) return null;
  if (!passes.length) {
    return (
      <div className="flex flex-col items-center px-6 pt-12 text-center">
        <DockBot size={110} />
        <h2 className="font-display mt-3 text-[20px] font-extrabold">No outpasses yet</h2>
        <p className="mt-1 text-[13.5px] text-muted">Make one here, or just tell DockBot “kal 3 baje day out”.</p>
        <button type="button" onClick={onNew} className="btn-leather mt-5 h-11 rounded-2xl px-5">
          Make a pass
        </button>
      </div>
    );
  }
  const live = passes.filter((p) => p.toDate >= today && p.status !== "cancelled" && p.status !== "rejected");
  const past = passes.filter((p) => !live.includes(p));
  const current = passes.find((p) => p.id === openId) ?? null;
  return (
    <div className="space-y-5 px-4 pt-3 pb-10">
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
            <p className="mt-2 text-[12px] text-muted">DockIn will read the real status from MyCamu by itself in a later version.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                void openInCamu(p).then((how) => how === "copied" && toast.show("Details copied — paste them in MyCamu"))
              }
              className="btn-leather inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px]"
            >
              <ExternalLink size={15} /> Open MyCamu
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
              className="btn-paper inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px]"
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
