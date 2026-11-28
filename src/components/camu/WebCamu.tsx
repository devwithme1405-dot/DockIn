"use client";

/**
 * MyCamu on the web / iPhone — the whole thing, done through DockIn's server
 * instead of the Android plugin: connect once with your MyCamu email + password,
 * then make and approve outpasses and see attendance, all from a browser. Built
 * to feel like the app: a full-screen sheet, native date/time pickers, instant
 * states, safe-area aware.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Bell, ChevronLeft, DoorOpen, House, Loader2, LogOut, RefreshCw, ShieldCheck, Sun, Stamp, X } from "lucide-react";
import { useBackClose } from "@/lib/backClose";
import { fmtTime, toDateStr } from "@/lib/dates";
import { camuWeb, CamuWebError, useCamuLink, type LinkStatus } from "@/lib/camu/web";
import { clearWebCamu, syncWebCamu } from "@/lib/college";
import { goTab } from "@/lib/tabs";
import { enableWebPush, webPushState } from "@/lib/webpush";
import { camuPassOf, type CamuPass } from "@/lib/v3/pass";
import { cx, useToast } from "../ui";
import { CamuChip } from "../v3/CamuPasses";

// ---- a tiny open/close store so any card can open this sheet -----------------
let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const openWebCamu = () => {
  open = true;
  emit();
};
const closeWebCamu = () => {
  open = false;
  emit();
};
export function useWebCamuOpen(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => open,
    () => false,
  );
}

/**
 * The full-screen MyCamu sheet — connect, then make / approve / cancel outpasses.
 * Attendance, timetable and the mess pass live on their own screens now: once
 * connected they fill from MyCamu just like the Android app, so this sheet is
 * only the gate pass. Mount once (it renders only when opened).
 */
export function WebCamu() {
  const isOpen = useWebCamuOpen();
  useBackClose(isOpen, closeWebCamu);
  const { status, loading, refresh } = useCamuLink();

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  // Connected: fill every screen from MyCamu, close the sheet, land on Today —
  // the way the app does after you sign in.
  function onConnected() {
    refresh();
    void syncWebCamu(true);
    closeWebCamu();
    goTab("/");
  }

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="paper-page fixed inset-0 z-[60] mx-auto flex w-full max-w-md flex-col bg-[var(--bg)]" role="dialog" aria-label="MyCamu">
      <header className="op-head relative z-10 overflow-hidden px-3 pt-[calc(var(--sat,0px)+0.5rem)] pb-3 text-white">
        <div className="relative flex items-center gap-2">
          <button type="button" onClick={closeWebCamu} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-white/15 text-white active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[21px] leading-tight font-extrabold">Outpass</p>
            <p className="truncate text-[12px] text-white/80">{status?.linked ? (status.name ? `Signed in as ${status.name}` : "Connected") : "Day out & leave — make, approve, cancel"}</p>
          </div>
          <span className="op-door grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15" aria-hidden>
            <DoorOpen size={22} />
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(2rem+var(--sab,0px))]">
        {loading && !status ? (
          <div className="flex items-center justify-center py-20 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : !status?.linked ? (
          <Connect onDone={onConnected} />
        ) : (
          <>
            <NotifyBanner />
            <Outpass />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ connect

function Connect({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const r = await camuWeb.link(email.trim(), pwd);
      toast.show(`Connected — hi ${r.name || "there"}!`);
      onDone();
    } catch (e) {
      setErr(e instanceof CamuWebError ? e.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-6">
      <div className="mx-auto max-w-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <span className="grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent">
            <ShieldCheck size={30} />
          </span>
          <h2 className="font-display mt-3 text-[20px] font-extrabold">Connect MyCamu</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            Sign in with your MyCamu <b>email &amp; password</b> login (the one that isn&apos;t &ldquo;Sign in with Microsoft&rdquo;). DockIn uses it to make outpasses and read attendance for you.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold text-muted">MyCamu email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" autoComplete="username" inputMode="email" placeholder="you@example.com" className="field h-12 w-full px-3.5 text-[16px]" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[12.5px] font-semibold text-muted">Password</span>
          <input value={pwd} onChange={(e) => setPwd(e.target.value)} type="password" autoComplete="current-password" placeholder="••••••••" className="field h-12 w-full px-3.5 text-[16px]" />
        </label>
        {err && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">{err}</p>}
        <button type="button" disabled={busy || !email.trim() || !pwd} onClick={() => void go()} className="btn-leather mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] disabled:opacity-50">
          {busy ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />} {busy ? "Connecting…" : "Connect"}
        </button>
        <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          Stored encrypted on DockIn&apos;s server, used only to talk to MyCamu for you. You can disconnect anytime.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ outpass

const todayStr = () => toDateStr();

function Outpass() {
  const toast = useToast();
  const [raw, setRaw] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [making, setMaking] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const data = await camuWeb.passes();
        setRaw(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
      } catch {
        setRaw([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const passes = useMemo(() => (raw ?? []).map(camuPassOf).filter((p): p is CamuPass => !!p), [raw]);
  const today = todayStr();
  const upcoming = passes.filter((p) => p.toDate >= today && p.state !== "cancelled" && p.state !== "rejected");
  const past = passes.filter((p) => !(p.toDate >= today && p.state !== "cancelled" && p.state !== "rejected"));

  return (
    <div className="space-y-5 px-5 py-5">
      <NewPass
        busy={making}
        onMake={async (day, from, to, reason) => {
          setMaking(true);
          try {
            await camuWeb.dayOut(day, from, to, reason);
            toast.show("Outpass requested ✓");
            await load();
          } catch (e) {
            toast.show(e instanceof CamuWebError ? e.message : "Couldn't make the pass.");
          } finally {
            setMaking(false);
          }
        }}
      />

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Your passes</h3>
          <button type="button" onClick={() => void load()} aria-label="Refresh" className="grid size-8 place-items-center rounded-lg text-muted active:scale-95">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        {loading && !raw ? (
          <div className="flex justify-center py-8 text-muted">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : passes.length === 0 ? (
          <p className="rounded-2xl border border-line bg-card px-4 py-6 text-center text-[13.5px] text-muted">No passes yet. Make one above ☝️</p>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((p) => (
              <PassRow key={p.id} p={p} onChanged={load} />
            ))}
            {past.length > 0 && (
              <>
                <p className="px-1 pt-2 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Earlier</p>
                {past.slice(0, 15).map((p) => (
                  <PassRow key={p.id} p={p} onChanged={load} past />
                ))}
              </>
            )}
          </div>
        )}
      </section>

      <Disconnect />
    </div>
  );
}

function NewPass({ busy, onMake }: { busy: boolean; onMake: (day: string, from: string, to: string, reason: string) => void }) {
  const [day, setDay] = useState(todayStr());
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("18:00");
  const [reason, setReason] = useState("");
  const ok = day && from && to && from < to && reason.trim().length > 0;
  return (
    <section className="rounded-3xl border-[1.5px] border-card-edge bg-card p-4 shadow-[0_3px_0_var(--pbtn-lip)]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-2xl bg-warn-soft text-warn">
          <Sun size={20} />
        </span>
        <div>
          <p className="font-display text-[16px] font-extrabold">New day out</p>
          <p className="text-[12px] text-muted">Same day, 6am–7pm</p>
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-[12px] font-semibold text-muted">Date</span>
        <input type="date" value={day} min={todayStr()} onChange={(e) => setDay(e.target.value)} className="field h-11 w-full px-3 text-[15px]" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-muted">From</span>
          <input type="time" value={from} min="06:00" max="19:00" onChange={(e) => setFrom(e.target.value)} className="field h-11 w-full px-3 text-[15px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-muted">To</span>
          <input type="time" value={to} min="06:00" max="19:00" onChange={(e) => setTo(e.target.value)} className="field h-11 w-full px-3 text-[15px]" />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-[12px] font-semibold text-muted">Reason</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. market, home, appointment" className="field h-11 w-full px-3 text-[15px]" />
      </label>
      <button type="button" disabled={busy || !ok} onClick={() => onMake(day, from, to, reason.trim())} className="btn-leather mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" /> : <DoorOpen size={17} />} {busy ? "Requesting…" : "Request outpass"}
      </button>
    </section>
  );
}

function PassRow({ p, onChanged, past }: { p: CamuPass; onChanged: () => Promise<void> | void; past?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"approve" | "cancel" | null>(null);
  const canApprove = p.state === "applied" && p.parent === "pending";
  const canCancel = !past && (p.state === "applied" || p.state === "approved");

  async function act(kind: "approve" | "cancel") {
    setBusy(kind);
    try {
      if (kind === "approve") {
        await camuWeb.approve(p.id);
        toast.show("Approved ✓");
      } else {
        await camuWeb.cancel(p.id);
        toast.show("Cancelled");
      }
      await onChanged();
    } catch (e) {
      toast.show(e instanceof CamuWebError ? e.message : "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cx("rounded-2xl border border-line bg-card p-3", past && "opacity-80")}>
      <div className="flex items-center gap-3">
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", p.kind === "dayout" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>{p.kind === "dayout" ? <Sun size={17} /> : <House size={17} />}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold">
            {p.type} · {new Date(`${p.fromDate}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </p>
          <p className="truncate text-[12px] text-muted">
            {p.fromTime ? fmtTime(p.fromTime) : ""}
            {p.toDate !== p.fromDate ? " → " + new Date(`${p.toDate}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " " : " → "}
            {p.toTime ? fmtTime(p.toTime) : ""}
            {p.reason ? ` · ${p.reason}` : ""}
          </p>
        </div>
        <CamuChip state={p.state} />
      </div>
      {(canApprove || canCancel) && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {canApprove ? (
            <button type="button" disabled={!!busy} onClick={() => void act("approve")} className="btn-leather inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] disabled:opacity-60">
              {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <Stamp size={14} />} Approve
            </button>
          ) : (
            <span />
          )}
          {canCancel && (
            <button type="button" disabled={!!busy} onClick={() => void act("cancel")} className="btn-paper inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold text-danger disabled:opacity-60">
              {busy === "cancel" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A one-tap nudge to turn on notifications (web / installed iPhone PWA). */
function NotifyBanner() {
  const toast = useToast();
  const [state, setState] = useState(() => (typeof window === "undefined" ? "unsupported" : webPushState()));
  const [busy, setBusy] = useState(false);
  if (state === "unsupported" || state === "granted" || state === "denied") return null;

  if (state === "needs-install")
    return (
      <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-2xl border border-accent/25 bg-accent-soft px-3.5 py-3 text-[12.5px]">
        <Bell size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>
          <b>Want outpass alerts?</b> Add DockIn to your home screen first (the banner below), then turn on notifications here.
        </span>
      </div>
    );

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await enableWebPush();
          setState(r);
          toast.show(r === "granted" ? "Notifications on ✓" : r === "denied" ? "Blocked — turn it on in Settings" : "Couldn't turn on");
        } finally {
          setBusy(false);
        }
      }}
      className="mx-5 mt-4 flex w-[calc(100%-2.5rem)] items-center gap-2.5 rounded-2xl border border-accent/25 bg-accent-soft px-3.5 py-3 text-left text-[13px] font-semibold text-accent"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
      Turn on notifications
      <span className="ml-auto text-[11.5px] font-normal text-muted">outpass & updates</span>
    </button>
  );
}

function Disconnect() {
  const toast = useToast();
  const { refresh } = useCamuLink();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await camuWeb.unlink();
          clearWebCamu();
          toast.show("MyCamu disconnected");
          refresh();
        } catch {
          toast.show("Couldn't disconnect.");
        } finally {
          setBusy(false);
        }
      }}
      className="mx-auto mt-2 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-muted"
    >
      <LogOut size={14} /> Disconnect MyCamu
    </button>
  );
}

export type { LinkStatus };
