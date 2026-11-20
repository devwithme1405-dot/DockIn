"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import {
  fetchProviders,
  readAuthRedirectError,
  signInWithUsername,
  signUpWithUsername,
  signInWithAzure,
  signInWithGoogle,
  type Providers,
} from "@/lib/auth";
import { isNativeApp } from "@/lib/native";
import { Button, cx } from "./ui";

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function MicrosoftSquares() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <path fill="#F25022" d="M0 0h11v11H0z" />
      <path fill="#7FBA00" d="M12 0h11v11H12z" />
      <path fill="#00A4EF" d="M0 12h11v11H0z" />
      <path fill="#FFB900" d="M12 12h11v11H12z" />
    </svg>
  );
}

/**
 * Signing in with a username and password, kept by Supabase. No email, no code —
 * the username is all it needs. Creating an account and signing in are the same
 * two fields; a small switch chooses which. Nothing is ever deleted: a device
 * that signs in joins the account and its data syncs up.
 */
export function SignIn({ dark = false }: { dark?: boolean }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(readAuthRedirectError);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchProviders().then((p) => alive && setProviders(p));
    return () => {
      alive = false;
    };
  }, []);

  const ready = username.trim().length >= 3 && password.length >= 6;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setError(await (creating ? signUpWithUsername(username, password) : signInWithUsername(username, password)));
    setBusy(false);
  }

  async function oauth(run: () => Promise<string | null>) {
    setBusy(true);
    setError(await run());
    setBusy(false);
  }

  const field = "field h-[52px] w-full pl-11 text-[16px] placeholder:text-muted/70";
  const muted = dark ? "text-white/70" : "text-muted";
  const oneTap = !isNativeApp() && (providers?.google || providers?.azure);

  return (
    <div>
      {/* Sign in / Create account: a clear switch, not a small link under the button. */}
      <div className="relative mb-5 grid grid-cols-2 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Sign in or create an account">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-xl bg-[#fffdf8] shadow-[0_2px_6px_-2px_rgb(90_50_20/0.35)] transition-transform duration-300 ease-[cubic-bezier(0.3,0.9,0.3,1)] dark:bg-[#56402d]"
          style={{ transform: creating ? "translateX(100%)" : "none" }}
        />
        {(
          [
            [false, "Sign in"],
            [true, "Create account"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={label}
            role="tab"
            aria-selected={creating === mode}
            onClick={() => {
              setCreating(mode);
              setError(null);
            }}
            className={cx("relative z-[1] h-11 rounded-xl text-[14.5px] font-extrabold transition-colors", creating === mode ? "text-text" : muted)}
          >
            {label}
          </button>
        ))}
      </div>

      <label className={cx("mb-1.5 block text-[13px] font-bold", muted)} htmlFor="dockin-user">
        Username
      </label>
      <div className="relative">
        <User size={18} className="pointer-events-none absolute inset-y-0 left-4 my-auto text-[#a07850]" />
        <input
          id="dockin-user"
          className={field}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={creating ? "Pick a username" : "Type your username"}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <label className={cx("mt-3.5 mb-1.5 block text-[13px] font-bold", muted)} htmlFor="dockin-pass">
        Password
      </label>
      <div className="relative">
        <Lock size={18} className="pointer-events-none absolute inset-y-0 left-4 my-auto text-[#a07850]" />
        <input
          id="dockin-pass"
          className={cx(field, "pr-11")}
          type={show ? "text" : "password"}
          autoComplete={creating ? "new-password" : "current-password"}
          placeholder={creating ? "At least 6 characters" : "Type your password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ready && void submit()}
        />
        <ShowButton show={show} onToggle={() => setShow((s) => !s)} />
      </div>
      {creating && <p className={cx("mt-1.5 text-[12px]", muted)}>Username: 3+ letters or numbers. Remember your password — there&apos;s no email reset.</p>}

      <Button className="mt-5 w-full" onClick={submit} disabled={busy || !ready}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}
        {creating ? "Create my account" : "Sign in"} {!busy && <ArrowRight size={17} />}
      </Button>

      {oneTap && (
        <>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className={cx("text-[12px]", muted)}>or</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          {providers?.azure && (
            <button
              onClick={() => oauth(signInWithAzure)}
              disabled={busy}
              className="flex h-13 w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-[16px] font-semibold text-[#1f1f1f] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] transition active:scale-[0.98] disabled:opacity-60"
            >
              <MicrosoftSquares />
              Continue with Outlook
            </button>
          )}
          {providers?.google && (
            <button
              onClick={() => oauth(signInWithGoogle)}
              disabled={busy}
              className={cx(
                "flex h-13 w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-[16px] font-semibold text-[#1f1f1f] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] transition active:scale-[0.98] disabled:opacity-60",
                providers?.azure && "mt-2.5",
              )}
            >
              <GoogleG />
              Continue with Google
            </button>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ShowButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "Hide password" : "Show password"}
      className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted"
    >
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
