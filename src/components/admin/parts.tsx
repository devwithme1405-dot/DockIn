"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowUpRight, Loader2, Minus, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useBackClose } from "@/lib/backClose";
import { cx } from "../ui";

/** Load something, with refresh, loading and error states (and no stale overwrite). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState<number | null>(null);
  const ticket = useRef(0);
  const f = useRef(fn);
  useEffect(() => {
    f.current = fn;
  });
  const reload = useCallback(async () => {
    const t = ++ticket.current;
    setLoading(true);
    try {
      const d = await f.current();
      if (t !== ticket.current) return;
      setData(d);
      setError(null);
      setAt(Date.now());
    } catch (e) {
      if (t !== ticket.current) return;
      setError((e as Error).message || "Couldn't load");
    } finally {
      if (t === ticket.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload, setData, at };
}

/**
 * Runs `reload` every `ms` while the tab is visible, and right away when it
 * becomes visible again — so a dashboard left open is always current, and a
 * phone in a pocket isn't polling for nothing.
 */
export function useAuto(reload: () => unknown, ms: number, on = true) {
  const r = useRef(reload);
  useEffect(() => {
    r.current = reload;
  });
  useEffect(() => {
    if (!on) return;
    const tick = () => document.visibilityState === "visible" && void r.current();
    const i = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(i);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms, on]);
}

/** Re-renders every `ms` so "2 min ago" labels stay true. */
export function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(i);
  }, [ms]);
}

export function Card({ title, sub, action, children, className, pad = true }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("adm-card overflow-hidden rounded-2xl border border-line bg-card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-1">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-bold tracking-[-0.01em]">{title}</h3>}
            {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? "px-5 pt-3 pb-5" : ""}>{children}</div>
    </section>
  );
}

/** A percent change chip: green up, red down (or the other way round with `invert`). */
export function Delta({ pct, invert = false, suffix = "" }: { pct: number | null; invert?: boolean; suffix?: string }) {
  if (pct === null) return <span className="text-[12px] font-semibold text-muted">no earlier data</span>;
  const up = pct > 0;
  const flat = pct === 0;
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums", good === null ? "text-muted" : good ? "text-safe" : "text-danger")}>
      <Icon size={13} strokeWidth={2.6} />
      {Math.abs(pct)}%{suffix}
    </span>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
  icon,
  spark,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "warn" | "bad";
  icon?: ReactNode;
  spark?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cx("adm-card flex min-w-0 flex-col rounded-2xl border border-line bg-card px-4 pt-3.5 pb-3 text-left", onClick && "transition hover:border-[var(--accent)]/40 active:translate-y-px")}
    >
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
        {icon && <span className="text-accent">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <p className="font-display mt-1 text-[28px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">{value}</p>
      {hint && (
        <div className={cx("mt-1.5 truncate text-[12px] font-semibold", tone === "good" ? "text-safe" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-danger" : "text-muted")}>{hint}</div>
      )}
      {spark && <div className="mt-2">{spark}</div>}
    </Tag>
  );
}

export function Badge({ children, tone = "plain", title }: { children: ReactNode; tone?: "plain" | "good" | "warn" | "bad" | "accent"; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap",
        tone === "good" && "bg-safe-soft text-safe",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "bad" && "bg-danger-soft text-danger",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "plain" && "bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** The pulsing green "live" dot. */
export function LiveDot({ on = true, className }: { on?: boolean; className?: string }) {
  return (
    <span className={cx("relative inline-flex size-2.5", className)} aria-hidden>
      {on && <span className="absolute inline-flex size-full animate-ping rounded-full bg-safe opacity-60" />}
      <span className={cx("relative inline-flex size-2.5 rounded-full", on ? "bg-safe" : "bg-line")} />
    </span>
  );
}

/** A number big enough to read across the room, with a caption. */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="truncate text-[11.5px] font-semibold text-muted">{label}</p>
      <p className={cx("truncate text-[17px] font-extrabold tabular-nums", tone === "good" && "text-safe", tone === "warn" && "text-warn", tone === "bad" && "text-danger")}>{value}</p>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export function Label({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-[12px] font-bold tracking-[0.06em] text-muted uppercase">{children}</p>
      {action}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13.5px] text-muted">
      <Loader2 size={18} className="animate-spin" /> {label}
    </div>
  );
}

/** Grey placeholder blocks while the first numbers load. */
export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}

export function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <TriangleAlert className="text-danger" />
      <p className="max-w-md text-[13.5px] text-muted">{error}</p>
      <button type="button" onClick={retry} className="btn-paper inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold">
        <RefreshCw size={14} /> Try again
      </button>
    </div>
  );
}

export function Empty({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</span>
      <p className="text-[14.5px] font-bold">{title}</p>
      {sub && <p className="max-w-xs text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Refresh" className="adm-icon-btn grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-card text-muted">
      <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
    </button>
  );
}

/** "Updated 12 s ago" with the live dot, for auto-refreshing screens. */
export function Freshness({ at, loading, every }: { at: number | null; loading: boolean; every?: string }) {
  useTick(5000);
  // eslint-disable-next-line react-hooks/purity -- relative time, re-rendered by useTick
  const s = at ? Math.round((Date.now() - at) / 1000) : null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted">
      <LiveDot on={!!at} />
      {loading && !at ? "Loading…" : s === null ? "—" : s < 5 ? "Updated just now" : s < 60 ? `Updated ${s}s ago` : `Updated ${Math.floor(s / 60)} min ago`}
      {every && <span className="hidden sm:inline">· refreshes every {every}</span>}
    </span>
  );
}

/** A segmented filter row (scrolls on a phone). */
export function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string] | readonly [T, string, number | undefined])[] }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((o) => {
        const [k, label, n] = o as readonly [T, string, number | undefined];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={cx(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition",
              value === k ? "border-transparent bg-[var(--ink)] text-[var(--on-ink)]" : "border-line bg-card text-muted hover:text-[var(--text)]",
            )}
          >
            {label}
            {n !== undefined && n > 0 && <span className={cx("rounded-full px-1.5 text-[10.5px] tabular-nums", value === k ? "bg-white/20" : "bg-surface-2")}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** An on/off switch. */
export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-safe" : "bg-surface-2 ring-1 ring-line")}
    >
      <span className={cx("absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left]", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

/** A panel that slides in from the right (full screen on a phone). */
export function Drawer({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useBackClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label={typeof title === "string" ? title : "Details"}>
      <div className="anim-fade absolute inset-0 bg-black/45" onClick={onClose} />
      <aside className={cx("adm-drawer absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--bg)] shadow-2xl", wide ? "max-w-[620px]" : "max-w-[480px]")}>
        <header className="flex items-center gap-3 border-b border-line bg-card px-4 pt-[calc(var(--sat,0px)+0.75rem)] pb-3">
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface">
            <X size={20} />
          </button>
          <div className="font-display min-w-0 flex-1 truncate text-[17px] font-extrabold">{title}</div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1.5rem+var(--sab,0px))]">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/** Asks "are you sure?" before something that can't be undone. */
export function useConfirm() {
  const [ask, setAsk] = useState<{ title: string; body: string; yes: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback(
    (title: string, body: string, yes = "Yes", danger = true) =>
      new Promise<boolean>((resolve) => setAsk({ title, body, yes, danger, resolve })),
    [],
  );
  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };
  const node =
    ask && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-5" role="alertdialog" aria-label={ask.title}>
            <div className="anim-fade absolute inset-0 bg-black/50" onClick={() => close(false)} />
            <div className="adm-enter relative w-full max-w-sm rounded-3xl border border-line bg-card p-6 shadow-2xl">
              <p className="font-display text-[19px] font-extrabold">{ask.title}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{ask.body}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => close(false)} className="btn-paper h-11 rounded-xl text-[14px] font-bold">
                  Cancel
                </button>
                <button type="button" onClick={() => close(true)} className={cx("h-11 rounded-xl text-[14px] font-bold text-white", ask.danger ? "bg-danger" : "btn-leather")}>
                  {ask.yes}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;
  return { confirm, node };
}

/** Thousands with Indian grouping (1,23,456). */
export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN"));
