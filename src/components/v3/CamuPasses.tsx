"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, BadgeCheck, CheckCircle2, Circle, Copy, DoorOpen, House, Loader2, LogIn, LogOut, RefreshCw, ShieldAlert, Stamp, Sun, UserCheck, XCircle } from "lucide-react";
import { DockIn } from "@/lib/native";
import { approvePass, connectApprover, useApproverState } from "@/lib/approver";
import { fmtTime, fromDateStr } from "@/lib/dates";
import type { PassDraft } from "@/lib/outpass";
import { cancelInCamu, cancellable, fetchHistory, findInHistory, markCancelledLocally, verifyPass, type CamuPass, type Check } from "@/lib/v3/pass";
import { v3db, type PassRecord } from "@/lib/v3/store";
import { openOutpass } from "@/lib/v3/ui";
import { Sheet, cx, useToast } from "../ui";

const day = (s: string) => (s ? fromDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "—");
const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";

export const CAMU_STATE: Record<CamuPass["state"], { label: string; tone: string; stripe: string }> = {
  applied: { label: "Waiting for approval", tone: "bg-warn-soft text-warn", stripe: "bg-warn" },
  approved: { label: "Approved", tone: "bg-safe-soft text-safe", stripe: "bg-safe" },
  out: { label: "Running", tone: "bg-run-soft text-run", stripe: "bg-run" },
  back: { label: "Completed", tone: "bg-safe-soft text-safe", stripe: "bg-safe" },
  rejected: { label: "Rejected", tone: "bg-danger-soft text-danger", stripe: "bg-danger" },
  cancelled: { label: "Cancelled", tone: "bg-danger-soft text-danger", stripe: "bg-danger" },
};

export function CamuChip({ state }: { state: CamuPass["state"] }) {
  const s = CAMU_STATE[state];
  return <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap", s.tone)}>{s.label}</span>;
}

/** Applied → parent → out → back, as far as it has got. */
function Steps({ c, big }: { c: CamuPass; big?: boolean }) {
  const steps: { done: boolean; bad?: boolean; label: string; at?: string; icon: typeof Circle }[] = [
    { done: true, label: "Applied", at: c.appliedAt ? (big ? when(c.appliedAt) : "") : "", icon: CheckCircle2 },
    {
      done: c.parent !== "pending",
      bad: c.parent === "rejected",
      label: c.parent === "rejected" ? "Parent said no" : c.parent === "approved" ? `Parent ok${c.parentName && big ? ` · ${c.parentName}` : ""}` : "Parent",
      at: big ? when(c.parentAt) : "",
      icon: UserCheck,
    },
    { done: !!c.outAt, label: c.outAt ? `Out ${clock(c.outAt)}` : "Out", icon: LogOut },
    { done: !!c.inAt, label: c.inAt ? `Back ${clock(c.inAt)}` : "Back", icon: LogIn },
  ];
  if (big) {
    return (
      <ol className="space-y-2.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span className={cx("grid size-8 place-items-center rounded-full", s.bad ? "bg-danger-soft text-danger" : s.done ? "bg-safe-soft text-safe" : "bg-surface-2 text-muted")}>
              <s.icon size={16} />
            </span>
            <span className={cx("flex-1 text-[14px] font-semibold", !s.done && "text-muted")}>{s.label}</span>
            {s.at && <span className="text-[12px] text-muted">{s.at}</span>}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="flex items-center gap-1 overflow-hidden text-[11px] font-semibold">
      {steps.map((s, i) => (
        <span key={s.label} className="flex min-w-0 items-center gap-1">
          {i > 0 && <span className={cx("h-px w-2.5 shrink-0", s.done ? "bg-safe" : "bg-line")} />}
          <span className={cx("truncate", s.bad ? "text-danger" : s.done ? "text-safe" : "text-muted")}>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

/** One pass from MyCamu, as a ticket. */
export function CamuTicket({ c, onClick }: { c: CamuPass; onClick?: () => void }) {
  const Icon = c.kind === "dayout" ? Sun : House;
  return (
    <button
      type="button"
      onClick={onClick}
      className="pass-ticket relative block w-full overflow-hidden rounded-2xl border-[1.5px] border-card-edge bg-card text-left shadow-[0_3px_0_var(--pbtn-lip)] transition active:scale-[0.99]"
    >
      <span aria-hidden className={cx("absolute inset-y-0 left-0 w-1.5", CAMU_STATE[c.state].stripe)} />
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <span
          className={cx(
            "grid size-11 shrink-0 place-items-center rounded-xl text-white",
            c.kind === "dayout" ? "bg-[linear-gradient(135deg,#ffb347,#e8772e)]" : "bg-[linear-gradient(135deg,#3fb6a8,#227a8a)]",
          )}
        >
          <Icon size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold">{c.type}</p>
          <p className="truncate text-[12.5px] text-muted">{c.reason && c.reason !== "." ? c.reason : "No reason written"}</p>
        </div>
        <CamuChip state={c.state} />
      </div>
      <div className="mx-4 border-t-2 border-dashed border-line" />
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold">{day(c.fromDate)}</p>
          <p className="text-[12.5px] text-muted">{c.fromTime ? fmtTime(c.fromTime) : "all day"}</p>
        </div>
        <DoorOpen size={18} className="text-muted" />
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[13.5px] font-bold">{day(c.toDate)}</p>
          <p className="text-[12.5px] text-muted">{c.toTime ? fmtTime(c.toTime) : "all day"}</p>
        </div>
      </div>
      <div className="border-t border-line bg-surface px-4 py-2">
        <Steps c={c} />
      </div>
    </button>
  );
}

/** A pass is waiting for the approval DockIn's self-approval login can give. */
export function awaitingApproval(c: CamuPass): boolean {
  return c.state === "applied" && c.parent === "pending";
}

const CONFETTI = ["#209660", "#e8892f", "#8a4520", "#2f7fe8", "#d84a7a", "#f0c419"];

/** A short "Approved!" burst, shown over everything when a pass is approved. */
function ApprovedBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1700);
    return () => clearTimeout(t);
  }, [onDone]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="celebrate-dim" onClick={onDone} role="status" aria-label="Approved">
      <div className="celebrate-card">
        <span aria-hidden>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const dist = 90 + (i % 3) * 22;
            return (
              <span
                key={i}
                className="celebrate-confetti"
                style={{
                  background: CONFETTI[i % CONFETTI.length],
                  animation: `celebrate-fly ${700 + (i % 4) * 120}ms cubic-bezier(.2,.7,.3,1) ${120 + (i % 5) * 30}ms forwards`,
                  // @ts-expect-error custom properties
                  "--cx": `${Math.cos(a) * dist}px`,
                  "--cy": `${Math.sin(a) * dist - 30}px`,
                  "--cr": `${(i % 2 ? 1 : -1) * 220}deg`,
                }}
              />
            );
          })}
        </span>
        <span className="celebrate-ring">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path className="celebrate-tick" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <p className="text-[19px] font-extrabold">Approved!</p>
        <p className="text-[13px] text-muted">Your pass is good to go 🎉</p>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Approve this pass from inside DockIn with the college's self-approval login.
 * Does it on its own once DockIn has learned how; before that it opens the
 * approval sign-in so the student does it (and teaches it) once. Pass no id to
 * just connect / teach the login.
 */
export function ApproveNow({ camuId, label = "Approve now", className }: { camuId?: string; label?: string; className?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const note = "Sign in with your parent's approval login and approve your pass — DockIn will remember it.";

  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      if (!camuId) {
        const st = await connectApprover(note);
        if (st.saved) toast.show("Parent's approval login saved — approve a pass once and then it's automatic.");
        return;
      }
      const r = await approvePass(camuId, note);
      if (r.ok) {
        void fetchHistory().catch(() => []);
        // Reflect it on DockIn's own copy at once, so the "approve" button turns into "approved".
        void v3db.passes.filter((p) => p.camuId === camuId).modify({ status: "approved", updatedAt: Date.now() });
        setCelebrate(true);
      } else if (r.opened) {
        toast.show(
          r.why === "expired"
            ? "Approval sign-in expired — just sign in again."
            : r.why === "teach"
              ? "Approve it here once — then DockIn does it for you."
              : "Sign in with your parent's approval login to approve from here.",
        );
      } else if (r.reason === "web") toast.show("Open DockIn on your phone to approve.");
      else toast.show("Couldn't reach MyCamu — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className={cx("btn-leather inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] disabled:opacity-60", className)}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Stamp size={15} />} {label}
      </button>
      {celebrate && <ApprovedBurst onDone={() => setCelebrate(false)} />}
    </>
  );
}

/** In a pass sheet: approve it yourself if self-approval is set up, else say it's waiting. */
function SheetApprove({ camuId }: { camuId: string }) {
  const approver = useApproverState();
  if (approver.saved) return <ApproveNow camuId={camuId} />;
  return (
    <p className="rounded-xl bg-warn-soft px-3 py-2.5 text-center text-[13px] font-semibold text-warn">
      Waiting for approval in MyCamu
    </p>
  );
}

export function CamuPassSheet({ c, onClose }: { c: CamuPass | null; onClose: () => void }) {
  return (
    <Sheet open={!!c} onClose={onClose} title={c?.type ?? "Pass"}>
      {c && (
        <div className="space-y-4 pb-2">
          <CamuTicket c={c} />
          <div className="rounded-2xl border border-line bg-surface p-3.5">
            <Steps c={c} big />
          </div>
          {c.files > 0 && <p className="text-[12.5px] text-muted">{c.files === 1 ? "1 file attached in MyCamu" : `${c.files} files attached in MyCamu`}</p>}
          {awaitingApproval(c) && <SheetApprove camuId={c.id} />}
          {cancellable(c) && <CancelPass c={c} onDone={onClose} />}
          {(c.kind === "dayout" || c.kind === "leave") && (
            <button
              type="button"
              onClick={() => {
                onClose();
                const today = new Date();
                const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                const span = Math.max(0, Math.round((Date.parse(c.toDate) - Date.parse(c.fromDate)) / 864e5));
                const from = c.fromDate < iso ? iso : c.fromDate;
                const to = new Date(Date.parse(from) + span * 864e5).toISOString().slice(0, 10);
                openOutpass("new", {
                  kind: c.kind === "dayout" ? "dayout" : "leave",
                  leaveType: "Leave",
                  fromDate: from,
                  toDate: c.kind === "dayout" ? from : to,
                  fromTime: c.fromTime || "08:00",
                  toTime: c.toTime || "19:00",
                  reason: c.reason && c.reason !== "." ? c.reason : "",
                });
              }}
              className="btn-paper inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px]"
            >
              <Copy size={15} /> Make it again
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/**
 * "Is the pass DockIn made the one I asked for?" — read back from MyCamu,
 * field by field, big enough to glance at by the gate.
 */
export function VerifyCard({ p }: { p: PassRecord }) {
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const checks: Check[] = verifyPass(p, p.camu ?? null);
  const allOk = !!p.camu && checks.every((c) => c.ok);

  async function again() {
    setChecking(true);
    setFailed(false);
    try {
      const list = await fetchHistory();
      const c = findInHistory(p, list);
      const status = !c ? p.status : c.state === "rejected" ? "rejected" : c.state === "cancelled" ? "cancelled" : c.state === "applied" ? "applied" : "approved";
      await v3db.passes.update(p.id, { camu: c ?? undefined, camuId: c?.id ?? p.camuId, status, verifiedAt: Date.now(), updatedAt: Date.now() });
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section
      className={cx("ask-in w-full rounded-2xl border-[1.5px] p-3.5 text-left", allOk ? "border-safe/50 bg-safe-soft/40" : "border-danger/50 bg-danger-soft/50")}
      aria-label="Checked in MyCamu"
    >
      <div className="flex items-center gap-2">
        {allOk ? <BadgeCheck size={22} className="anim-check text-safe" /> : <ShieldAlert size={22} className="text-danger" />}
        <div className="min-w-0 flex-1">
          <p className={cx("text-[15px] font-extrabold", allOk ? "text-safe" : "text-danger")}>
            {allOk ? "Checked in MyCamu — all correct" : p.camu ? "MyCamu has something different" : "Not found in MyCamu"}
          </p>
          <p className="text-[11.5px] text-muted">
            {p.verifiedAt ? `Read back ${new Date(p.verifiedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Not read back yet"}
            {failed && " · couldn't reach MyCamu"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void again()}
          disabled={checking}
          aria-label="Check again in MyCamu"
          className="grid size-9 place-items-center rounded-full text-accent"
        >
          <RefreshCw size={17} className={cx(checking && "animate-spin")} />
        </button>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-[13px]">
            {c.ok ? <CheckCircle2 size={16} className="shrink-0 text-safe" /> : <XCircle size={16} className="shrink-0 text-danger" />}
            <span className="w-16 shrink-0 text-muted">{c.label}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{c.got}</span>
            {!c.ok && <span className="truncate text-[11.5px] text-danger">asked {c.want}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Cancel in MyCamu from DockIn: one tap to ask, one to confirm, then MyCamu's
 * list is read to be sure it took.
 */
export function CancelPass({ c, onDone, compact }: { c: CamuPass; onDone?: () => void; compact?: boolean }) {
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; open?: boolean } | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    const r = await cancelInCamu(c.id);
    if (r.ok) {
      // Show it cancelled at once; MyCamu's list catches up in its own time.
      markCancelledLocally(c.id);
      const mine = await v3db.passes.filter((p) => p.camuId === c.id).toArray();
      for (const p of mine) await v3db.passes.update(p.id, { status: "cancelled", updatedAt: Date.now() });
      toast.show(`${c.type} cancelled in MyCamu`);
      setBusy(false);
      setAsk(false);
      onDone?.();
      // Pull MyCamu's list in the background so everything else stays fresh too.
      void fetchHistory().catch(() => []);
      return;
    }
    setErr(r);
    setBusy(false);
  }

  if (!ask) {
    return (
      <button
        type="button"
        onClick={() => setAsk(true)}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-xl font-bold",
          compact ? "h-9 px-3 text-[12.5px] text-danger" : "h-11 w-full bg-danger text-[14px] text-white",
        )}
      >
        <Ban size={compact ? 14 : 16} /> Cancel this pass
      </button>
    );
  }
  return (
    <div className="anim-pop rounded-2xl border border-danger/40 bg-danger-soft/50 p-3">
      <p className="text-[13.5px] font-bold">
        Cancel {c.type} · {day(c.fromDate)}
        {c.fromTime ? ` ${fmtTime(c.fromTime)}` : ""} in MyCamu?
      </p>
      <p className="mt-0.5 text-[12px] text-muted">This can&apos;t be undone — you&apos;d have to apply again.</p>
      {err && (
        <p className="mt-1.5 text-[12.5px] font-semibold text-danger">
          {err.message}{" "}
          {err.open && (
            <button type="button" className="underline" onClick={() => void DockIn.openCamu({ path: "/v2/leaveManagement", note: `Cancel: ${c.type} · ${day(c.fromDate)}` })}>
              Open MyCamu
            </button>
          )}
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => setAsk(false)} className="btn-paper h-10 rounded-xl text-[13px]">
          Keep it
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void go()}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-danger text-[13px] font-bold text-white"
        >
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Ban size={14} />} Yes, cancel
        </button>
      </div>
    </div>
  );
}

/** Does this pass DockIn holds appear in MyCamu's list? */
export function inCamu(p: PassDraft & { camuId?: string }, list: CamuPass[]): boolean {
  return !!findInHistory(p, list);
}
