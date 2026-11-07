"use client";

import { useState, type ReactNode } from "react";
import { BookOpen, Check, GraduationCap, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { connectCamu, connectLms, disconnect, syncCollege, useCollege } from "@/lib/college";
import type { CamuState, LmsState } from "@/lib/native";
import { cx, inputCls, useToast } from "./ui";

/** "just now", "5 min ago", "2 h ago", "3 days ago". */
export function timeAgo(ms: number | undefined, now = Date.now()): string {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function useBusy() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>, fail = "That did not work. Try again.") {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : fail;
      if (!/not connected|cancel/i.test(msg)) toast.show(msg);
    }
    setBusy(false);
  }
  return { busy, run };
}

// ---------------------------------------------------------------------------
// Camu

/**
 * The line under a Camu-driven screen: where the numbers come from and how
 * fresh they are, with a refresh. If Camu ended the session it becomes the one
 * thing on the screen asking for attention.
 */
export function CamuStatus({ camu, className }: { camu: CamuState; className?: string }) {
  const { busy, run } = useBusy();
  const [spinning, setSpinning] = useState(false);

  if (camu.expired) {
    return (
      <div className={cx("mx-5 flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3", className)}>
        <TriangleAlert size={18} className="shrink-0 text-warn" />
        <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
          <b className="font-semibold">Camu signed you out.</b>{" "}
          <span className="text-muted">Numbers are from {timeAgo(camu.syncedAt)}.</span>
        </p>
        <button
          onClick={() => run(connectCamu)}
          disabled={busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-medium text-on-accent disabled:opacity-60"
        >
          {busy && <Loader2 size={13} className="animate-spin" />} Sign in
        </button>
      </div>
    );
  }

  return (
    <div className={cx("mx-5 flex items-center gap-2 text-[12.5px] text-muted", className)}>
      <span className="size-1.5 shrink-0 rounded-full bg-safe" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        From Camu · {camu.error ? camu.error : `updated ${timeAgo(camu.syncedAt)}`}
      </span>
      <button
        onClick={async () => {
          setSpinning(true);
          await syncCollege(true);
          setSpinning(false);
        }}
        aria-label="Update from Camu now"
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted"
      >
        <RefreshCw size={15} className={cx(spinning && "animate-spin")} />
      </button>
    </div>
  );
}

/** "Connect Camu": one button, Camu's own sign-in opens inside the app. */
export function ConnectCamu({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const { state, native } = useCollege();
  const { busy, run } = useBusy();
  const camu = state.camu;
  if (!native) return null;
  const on = !!camu?.connected && !camu.expired;

  return (
    <Row
      icon={<GraduationCap size={19} />}
      done={on}
      title={on ? "Camu connected" : "Connect Camu"}
      body={
        on
          ? `${camu?.subjects?.length ?? 0} subjects · updated ${timeAgo(camu?.syncedAt)}`
          : "Attendance, today's classes and rooms, straight from Camu. Sign in with Microsoft, like always."
      }
      compact={compact}
      action={
        on ? (
          <button
            onClick={() => run(() => disconnect("camu"))}
            disabled={busy}
            className="h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-[13px] font-medium text-muted"
          >
            Disconnect
          </button>
        ) : (
          <Action busy={busy} onClick={() => run(async () => { await connectCamu(); onDone?.(); })}>
            {camu?.expired ? "Sign in" : "Connect"}
          </Action>
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// LMS

export function ConnectLms({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const { state, native } = useCollege();
  const { busy, run } = useBusy();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lms: LmsState | undefined = state.lms;
  if (!native) return null;
  const on = !!lms?.connected;

  async function submit() {
    setError(null);
    await run(async () => {
      try {
        await connectLms(user.trim(), pass);
        setPass("");
        setOpen(false);
        onDone?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "The LMS did not accept that.");
      }
    });
  }

  return (
    <Row
      icon={<BookOpen size={19} />}
      done={on}
      title={on ? "LMS connected" : "Connect the LMS"}
      body={
        on
          ? lms?.error
            ? lms.error
            : `${lms?.items?.length ?? 0} things to do · updated ${timeAgo(lms?.syncedAt)}`
          : "New assignments show up in Tasks by themselves, and you get a notification."
      }
      compact={compact}
      action={
        on ? (
          <button
            onClick={() => run(() => disconnect("lms"))}
            disabled={busy}
            className="h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-[13px] font-medium text-muted"
          >
            Disconnect
          </button>
        ) : (
          !open && (
            <Action busy={false} onClick={() => setOpen(true)}>
              Connect
            </Action>
          )
        )
      }
    >
      {!on && open && (
        <form
          className="mt-3 space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className={inputCls}
            placeholder="LMS username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            aria-label="LMS username"
          />
          <input
            className={inputCls}
            type="password"
            placeholder="LMS password"
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            aria-label="LMS password"
          />
          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy || !user.trim() || !pass}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[14.5px] font-medium text-on-accent disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />} Sign in to the LMS
          </button>
          <p className="text-[12px] text-muted">
            Saved encrypted on this phone only and sent to lms.bennett.edu.in, nowhere else.
          </p>
        </form>
      )}
    </Row>
  );
}

// ---------------------------------------------------------------------------

function Row({
  icon,
  done,
  title,
  body,
  action,
  compact,
  children,
}: {
  icon: ReactNode;
  done: boolean;
  title: string;
  body: string;
  action?: ReactNode;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cx(compact ? "py-3" : "lift rounded-3xl bg-surface p-4")}>
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "grid size-10 shrink-0 place-items-center rounded-2xl",
            done ? "bg-safe-soft text-safe" : "bg-accent-soft text-accent",
          )}
        >
          {done ? <Check size={19} strokeWidth={2.5} /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{body}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Action({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-medium text-on-accent disabled:opacity-60"
    >
      {busy && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
}
