"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { ALLOWED_DOMAIN } from "@/lib/supabase";
import {
  fetchProviders,
  readAuthRedirectError,
  sendEmailCode,
  signInWithAzure,
  signInWithGoogle,
  verifyEmailCode,
  type Providers,
} from "@/lib/auth";
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
 * Signing in with your college email.
 *
 * The code goes to whatever address you type, so a Bennett Outlook inbox works
 * exactly like any other. One-tap buttons are drawn only for the providers this
 * Supabase project actually has switched on, so the screen never offers a button
 * that is going to fail.
 */
export function SignIn({ dark = false }: { dark?: boolean }) {
  const [redirectError] = useState(readAuthRedirectError);
  const [error, setError] = useState<string | null>(redirectError);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [providers, setProviders] = useState<Providers | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchProviders().then((p) => alive && setProviders(p));
    return () => {
      alive = false;
    };
  }, []);

  async function oauth(go: () => Promise<string | null>) {
    setBusy(true);
    setError(await go());
    setBusy(false);
  }
  async function send() {
    setBusy(true);
    setError(null);
    const err = await sendEmailCode(email);
    if (err) setError(err);
    else setSent(true);
    setBusy(false);
  }
  async function verify() {
    setBusy(true);
    const err = await verifyEmailCode(email, code);
    if (err) setError(err);
    setBusy(false);
  }

  const field =
    "h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-[16px] text-text outline-none placeholder:text-muted/70 focus:border-accent";
  const muted = dark ? "text-white/70" : "text-muted";
  const oneTap = providers?.google || providers?.azure;

  return (
    <div>
      {!sent ? (
        <>
          <label className={cx("mb-1.5 block text-[13px] font-medium", muted)} htmlFor="dockin-email">
            Your college email
          </label>
          <input
            id="dockin-email"
            className={field}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={`name@${ALLOWED_DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email.includes("@") && void send()}
          />
          <p className={cx("mt-2 text-[12.5px]", muted)}>
            We send a six-digit code to your inbox. Works with Outlook, no app needed.
          </p>
          <Button className="mt-4 w-full" onClick={send} disabled={busy || !email.includes("@")}>
            <Mail size={17} /> Send me a code <ArrowRight size={17} />
          </Button>
        </>
      ) : (
        <>
          <p className={cx("mb-3 text-[14px]", muted)}>
            Code sent to <span className={dark ? "text-white" : "text-text"}>{email}</span>. Check your
            inbox, and the junk folder too.
          </p>
          <input
            className={cx(field, "text-center text-[22px] tracking-[0.35em] tabular-nums")}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && code.length >= 6 && void verify()}
            aria-label="Code from your email"
            autoFocus
          />
          <Button className="mt-3 w-full" onClick={verify} disabled={busy || code.length < 6}>
            Verify and sign in
          </Button>
          <button
            onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}
            className={cx("mx-auto mt-3 block text-[13px]", muted)}
          >
            Use a different email
          </button>
        </>
      )}

      {!sent && oneTap && (
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
