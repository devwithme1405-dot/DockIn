"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff, Lock } from "lucide-react";
import { onPasswordRecovery, updatePassword } from "@/lib/auth";
import { Button, cx } from "@/components/ui";
import { Logo } from "@/components/Logo";

/**
 * Where the "forgot password" email link lands.
 *
 * Supabase parses the link into a short-lived recovery session and fires
 * PASSWORD_RECOVERY; only then is the form armed, so visiting this page without
 * a valid link cannot change anyone's password. On success the account is the
 * same one as before, so all the data is still there.
 */
export default function ResetPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => onPasswordRecovery(() => setReady(true)), []);

  async function save() {
    setBusy(true);
    setError(null);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/"), 1200);
  }

  const field =
    "h-12 w-full rounded-xl border border-line bg-bg px-3.5 pr-11 text-[16px] text-text outline-none placeholder:text-muted/70 focus:border-accent";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        {done ? (
          <div className="rounded-2xl bg-safe-soft px-4 py-5 text-center">
            <span className="mx-auto mb-2 grid size-11 place-items-center rounded-full bg-safe text-white">
              <Check size={22} strokeWidth={3} />
            </span>
            <p className="font-semibold text-safe">Password set. Opening DockIn…</p>
          </div>
        ) : (
          <>
            <h1 className="text-center text-[24px] font-semibold tracking-tight">Set a new password</h1>
            <p className="mt-2 text-center text-[13.5px] text-muted">
              {ready
                ? "Pick something you will remember. Everything in your account stays as it was."
                : "Open this page from the link in your email. Checking the link…"}
            </p>

            <div className="relative mt-6">
              <input
                className={field}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                disabled={!ready}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ready && password.length >= 6 && void save()}
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

            <Button className="mt-4 w-full" onClick={save} disabled={busy || !ready || password.length < 6}>
              <Lock size={17} /> Save password <ArrowRight size={17} />
            </Button>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">
                {error}
              </p>
            )}

            <p className={cx("mt-6 text-center text-[13px]")}>
              <Link href="/" className="font-medium text-accent">
                Back to DockIn
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
