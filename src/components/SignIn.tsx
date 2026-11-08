"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";
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

  const field =
    "h-12 w-full rounded-xl border-[1.5px] border-card-edge bg-card px-3.5 text-[16px] text-text outline-none placeholder:text-muted/70 focus:border-accent";
  const muted = dark ? "text-white/70" : "text-muted";
  const strong = dark ? "text-white" : "text-text";
  const oneTap = !isNativeApp() && (providers?.google || providers?.azure);

  return (
    <div>
      <label className={cx("mb-1.5 block text-[13px] font-bold", muted)} htmlFor="dockin-user">
        Username
      </label>
      <div className="relative">
        <User size={18} className="pointer-events-none absolute inset-y-0 left-3.5 my-auto text-muted" />
        <input
          id="dockin-user"
          className={cx(field, "pl-10")}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="pick a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <label className={cx("mt-3 mb-1.5 block text-[13px] font-bold", muted)} htmlFor="dockin-pass">
        Password
      </label>
      <div className="relative">
        <input
          id="dockin-pass"
          className={cx(field, "pr-11")}
          type={show ? "text" : "password"}
          autoComplete={creating ? "new-password" : "current-password"}
          placeholder={creating ? "at least 6 characters" : "your password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ready && void submit()}
        />
        <ShowButton show={show} onToggle={() => setShow((s) => !s)} />
      </div>

      <Button className="mt-4 w-full" onClick={submit} disabled={busy || !ready}>
        <Lock size={17} /> {creating ? "Create account" : "Sign in"} <ArrowRight size={17} />
      </Button>

      <button
        onClick={() => {
          setCreating((c) => !c);
          setError(null);
        }}
        className={cx("mx-auto mt-3 block text-[13px] font-bold", strong)}
      >
        {creating ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>

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
      className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted"
    >
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
