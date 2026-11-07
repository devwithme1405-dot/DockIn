"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { BellRing, Check, ChevronRight, Loader2, Radio, Smartphone } from "lucide-react";
import { DockIn, isNativeApp, onPhone, type PhoneStatus } from "@/lib/native";
import { cx, useToast } from "./ui";

/**
 * The phone's switches, read live and fixed in one tap each.
 *
 * Inside the Android app there are exactly two things to turn on: notification
 * access (so payments are read) and DockIn's own notifications (so it can ask
 * where the money went). Each line says whether it is on, and the button next
 * to it opens the precise Android screen that changes it. Coming back to the
 * app re-reads both, so the tick appears without a refresh.
 */
export function usePhoneStatus(): { status: PhoneStatus | null; native: boolean; reload: () => void } {
  const [native] = useState(() => typeof window !== "undefined" && isNativeApp());
  const [status, setStatus] = useState<PhoneStatus | null>(null);

  const reload = useCallback(() => {
    if (!native) return;
    void DockIn.status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [native]);

  useEffect(() => {
    void Promise.resolve().then(reload);
    return onPhone("resume", reload);
  }, [reload]);

  return { status, native, reload };
}

export function PhoneSetup() {
  const toast = useToast();
  const { status, native, reload } = usePhoneStatus();
  const [busy, setBusy] = useState<string | null>(null);

  if (!native) return <GetTheApp />;

  if (!status) {
    return (
      <Card>
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" /> Checking this phone…
        </p>
      </Card>
    );
  }

  const ready = status.listening && status.notifications === "granted";
  // Android 13 and later lock notification access for apps installed from a
  // file until "restricted settings" are allowed for them in App info.
  const restricted = status.sdk >= 33;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "That screen would not open on this phone.");
    }
    setBusy(null);
    reload();
  }

  async function allowNotifications() {
    await run("notif", async () => {
      if (status!.notifications === "denied") {
        await DockIn.openNotificationSettings();
        return;
      }
      const r = await DockIn.requestNotifications();
      if (r.notifications === "denied") await DockIn.openNotificationSettings();
    });
  }

  async function test() {
    await run("test", async () => {
      await DockIn.testPrompt();
      toast.show("Sent. Pull down your notifications.");
    });
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "grid size-10 shrink-0 place-items-center rounded-2xl",
            ready ? "bg-safe-soft text-safe" : "bg-accent-soft text-accent",
          )}
        >
          <Radio size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{ready ? "Reading your payments" : "Read payments automatically"}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {ready
              ? "Right after you pay, DockIn asks what it was for. Nothing is added until you say so."
              : "DockIn reads what GPay, PhonePe, Paytm and your bank post, and asks where the money went. It all stays on this phone."}
          </p>
        </div>
      </div>

      <ol className="mt-4 border-t border-line">
        <Step
          done={status.listening}
          title="Read payment notifications"
          body={
            status.listening
              ? "On. Only payment apps and bank messages are looked at."
              : "Opens Android's switch for DockIn. Turn it on and come back."
          }
          action={
            !status.listening && (
              <ActionButton busy={busy === "listen"} onClick={() => run("listen", () => DockIn.openListenerSettings())}>
                Turn on
              </ActionButton>
            )
          }
        >
          {!status.listening && restricted && (
            <div className="mt-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
              Switch greyed out, or a &ldquo;Restricted setting&rdquo; message? Android does that for apps not
              from the Play Store. Open <b className="text-text">App info</b>, tap <b className="text-text">⋮</b>{" "}
              at the top right, choose <b className="text-text">Allow restricted settings</b>, then tap Turn on
              again.
              <button
                onClick={() => run("appinfo", () => DockIn.openAppSettings())}
                className="mt-2 flex items-center gap-1 font-medium text-accent"
              >
                Open App info <ChevronRight size={14} />
              </button>
            </div>
          )}
        </Step>

        <Step
          done={status.notifications === "granted"}
          title="Ask me right after I pay"
          body={
            status.notifications === "granted"
              ? "On. One notification per payment, with the amount and where."
              : "DockIn needs to be allowed to send notifications for this."
          }
          action={
            status.notifications !== "granted" && (
              <ActionButton busy={busy === "notif"} onClick={allowNotifications}>
                Allow
              </ActionButton>
            )
          }
        />
      </ol>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="min-w-0 text-[12px] text-muted">
          App {status.version || "?"} · Android {androidName(status.sdk)}
        </p>
        {status.notifications === "granted" && (
          <button
            onClick={test}
            disabled={busy === "test"}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12.5px] font-medium disabled:opacity-60"
          >
            <BellRing size={13} /> Test
          </button>
        )}
      </div>
    </Card>
  );
}

/**
 * A one-line nudge for screens that depend on detection (Money), shown only in
 * the app and only while something is still off.
 */
export function PhoneSetupNudge() {
  const { status, native } = usePhoneStatus();
  if (!native || !status) return null;
  if (status.listening && status.notifications === "granted") return null;
  return (
    <Link
      href="/settings#phone"
      className="mx-5 mt-4 flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-accent"
    >
      <Radio size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 text-[13.5px] font-medium">
        {status.listening ? "Allow notifications so DockIn can ask after each payment" : "Turn on payment reading — two taps"}
      </span>
      <ChevronRight size={17} className="shrink-0" />
    </Link>
  );
}

function GetTheApp() {
  const onAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-text">
          <Smartphone size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Payments are read by the Android app</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {onAndroid
              ? "Install DockIn once. It is this same app, plus it reads your payments and asks where the money went."
              : "Open DockIn on your Android phone to read payments automatically."}
          </p>
          {onAndroid && (
            <Link
              href="/app"
              className="mt-2.5 inline-flex h-9 items-center rounded-full bg-accent px-3.5 text-[13px] font-medium text-on-accent"
            >
              Get the Android app
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section id="phone" className="lift scroll-mt-20 rounded-3xl bg-surface p-4">
      <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">Payments from your phone</h2>
      {children}
    </section>
  );
}

function Step({
  done,
  title,
  body,
  action,
  children,
}: {
  done: boolean;
  title: string;
  body: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3 border-b border-line py-3 last:border-b-0">
      <span
        className={cx(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
          done ? "bg-safe text-white" : "bg-surface-2 text-muted",
        )}
        aria-hidden
      >
        {done ? <Check size={14} strokeWidth={3} /> : "•"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-medium">{title}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">{body}</p>
          </div>
          {action}
        </div>
        {children}
      </div>
    </li>
  );
}

function ActionButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: ReactNode }) {
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

function androidName(sdk: number): string {
  const names: Record<number, string> = { 36: "16", 35: "15", 34: "14", 33: "13", 32: "12L", 31: "12", 30: "11", 29: "10" };
  return names[sdk] ?? String(sdk);
}
