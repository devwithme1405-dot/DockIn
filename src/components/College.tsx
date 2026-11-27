"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Check, GraduationCap, Loader2, RefreshCw, Stamp, TriangleAlert } from "lucide-react";
import { connectCamu, connectLms, disconnect, syncCollege, useCollege } from "@/lib/college";
import { DockIn, isNativeApp } from "@/lib/native";
import type { CamuState, LmsState } from "@/lib/native";
import { approverState, connectApprover, forgetApprover, type ApproverState } from "@/lib/approver";
import { usePreview } from "@/lib/v3/flags";
import { cx, inputCls, useToast } from "./ui";
import { isOffline } from "@/lib/net";

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
    if (isOffline()) {
      toast.show("You're offline — this needs internet. Everything else still works.");
      return;
    }
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
          className="btn-connect inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold disabled:opacity-60"
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
  const [who, setWho] = useState<{ name: string; enrollment: string }>({ name: "", enrollment: "" });
  const on = !!camu?.connected && !camu.expired;

  useEffect(() => {
    if (!(isNativeApp() && on)) return;
    let live = true;
    DockIn.camuIdentity()
      .then((id) => live && setWho({ name: id.name || "", enrollment: id.enrollment || "" }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [on, camu?.syncedAt]);

  if (!native) return null;

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
            className="btn-disconnect h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold disabled:opacity-60"
          >
            Disconnect
          </button>
        ) : (
          <Action busy={busy} onClick={() => run(async () => { await connectCamu(); onDone?.(); })}>
            {camu?.expired ? "Sign in" : "Connect"}
          </Action>
        )
      }
    >
      {on && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5">
          <p className="min-w-0 truncate text-[12px] text-muted">
            {who.enrollment || who.name ? (
              <>
                Signed in as <b className="font-bold text-ink">{who.name || who.enrollment}</b>
                {who.name && who.enrollment ? ` · ${who.enrollment}` : ""}
              </>
            ) : (
              "Signed into MyCamu."
            )}
          </p>
          <button
            onClick={() => run(async () => { await connectCamu(); onDone?.(); })}
            disabled={busy}
            className="shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-bold text-accent active:bg-accent-soft disabled:opacity-60"
          >
            Not you? Re-verify
          </button>
        </div>
      )}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Self-approval

/**
 * "Self-approval": the college's second MyCamu login for approving your own
 * gate pass. Connecting opens that sign-in inside DockIn once; after that, a
 * pass is approved from here with one tap — no second app.
 */
export function ConnectApprover({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const { native } = useCollege();
  const preview = usePreview();
  const { busy, run } = useBusy();
  const toast = useToast();
  const [st, setSt] = useState<ApproverState>({ saved: false, taught: false, user: "" });

  useEffect(() => {
    let live = true;
    void approverState().then((s) => {
      if (live) setSt(s);
    });
    return () => {
      live = false;
    };
  }, []);

  // Self-approval belongs with outpass — a DockIn 3 feature — so it stays on the
  // preview channel until outpass ships for everyone, hidden on the everyday app.
  if (!native || !preview) return null;
  const on = st.saved;

  return (
    <Row
      icon={<Stamp size={19} />}
      done={on}
      title={on ? "Self-approval connected" : "Self-approval"}
      body={
        on
          ? st.taught
            ? `Approve your own passes from here, one tap${st.user ? ` · ${st.user}` : ""}.`
            : "Approve one pass here once so DockIn learns it — then it's automatic."
          : "Approve your own gate pass from inside DockIn. Sign in with the approval login your college gave you (username & password, not Microsoft)."
      }
      compact={compact}
      action={
        on ? (
          <button
            onClick={() => run(async () => { await forgetApprover(); setSt({ saved: false, taught: false, user: "" }); })}
            disabled={busy}
            className="btn-disconnect h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold disabled:opacity-60"
          >
            Disconnect
          </button>
        ) : (
          <Action busy={busy} onClick={() => run(async () => { setSt(await connectApprover()); onDone?.(); })}>
            Connect
          </Action>
        )
      }
    >
      {on && (
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const { items } = await DockIn.approverCaptured();
              const text = (items || "[]").trim();
              try {
                await navigator.clipboard.writeText(text);
                toast.show(text === "[]" ? "Nothing captured yet — approve one pass first." : "Copied — paste it to Claude so auto-approve can be set up.");
              } catch {
                toast.show("Couldn't copy — take a screenshot of this instead.");
              }
            })
          }
          className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2 text-left text-[12px] text-muted"
        >
          Setup helper: approve one pass, then tap here to copy what MyCamu sent (send it to Claude).
        </button>
      )}
    </Row>
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
            className="btn-disconnect h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold disabled:opacity-60"
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
            className="btn-connect flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-bold disabled:opacity-50"
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
    <div className={cx("account-card rounded-3xl", compact ? "p-3.5" : "p-4")}>
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
      className="btn-connect inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold disabled:opacity-60"
    >
      {busy && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
}
