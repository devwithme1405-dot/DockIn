"use client";

import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { ALLOWED_DOMAIN } from "@/lib/supabase";
import { readAuthRedirectError, sendEmailCode, signInWithGoogle, verifyEmailCode } from "@/lib/auth";
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

/** Google or emailed-code sign-in for Bennett students. */
export function SignIn({ dark = false }: { dark?: boolean }) {
  const [redirectError] = useState(readAuthRedirectError);
  const [error, setError] = useState<string | null>(redirectError);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [showEmail, setShowEmail] = useState(false);

  async function google() {
    setBusy(true);
    setError(await signInWithGoogle());
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

  return (
    <div>
      <button
        onClick={google}
        disabled={busy}
        className="flex h-13 w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-[16px] font-semibold text-[#1f1f1f] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] transition active:scale-[0.98] disabled:opacity-60"
      >
        <GoogleG />
        Continue with Google
      </button>
      <p className={cx("mt-2 text-center text-[12.5px]", dark ? "text-white/70" : "text-muted")}>
        Use your @{ALLOWED_DOMAIN} account
      </p>

      {!showEmail ? (
        <button
          onClick={() => setShowEmail(true)}
          className="mx-auto mt-4 flex items-center gap-1.5 text-[14px] font-medium text-accent"
        >
          <Mail size={15} /> Use an email code instead
        </button>
      ) : (
        <div className="mt-5 space-y-3">
          <input
            className={field}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={`name@${ALLOWED_DOMAIN}`}
            value={email}
            disabled={sent}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="College email"
          />
          {!sent ? (
            <Button className="w-full" onClick={send} disabled={busy || !email.includes("@")}>
              Send code <ArrowRight size={17} />
            </Button>
          ) : (
            <>
              <input
                className={cx(field, "text-center text-[22px] tracking-[0.35em] tabular-nums")}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                aria-label="Code from your email"
              />
              <Button className="w-full" onClick={verify} disabled={busy || code.length < 6}>
                Verify and sign in
              </Button>
              <button
                onClick={() => {
                  setSent(false);
                  setCode("");
                }}
                className="mx-auto block text-[13px] text-muted"
              >
                Use a different email
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
