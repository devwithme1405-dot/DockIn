"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  DoorOpen,
  ImagePlus,
  MapPin,
  Pencil,
  SquareCheckBig,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { fmtTime, relativeDayLabel, toDateStr } from "@/lib/dates";
import { needsProof } from "@/lib/outpass";
import { goTab } from "@/lib/tabs";
import { cancelCard, confirmCard, send } from "@/lib/v3/brain";
import { v3db, type Card, type PassRecord } from "@/lib/v3/store";
import { openOutpass } from "@/lib/v3/ui";
import { cx } from "../ui";
import { passDay, PassStatusChip } from "./passParts";

const STATE_TONE: Record<string, string> = {
  safe: "text-safe",
  warn: "text-warn",
  danger: "text-danger",
  none: "text-muted",
};
const STATE_FILL: Record<string, string> = {
  safe: "bg-safe",
  warn: "bg-warn",
  danger: "bg-danger",
  none: "bg-muted",
};

/** A small round progress ring (no count-up: cards appear many times in a chat). */
function MiniRing({ pct, target, state, size = 66 }: { pct: number | null; target: number; state: string; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct ?? 0));
  const color = state === "danger" ? "var(--danger)" : state === "warn" ? "var(--warn)" : "var(--safe)";
  const t = (target / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--groove)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dasharray] duration-700"
      />
      <line
        x1={size / 2 + Math.cos(t) * (r - 6)}
        y1={size / 2 + Math.sin(t) * (r - 6)}
        x2={size / 2 + Math.cos(t) * (r + 6)}
        y2={size / 2 + Math.sin(t) * (r + 6)}
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.22} fontWeight="800" fill="var(--text)">
        {pct === null ? "—" : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}

function CardShell({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="ask-card-in mt-2 overflow-hidden rounded-2xl border-[1.5px] border-card-edge bg-card shadow-[0_3px_0_var(--pbtn-lip)]">
      <div className="flex items-center gap-2 border-b border-dashed border-line px-3.5 py-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">{icon}</span>
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{title}</p>
        {action}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

function OpenLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-accent">
      {label} <ArrowRight size={13} />
    </button>
  );
}

export function AskCard({ card, msgId, index, onClose }: { card: Card; msgId: string; index: number; onClose: () => void }) {
  switch (card.kind) {
    case "attendance": {
      const focus = card.focus ? card.subjects.find((s) => s.code === card.focus || s.name === card.focus) : null;
      const list = focus ? [focus] : [...card.subjects].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 5);
      const head = focus ?? card.overall;
      return (
        <CardShell
          icon={<SquareCheckBig size={15} />}
          title={focus ? focus.name : "Attendance"}
          action={
            <OpenLink
              label="Open"
              onClick={() => {
                onClose();
                goTab("/attendance");
              }}
            />
          }
        >
          {head && (
            <div className="flex items-center gap-3.5">
              <MiniRing pct={head.pct} target={card.target} state={head.state} />
              <div className="min-w-0">
                <p className={cx("text-[15px] font-extrabold", STATE_TONE[head.state])}>
                  {head.mustAttend > 0 ? `Attend next ${head.mustAttend}` : `Can skip ${head.canMiss}`}
                </p>
                <p className="text-[12.5px] text-muted">
                  {head.present}/{head.total} classes · target {card.target}%
                </p>
              </div>
            </div>
          )}
          {!focus && list.length > 0 && (
            <ul className="mt-3 space-y-2">
              {list.map((s) => (
                <li key={s.code || s.name}>
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="truncate font-semibold">{s.name}</span>
                    <span className={cx("shrink-0 font-bold tabular-nums", STATE_TONE[s.state])}>
                      {s.pct === null ? "—" : `${s.pct.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-groove">
                    <div className={cx("h-full rounded-full", STATE_FILL[s.state])} style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} />
                    <div className="absolute top-0 h-full w-0.5 bg-ink/70" style={{ left: `${card.target}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      );
    }

    case "whatif": {
      const safe = card.after >= card.target;
      return (
        <CardShell icon={<SquareCheckBig size={15} />} title={`If you skip ${card.skip} · ${card.name}`}>
          <div className="flex items-center justify-center gap-3">
            <div className="text-center">
              <p className="text-[22px] font-extrabold tabular-nums">{card.before.toFixed(1)}%</p>
              <p className="text-[11.5px] text-muted">now</p>
            </div>
            <ArrowRight className="text-muted" size={20} />
            <div className="text-center">
              <p className={cx("text-[22px] font-extrabold tabular-nums", safe ? "text-safe" : "text-danger")}>{card.after.toFixed(1)}%</p>
              <p className="text-[11.5px] text-muted">after</p>
            </div>
          </div>
          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-groove">
            <div className={cx("h-full rounded-full", safe ? "bg-safe" : "bg-danger")} style={{ width: `${Math.min(100, card.after)}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${card.target}%` }} />
          </div>
          <p className={cx("mt-2 text-center text-[12.5px] font-bold", safe ? "text-safe" : "text-danger")}>
            {safe ? `Still above ${card.target}% ✓` : `Below your ${card.target}% target`}
          </p>
        </CardShell>
      );
    }

    case "classes":
      return (
        <CardShell
          icon={<CalendarDays size={15} />}
          title={`${card.label} · ${card.items.length} ${card.items.length === 1 ? "class" : "classes"}`}
          action={
            <OpenLink
              label="Timetable"
              onClick={() => {
                onClose();
                goTab("/timetable");
              }}
            />
          }
        >
          {card.items.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing on this day.</p>
          ) : (
            <ol className="relative space-y-2.5 border-l-2 border-dashed border-line pl-3.5">
              {card.items.map((c, i) => (
                <li key={`${c.from}-${i}`} className="relative">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-orange ring-[3px] ring-card" />
                  <p className="text-[12px] font-bold text-accent tabular-nums">
                    {fmtTime(c.from)} – {fmtTime(c.to)}
                  </p>
                  <p className="text-[13.5px] leading-snug font-semibold">{c.name}</p>
                  {c.room && (
                    <p className="flex items-center gap-1 text-[12px] text-muted">
                      <MapPin size={11} /> {c.room}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardShell>
      );

    case "mess":
      return (
        <CardShell
          icon={<UtensilsCrossed size={15} />}
          title="Mess menu"
          action={
            <OpenLink
              label="Cafeteria"
              onClick={() => {
                onClose();
                goTab("/cafeteria");
              }}
            />
          }
        >
          <div className="space-y-2.5">
            {card.meals.map((m) => (
              <div key={m.meal}>
                <p className="text-[12.5px] font-bold text-accent">{m.label || m.meal}</p>
                <p className="text-[13px] leading-snug whitespace-pre-line">
                  {m.items
                    .split("\n")
                    .map((x) => x.replace(/\(.*?kcal.*?\)/i, "").trim())
                    .filter(Boolean)
                    .slice(0, 6)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </CardShell>
      );

    case "tasks": {
      const today = toDateStr();
      return (
        <CardShell
          icon={<SquareCheckBig size={15} />}
          title={`${card.label} · ${card.items.length}`}
          action={
            <OpenLink
              label="Tasks"
              onClick={() => {
                onClose();
                goTab("/tasks");
              }}
            />
          }
        >
          <ul className="divide-y divide-dashed divide-line">
            {card.items.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                <span className="size-2 shrink-0 rounded-full bg-orange" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{t.title}</span>
                {t.due && (
                  <span className={cx("shrink-0 text-[12px] font-bold", t.due < today ? "text-danger" : "text-muted")}>
                    {relativeDayLabel(t.due, today)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardShell>
      );
    }

    case "suggest":
      return (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.items.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              className="ask-chip btn-paper lip-sm rounded-full px-3 py-1.5 text-[13px]"
              style={{ animationDelay: `${120 + i * 60}ms` }}
            >
              {s}
            </button>
          ))}
        </div>
      );

    case "passes":
      return <PassesCard ids={card.ids} onClose={onClose} />;

    case "open":
      return null;

    case "confirm":
      return <ConfirmCard card={card} msgId={msgId} index={index} onClose={onClose} />;
  }
}

function PassesCard({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const passes = useLiveQuery(async () => (await v3db.passes.bulkGet(ids)).filter(Boolean) as PassRecord[], [ids.join()]);
  if (!passes?.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {passes.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            onClose();
            openOutpass("history", undefined, p.id);
          }}
          className="ask-card-in pass-ticket flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-card-edge bg-card px-4 py-3 text-left shadow-[0_3px_0_var(--pbtn-lip)]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <DoorOpen size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold">{p.kind === "dayout" ? "Day Out Pass" : `${p.leaveType} · Leave Out Pass`}</span>
            <span className="block truncate text-[12.5px] text-muted">{passDay(p)}</span>
          </span>
          <PassStatusChip status={p.status} />
        </button>
      ))}
    </div>
  );
}

function ConfirmCard({
  card,
  msgId,
  index,
  onClose,
}: {
  card: Extract<Card, { kind: "confirm" }>;
  msgId: string;
  index: number;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const a = card.action;
  const done = card.state === "done";
  const cancelled = card.state === "cancelled";
  const proofImg = useLiveQuery(
    async () => (a.type === "outpass" && a.proofMsg ? (await v3db.ask.get(a.proofMsg))?.image : undefined),
    [a.type === "outpass" ? a.proofMsg : ""],
  );
  const wantProof = a.type === "outpass" && needsProof(a.draft);
  const missingProof = wantProof && !a.proofMsg;

  async function go() {
    setBusy(true);
    try {
      await confirmCard(msgId, index);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cx(
        "ask-card-in relative mt-2 overflow-hidden rounded-2xl border-[1.5px] bg-card shadow-[0_3px_0_var(--pbtn-lip)]",
        done ? "border-safe/50" : "border-card-edge",
        cancelled && "opacity-55",
      )}
    >
      {a.type === "task" ? (
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <SquareCheckBig size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-bold tracking-[0.06em] text-muted uppercase">New task</p>
            <p className="text-[15px] leading-snug font-bold">{a.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted">
              <Clock3 size={12} />
              {a.dueDate ? relativeDayLabel(a.dueDate, toDateStr()) : "No date"}
              {a.dueTime ? ` · ${fmtTime(a.dueTime)}` : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <DoorOpen size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-bold tracking-[0.06em] text-muted uppercase">
                {a.draft.kind === "dayout" ? "Day Out Pass" : `Leave Out Pass · ${a.draft.leaveType}`}
              </p>
              <p className="text-[15px] leading-snug font-bold">{passDay(a.draft)}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-muted">Reason: {a.draft.reason}</p>
            </div>
            {!done && !cancelled && (
              <button
                type="button"
                aria-label="Edit"
                onClick={() => {
                  onClose();
                  openOutpass("new", a.draft);
                }}
                className="btn-paper grid size-9 shrink-0 place-items-center rounded-full text-muted"
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
          {wantProof && (
            <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-dashed border-line bg-surface px-3 py-2">
              {proofImg ? (
                <ProofThumb blob={proofImg} />
              ) : (
                <span className="grid size-10 place-items-center rounded-lg bg-warn-soft text-warn">
                  <ImagePlus size={18} />
                </span>
              )}
              <p className="min-w-0 flex-1 text-[12.5px] leading-snug">
                {proofImg ? "Parent-approval mail attached ✓" : "Camu needs the parent-approval mail screenshot"}
              </p>
              {missingProof && !cancelled && (
                <>
                  <button type="button" onClick={() => pick.current?.click()} className="btn-leather lip-sm h-8 shrink-0 rounded-full px-3 text-[12.5px]">
                    Attach
                  </button>
                  <input
                    ref={pick}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void send("", f);
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {card.state === "waiting" ? (
        <div className="flex gap-2 border-t border-dashed border-line px-3 py-2.5">
          <button
            type="button"
            onClick={() => void cancelCard(msgId, index)}
            className="btn-paper inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px]"
          >
            <X size={16} /> Cancel
          </button>
          <button
            type="button"
            disabled={busy || missingProof}
            onClick={() => void go()}
            className="btn-leather inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-xl text-[14px] disabled:opacity-50"
          >
            <Check size={16} /> {a.type === "outpass" ? "Confirm & open MyCamu" : "Confirm"}
          </button>
        </div>
      ) : (
        <div className={cx("flex items-center gap-1.5 border-t border-dashed border-line px-4 py-2.5 text-[13px] font-bold", done ? "text-safe" : "text-muted")}>
          {done ? <CheckCircle2 size={16} /> : <X size={16} />}
          {done ? (a.type === "outpass" ? "Saved in Outpass" : "Added to Tasks") : "Cancelled"}
        </div>
      )}
      {done && (
        <span className="pass-stamp pointer-events-none absolute right-3 bottom-2 rounded-md border-2 border-safe px-1.5 py-0.5 text-[11px] font-black tracking-[0.12em] text-safe uppercase">
          Done
        </span>
      )}
    </div>
  );
}

export function ProofThumb({ blob, size = 40 }: { blob: Blob; size?: number }) {
  const url = useBlobUrl(blob);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} />;
}

/** An object URL for a blob, freed when it changes or the component goes. */
export function useBlobUrl(blob: Blob | undefined): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
