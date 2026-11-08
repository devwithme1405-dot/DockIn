"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, type LucideIcon } from "lucide-react";
import type { AttendanceState } from "@/lib/types";
import { gradientOf, parseAvatar } from "@/lib/avatars";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------- state colours ----------

export const STATE_TEXT: Record<AttendanceState, string> = {
  none: "text-muted",
  safe: "text-safe",
  warn: "text-warn",
  danger: "text-danger",
};
export const STATE_BAR: Record<AttendanceState, string> = {
  none: "bg-muted",
  safe: "bg-safe",
  warn: "bg-warn",
  danger: "bg-danger",
};
export const STATE_SOFT: Record<AttendanceState, string> = {
  none: "bg-surface-2",
  safe: "bg-safe-soft",
  warn: "bg-warn-soft",
  danger: "bg-danger-soft",
};

// ---------- button ----------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
};

/**
 * Eases a number up to its value when it changes, so a figure lands rather than
 * snapping — the small bit of life that makes a screen feel awake. Honours the
 * reduce-motion setting by jumping straight to the value.
 */
export function useCountUp(value: number, ms = 650): number {
  const [n, setN] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (from === to || reduce) {
      setN(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setN(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return n;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-2xl tracking-[-0.01em] disabled:opacity-45",
        size === "md" ? "h-12 px-5 text-[15px]" : "h-9 px-3.5 text-[13.5px]",
        // Primary is stitched leather — the one thing on a screen to press.
        variant === "primary" && "btn-leather",
        variant === "accent" &&
          "bg-accent font-bold text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_4px_0_#4a24b0] transition active:translate-y-[3px] active:shadow-[0_1px_0_#4a24b0]",
        variant === "secondary" && "btn-paper",
        variant === "ghost" && "font-semibold text-accent transition active:scale-[0.98]",
        variant === "danger" &&
          "bg-danger font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_4px_0_#8a2418] transition active:translate-y-[3px] active:shadow-[0_1px_0_#8a2418]",
        className,
      )}
    />
  );
}

// ---------- bottom sheet ----------

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="no-rise fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-fade absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="anim-sheet paper-page absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t-[1.5px] border-card-edge px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[19px] font-extrabold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-paper grid size-9 place-items-center rounded-full text-muted"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A bottom sheet that asks "are you sure?" with a clear primary action. */
export function ConfirmSheet({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  tone = "danger",
  busy = false,
  extra,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  tone?: "danger" | "primary";
  busy?: boolean;
  extra?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title={title}>
      <div className="space-y-3 text-[15px] text-muted">{children}</div>
      <div className="mt-5 space-y-2.5">
        {extra}
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          className="w-full"
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
        <Button variant="secondary" className="w-full" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- toast with undo ----------

interface ToastApi {
  show: (message: string, onUndo?: () => void) => void;
}
const ToastCtx = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    onUndo?: () => void;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, onUndo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, onUndo });
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {toast && (
        <div
          key={toast.id}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md justify-center px-4"
        >
          <div className="anim-toast pointer-events-auto flex items-center gap-4 rounded-xl bg-text px-4 py-2.5 text-sm font-medium text-bg shadow-[0_10px_24px_-8px_rgb(40_20_5/0.6)]">
            <span>{toast.message}</span>
            {toast.onUndo && (
              <button
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  toast.onUndo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ---------- small pieces ----------

export function ProgressBar({
  pct,
  target,
  state,
}: {
  pct: number | null;
  target: number;
  state: AttendanceState;
}) {
  return (
    <div className="groove relative h-2 w-full overflow-hidden rounded-full">
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", STATE_BAR[state])}
        style={{ width: `${Math.min(Math.max(pct ?? 0, 0), 100)}%` }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-text/60"
        style={{ left: `${target}%` }}
        aria-hidden
      />
    </div>
  );
}

export function Chip({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base = cx(
    "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[13.5px]",
    active ? "btn-leather lip-sm" : "btn-paper lip-sm",
    className,
  );
  if (!onClick) return <span className={base}>{children}</span>;
  return (
    <button type="button" onClick={onClick} className={base} aria-pressed={active}>
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  /** Tighter spacing, for fields that sit inside a card rather than a form. */
  compact,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <label className={cx("block", compact ? "mb-2" : "mb-4")}>
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-text outline-none placeholder:text-muted/70 focus:border-accent";

/** Profile picture: a gradient tile with the first letter or a chosen emoji. */
export function Avatar({
  name,
  avatar,
  size = 44,
  className,
}: {
  name: string;
  avatar?: string;
  size?: number;
  className?: string;
}) {
  const look = parseAvatar(avatar, name);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={cx("grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * (look.kind === "emoji" ? 0.5 : 0.4),
        lineHeight: 1,
        background: gradientOf(look.palette),
      }}
    >
      {look.kind === "emoji" ? look.emoji : initial}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon: Icon,
  flush,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  /** Set when the surrounding element already has the page's side padding. */
  flush?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-dashed border-line px-6 py-10 text-center",
        flush ? "" : "mx-5",
      )}
    >
      {Icon && (
        <div className="mb-3 flex justify-center text-muted">
          <Icon size={26} strokeWidth={1.75} />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// ---------- ring and subject tile ----------

const STATE_STROKE: Record<AttendanceState, string> = {
  none: "var(--muted)",
  safe: "var(--safe)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

export function Ring({
  pct,
  state,
  size = 96,
  stroke = 10,
  target,
  children,
}: {
  pct: number | null;
  state: AttendanceState;
  size?: number;
  stroke?: number;
  /** Draws a small tick on the ring at the target percentage. */
  target?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.min(Math.max(pct ?? 0, 0), 100);
  const tick = target === undefined ? null : (target / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={STATE_STROKE[state]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </svg>
      {tick !== null && (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden>
          <line
            x1={size / 2 + (r - stroke / 2 - 2) * Math.cos(tick)}
            y1={size / 2 + (r - stroke / 2 - 2) * Math.sin(tick)}
            x2={size / 2 + (r + stroke / 2 + 2) * Math.cos(tick)}
            y2={size / 2 + (r + stroke / 2 + 2) * Math.sin(tick)}
            stroke="var(--text)"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.55}
          />
        </svg>
      )}
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function SubjectTile({
  name,
  code,
  color,
  size = 40,
}: {
  name: string;
  code: string;
  color: string;
  size?: number;
}) {
  const label = (code || name).replace(/[^A-Za-z0-9&]/g, "").slice(0, 4).toUpperCase();
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-xl font-semibold tracking-tight"
      style={{
        width: size,
        height: size,
        fontSize: label.length > 3 ? 10 : 12,
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
