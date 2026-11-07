"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { ALLOWED_DOMAIN } from "@/lib/supabase";
import {
  fetchProviders,
  readAuthRedirectError,
  sendEmailCode,
  signInWithPassword,
  updatePassword,
  verifyEmailCode,
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

type Mode = "in" | "send" | "verify" | "pw";

/**
 * Signing in with an email and a password you set once.
 *
 * Password is the everyday way in — no code to wait for. Setting that password,
 * whether the first time or after forgetting it, is done with a six-digit code
 * typed right here. A link is deliberately not used: inside the Android app an
 * email link opens a separate browser and the sign-in it does there never
 * reaches the app, which is why the old link "did nothing". A code lands the
 * session in the app, every time.
 */
export function SignIn({ dark = false }: { dark?: boolean }) {
  const [mode, setMode] = useState<Mode>("in");
  const [redirectError] = useState(readAuthRedirectError);
  const [error, setError] = useState<string | null>(redirectError);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void fetchProviders().then((p) => alive && setProviders(p));
    return () => {
      alive = false;
    };
  }, []);

  function to(next: Mode) {
    setMode(next);
    setError(null);
    setNote(null);
  }

  async function oauth(run: () => Promise<string | null>) {
    setBusy(true);
    setError(await run());
    setBusy(false);
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    setError(await signInWithPassword(email, password));
    setBusy(false);
  }

  async function send() {
    setBusy(true);
    setError(null);
    const err = await sendEmailCode(email);
    setBusy(false);
    if (err) return setError(err);
    setNote(null);
    to("verify");
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const err = await verifyEmailCode(email, code);
    setBusy(false);
    if (err) return setError(err);
    to("pw");
    setTimeout(() => pwRef.current?.focus(), 50);
  }

  async function savePassword() {
    setBusy(true);
    setError(null);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) return setError(err);
    // The code already signed them in; the password is now set for next time.
  }

  const field =
    "h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-[16px] text-text outline-none placeholder:text-muted/70 focus:border-accent";
  const muted = dark ? "text-white/70" : "text-muted";
  const strong = dark ? "text-white" : "text-text";
  const oneTap = !isNativeApp() && (providers?.google || providers?.azure);

  return (
    <div>
      {mode === "in" && (
        <>
          <label className={cx("mb-1.5 block text-[13px] font-medium", muted)} htmlFor="dockin-email">
            Email
          </label>
          <input
            id="dockin-email"
            className={field}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={ALLOWED_DOMAIN ? `name@${ALLOWED_DOMAIN}` : "you@example.com"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className={cx("mt-3 mb-1.5 block text-[13px] font-medium", muted)} htmlFor="dockin-pass">
            Password
          </label>
          <div className="relative">
            <input
              id="dockin-pass"
              className={cx(field, "pr-11")}
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email.includes("@") && password.length >= 6 && void signIn()}
            />
            <ShowButton show={show} onToggle={() => setShow((s) => !s)} />
          </div>
          <Button className="mt-4 w-full" onClick={signIn} disabled={busy || !email.includes("@") || password.length < 6}>
            <Lock size={17} /> Sign in <ArrowRight size={17} />
          </Button>
          <button onClick={() => to("send")} className={cx("mx-auto mt-3 block text-[13px] font-medium", strong)}>
            First time, or forgot password?
          </button>
        </>
      )}

      {mode === "send" && (
        <>
          <p className={cx("mb-3 text-[14px]", muted)}>
            Enter your email and we send a six-digit code to set your password. Works with Outlook, and
            the code is typed right here — no links.
          </p>
          <input
            className={field}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={ALLOWED_DOMAIN ? `name@${ALLOWED_DOMAIN}` : "you@example.com"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email.includes("@") && void send()}
            autoFocus
          />
          <Button className="mt-4 w-full" onClick={send} disabled={busy || !email.includes("@")}>
            <Mail size={17} /> Email me a code
          </Button>
          <BackLink onClick={() => to("in")} className={strong} />
        </>
      )}

      {mode === "verify" && (
        <>
          <p className={cx("mb-3 text-[14px]", muted)}>
            Code sent to <span className={strong}>{email}</span>. Check your inbox, and the junk folder too.
          </p>
          <input
            ref={codeRef}
            className={cx(field, "text-center text-[22px] tracking-[0.35em] tabular-nums")}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && code.length >= 6 && void verify()}
            aria-label="Code from your email"
          />
          <Button className="mt-3 w-full" onClick={verify} disabled={busy || code.length < 6}>
            Verify <ArrowRight size={17} />
          </Button>
          <div className="mt-3 flex items-center justify-between text-[13px]">
            <button onClick={() => to("send")} className={muted}>
              Use a different email
            </button>
            <button onClick={send} disabled={busy} className={cx("font-medium", strong)}>
              Resend code
            </button>
          </div>
        </>
      )}

      {mode === "pw" && (
        <>
          <p className={cx("mb-3 text-[14px]", muted)}>
            You are in. Set a password so next time it is just email and password.
          </p>
          <div className="relative">
            <input
              ref={pwRef}
              className={cx(field, "pr-11")}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password.length >= 6 && void savePassword()}
            />
            <ShowButton show={show} onToggle={() => setShow((s) => !s)} />
          </div>
          <Button className="mt-4 w-full" onClick={savePassword} disabled={busy || password.length < 6}>
            <Lock size={17} /> Save password
          </Button>
        </>
      )}

      {oneTap && mode === "in" && (
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

      {note && <p className="mt-4 rounded-xl bg-safe-soft px-3.5 py-2.5 text-[13.5px] text-safe">{note}</p>}
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

function BackLink({ onClick, className }: { onClick: () => void; className: string }) {
  return (
    <button onClick={onClick} className={cx("mx-auto mt-3 block text-[13px] font-medium", className)}>
      ← Back to sign in
    </button>
  );
}
