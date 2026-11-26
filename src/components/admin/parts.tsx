"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { cx } from "../ui";

/** Load something, with refresh, loading and error states (and no stale overwrite). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
  return { data, error, loading, reload, setData };
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

export function Kpi({ label, value, hint, tone, icon, spark }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warn" | "bad"; icon?: ReactNode; spark?: ReactNode }) {
  return (
    <div className="adm-card flex min-w-0 flex-col rounded-2xl border border-line bg-card px-4 pt-3.5 pb-3">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
        {icon && <span className="text-accent">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <p className="font-display mt-1 text-[28px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">{value}</p>
      {hint && (
        <p className={cx("mt-1.5 truncate text-[12px] font-semibold", tone === "good" ? "text-safe" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-danger" : "text-muted")}>{hint}</p>
      )}
      {spark && <div className="mt-2">{spark}</div>}
    </div>
  );
}

export function Badge({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "good" | "warn" | "bad" | "accent" }) {
  return (
    <span
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

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13.5px] text-muted">
      <Loader2 size={18} className="animate-spin" /> {label}
    </div>
  );
}

export function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <TriangleAlert className="text-danger" />
      <p className="max-w-sm text-[13.5px] text-muted">{error}</p>
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
    <button type="button" onClick={onClick} aria-label="Refresh" className="adm-icon-btn grid size-9 place-items-center rounded-xl border border-line bg-card text-muted">
      <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
    </button>
  );
}

/** A segmented filter row (scrolls on a phone). */
export function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[] }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cx(
            "h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-semibold transition",
            value === k ? "border-transparent bg-[var(--ink)] text-[var(--on-ink)]" : "border-line bg-card text-muted hover:text-[var(--text)]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
