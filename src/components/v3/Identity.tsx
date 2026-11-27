"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, BadgeCheck, Download, Eye, EyeOff, GraduationCap, Loader2, Lock, LogOut, ShieldCheck } from "lucide-react";
import { accountName, signOutCloud } from "@/lib/auth";
import { camuNameHint, claimWithCamu, firstName, readCamuIdentity, signUpWithCamu, type CamuIdentity } from "@/lib/identity";
import { isNativeApp } from "@/lib/native";
import { forgetPushToken } from "@/lib/push";
import { getProfile, saveProfile } from "@/lib/repo";
import { Button, cx } from "../ui";

const field = "field h-[52px] w-full pl-11 text-[16px] placeholder:text-muted/70";

/** The "MyCamu" button: one tap to the college sign-in. */
function CamuButton({ busy, onClick, label = "Continue with MyCamu" }: { busy: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="btn-leather flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-[16px] disabled:opacity-60"
    >
      {busy ? <Loader2 size={19} className="animate-spin" /> : <GraduationCap size={20} />}
      {busy ? "Opening MyCamu…" : label}
    </button>
  );
}

/** The enrollment, shown as the username it becomes. */
function UsernameCard({ id }: { id: CamuIdentity }) {
  return (
    <div className="anim-pop rounded-2xl border-[1.5px] border-safe/40 bg-safe-soft/50 p-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-extrabold tracking-[0.08em] text-safe uppercase">
        <BadgeCheck size={15} /> From your MyCamu
      </p>
      {id.name && <p className="mt-1 text-[14px] font-semibold">{id.name}</p>}
      <p className="mt-1 text-[12px] text-muted">Your DockIn username</p>
      <p className="font-display text-[26px] leading-tight font-extrabold tracking-wide">{id.enrollment}</p>
    </div>
  );
}

/**
 * "Create account" (DockIn 3): MyCamu first — the username is the enrollment
 * number it shows — then a password. Only in the app; the website points there.
 */
export function CamuSignUp({ muted, onSignInInstead }: { muted: string; onSignInInstead: (username: string) => void }) {
  const [id, setId] = useState<CamuIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string; username?: string } | null>(null);

  if (!isNativeApp()) {
    return (
      <div className="space-y-3 text-center">
        <p className={cx("text-[14px] leading-snug", muted)}>
          New accounts are made in the DockIn app — your username is your enrollment number, read from your MyCamu sign-in there.
        </p>
        <a href="/download" className="btn-leather inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px]">
          <Download size={18} /> Get the DockIn app
        </a>
      </div>
    );
  }

  async function camu() {
    setBusy(true);
    setError(null);
    const r = await readCamuIdentity(true);
    setBusy(false);
    if ("error" in r) setError({ message: r.error });
    else setId(r);
  }

  async function create(notMine = false) {
    if (!id || password.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    const r = await signUpWithCamu(id, password, notMine);
    setBusy(false);
    if (!r.ok) setError({ message: r.message, code: r.code, username: r.username });
  }

  if (!id) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent" />
          <p className={cx("text-[13px] leading-snug", muted)}>
            Your username will be your <b className="text-text">enrollment number</b>, straight from your MyCamu sign-in — so nobody can pose as someone else.
          </p>
        </div>
        <CamuButton busy={busy} onClick={() => void camu()} />
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">{error.message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <UsernameCard id={id} />
      <div>
        <label className={cx("mb-1.5 block text-[13px] font-bold", muted)} htmlFor="dockin-new-pass">
          Make a password
        </label>
        <div className="relative">
          <Lock size={18} className="pointer-events-none absolute inset-y-0 left-4 my-auto text-[#a07850]" />
          <input
            id="dockin-new-pass"
            className={cx(field, "pr-11")}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
          />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted">
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <p className={cx("mt-1.5 text-[12px]", muted)}>You&apos;ll sign in with {id.enrollment} and this password. There&apos;s no email reset — remember it.</p>
      </div>
      <Button className="w-full" onClick={() => void create()} disabled={busy || password.length < 6}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}
        Create my account {!busy && <ArrowRight size={17} />}
      </Button>
      {error && (
        <div role="alert" className="space-y-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">
          <p>{error.message}</p>
          {(error.code === "exists_unverified" || error.code === "already_linked") && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onSignInInstead(error.username ?? id.enrollment)} className="btn-paper h-9 rounded-lg px-3 text-[13px] font-bold">
                Sign in instead
              </button>
              {error.code === "exists_unverified" && (
                <button type="button" onClick={() => void create(true)} className="h-9 rounded-lg px-3 text-[13px] font-bold text-danger underline">
                  It&apos;s not mine
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Signed in but not yet confirmed with MyCamu (DockIn 3): asked once per app
 * open, full screen. Confirming makes the username the enrollment number (same
 * password), and asks for a nickname if there isn't one.
 */
export function IdentityGate({ email, onLater }: { email: string | undefined; onLater: () => void }) {
  const [id, setId] = useState<CamuIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [done, setDone] = useState<{ username: string; renamed?: string } | null>(null);
  const old = accountName(email);
  const wasTaken = old.startsWith("unverified-");

  async function camu() {
    setBusy(true);
    setError(null);
    const r = await readCamuIdentity(true);
    setBusy(false);
    if ("error" in r) setError({ message: r.error });
    else setId(r);
  }

  async function confirm() {
    if (!id) return;
    setBusy(true);
    setError(null);
    const r = await claimWithCamu(id);
    setBusy(false);
    if (r.ok) setDone({ username: r.username, renamed: r.renamed });
    else setError({ message: r.message, code: r.code });
  }

  return (
    <div className="paper-page fixed inset-0 z-[75] overflow-y-auto overscroll-contain" role="dialog" aria-label="Confirm it's you">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 pt-[calc(var(--sat,0px)+1.5rem)] pb-[max(1.5rem,var(--sab))]">
        {done ? (
          <Done username={done.username} old={old} camuName={id?.name ?? ""} />
        ) : (
          <div className="lift-card anim-pop space-y-4 p-5">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent-soft text-accent">
              <ShieldCheck size={30} />
            </span>
            <div className="text-center">
              <h1 className="font-display text-[22px] font-extrabold">Confirm it&apos;s you</h1>
              <p className="mt-1 text-[13.5px] leading-snug text-muted">
                DockIn usernames are now enrollment numbers, read from each student&apos;s own MyCamu — so nobody can use someone else&apos;s.
              </p>
              {wasTaken && (
                <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] font-semibold text-warn">
                  Your old username was someone else&apos;s enrollment number, so it went back to them. Confirm yours — your data stays.
                </p>
              )}
            </div>
            {id ? (
              <>
                <UsernameCard id={id} />
                <p className="text-center text-[12.5px] text-muted">
                  You&apos;ll sign in with <b className="text-text">{id.enrollment}</b> from now on — same password{old && !wasTaken ? ` (not "${old}")` : ""}.
                </p>
                <Button className="w-full" onClick={() => void confirm()} disabled={busy}>
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <BadgeCheck size={18} />} Yes, that&apos;s me
                </Button>
              </>
            ) : (
              <CamuButton busy={busy} onClick={() => void camu()} />
            )}
            {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">{error.message}</p>}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  void forgetPushToken().catch(() => {});
                  void signOutCloud();
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-bold text-muted"
              >
                <LogOut size={15} /> Sign out
              </button>
              <button type="button" onClick={onLater} className="h-9 rounded-full px-2 text-[13px] font-bold text-muted">
                Remind me later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** After confirming: the new username, and a nickname if there isn't one yet. */
function Done({ username, old, camuName }: { username: string; old: string; camuName: string }) {
  const profile = useLiveQuery(() => getProfile(), []);
  const [nick, setNick] = useState<string | null>(null);
  const needName = profile !== undefined && !profile?.name?.trim();
  const value = nick ?? firstName(camuName || camuNameHint());
  return (
    <div className="lift-card anim-pop space-y-4 p-5 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-safe text-white">
        <BadgeCheck size={32} className="anim-check" />
      </span>
      <div>
        <h1 className="font-display text-[22px] font-extrabold">You&apos;re confirmed</h1>
        <p className="mt-1 text-[13.5px] text-muted">Your username is now</p>
        <p className="font-display text-[26px] font-extrabold tracking-wide">{username}</p>
        {old && old.toUpperCase() !== username && <p className="mt-1 text-[12.5px] text-muted">Sign in with this from now on, not “{old}”. Same password.</p>}
      </div>
      {needName ? (
        <NicknameField
          value={value}
          onChange={setNick}
          onSave={async () => {
            await saveProfile({ name: value.trim() });
            window.location.reload();
          }}
        />
      ) : (
        <Button className="w-full" onClick={() => window.location.reload()}>
          Continue <ArrowRight size={17} />
        </Button>
      )}
    </div>
  );
}

function NicknameField({ value, onChange, onSave }: { value: string; onChange: (v: string) => void; onSave: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 text-left">
      <label className="block">
        <span className="mb-1.5 block text-[13.5px] font-extrabold">Nickname — shown on your Today page</span>
        <input className="field h-14 w-full px-4 text-[18px] font-bold" value={value} onChange={(e) => onChange(e.target.value.slice(0, 40))} placeholder="What should we call you?" />
      </label>
      <Button
        className="w-full"
        disabled={!value.trim() || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : null} Save and continue <ArrowRight size={17} />
      </Button>
    </div>
  );
}

/** Confirmed, but no nickname yet (DockIn 3): one small question. */
export function NicknameAsk({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState(() => firstName(camuNameHint()));
  return (
    <div className="fixed inset-0 z-[74] grid place-items-center bg-black/40 px-5" role="dialog" aria-label="Pick a nickname">
      <div className="lift-card anim-pop w-full max-w-sm space-y-3 p-5">
        <h2 className="font-display text-[20px] font-extrabold">What should we call you?</h2>
        <p className="text-[13px] text-muted">Your nickname shows on your Today page. Your username stays your enrollment number.</p>
        <NicknameField
          value={v}
          onChange={setV}
          onSave={async () => {
            await saveProfile({ name: v.trim() });
            onDone();
          }}
        />
      </div>
    </div>
  );
}
