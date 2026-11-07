"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { ALLOWED_DOMAIN } from "@/lib/supabase";
import {
  fetchProviders,
  readAuthRedirectError,
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
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

type Mode = "in" | "up" | "forgot";

/**
 * Signing in with an email and a password you set once.
 *
 * No codes to wait for: after the first time it is just email and password,
 * and "Forgot password" mails a reset link. The same email keeps the same
 * account, so an older code-based account picks up its data again once a
 * password is set on it (via the reset link, or Settings while signed in).
 */
export function SignIn({ dark = false }: { dark?: boolean }) {
  const [mode, setMode] = useState<Mode>("in");
  const [redirectError] = useState(readAuthRedirectError);
  const [error, setError] = useState<string | null>(redirectError);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
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

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNote(null);
  }

  async function oauth(run: () => Promise<string | null>) {
    setBusy(true);
    setError(await run());
    setBusy(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setNote(null);
    if (mode === "in") {
      setError(await signInWithPassword(email, password));
    } else if (mode === "up") {
      const r = await signUpWithPassword(email, password);
      setError(r.error);
      if (!r.error && r.needsConfirm) {
        setNote("Account made. Check your inbox to confirm the email, then sign in.");
        setMode("in");
      }
    } else {
      const err = await sendPasswordReset(email);
      setError(err);
      if (!err) setNote("If that email has an account, a reset link is on its way. Open it to set a new password.");
    }
    setBusy(false);
  }

  const field =
    "h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-[16px] text-text outline-none placeholder:text-muted/70 focus:border-accent";
  const muted = dark ? "text-white/70" : "text-muted";
  const strong = dark ? "text-white" : "text-text";
  // Google and Outlook refuse to sign in inside an app's WebView, so inside the
  // Android app only email and password is offered.
  const oneTap = !isNativeApp() && (providers?.google || providers?.azure);
  const canSubmit = email.includes("@") && (mode === "forgot" || password.length >= 6);

  const cta =
    mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Email me a reset link";

  return (
    <div>
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

      {mode !== "forgot" && (
        <>
          <label className={cx("mt-3 mb-1.5 block text-[13px] font-medium", muted)} htmlFor="dockin-pass">
            Password
          </label>
          <div className="relative">
            <input
              id="dockin-pass"
              className={cx(field, "pr-11")}
              type={show ? "text" : "password"}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              placeholder={mode === "up" ? "At least 6 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && void submit()}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </>
      )}

      {mode === "forgot" && (
        <p className={cx("mt-2 text-[12.5px]", muted)}>
          We email you a link. Open it to set a new password — your classes, money and tasks stay put.
        </p>
      )}

      <Button className="mt-4 w-full" onClick={submit} disabled={busy || !canSubmit}>
        {mode === "forgot" ? <Mail size={17} /> : <Lock size={17} />} {cta} <ArrowRight size={17} />
      </Button>

      <div className="mt-3 flex items-center justify-between text-[13px]">
        {mode === "in" ? (
          <>
            <button onClick={() => go("up")} className={cx("font-medium", strong)}>
              Create account
            </button>
            <button onClick={() => go("forgot")} className={muted}>
              Forgot password?
            </button>
          </>
        ) : (
          <button onClick={() => go("in")} className={cx("font-medium", strong)}>
            ← Back to sign in
          </button>
        )}
      </div>

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

      {note && (
        <p className="mt-4 rounded-xl bg-safe-soft px-3.5 py-2.5 text-[13.5px] text-safe">{note}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
