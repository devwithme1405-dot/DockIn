"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Radio, Trash2 } from "lucide-react";
import { PaymentError, linkedDevices, noticeCount, unlinkDevice } from "@/lib/payments";
import { ConfirmSheet, cx, useToast } from "./ui";

/**
 * Payment detection, as a chain you can see.
 *
 * Four things have to be true before a payment turns up: the right app is
 * installed, Android has allowed it to read notifications, the phone has paired
 * itself, and something is actually being heard. When any one of them was
 * missing the symptom was identical — nothing happens — and there was no way,
 * from inside a web page, to tell which. So each link now reports itself: the
 * app sends its version, whether it has the listener, and whether the
 * permission is granted; it says hello on every launch, which proves it can
 * reach us; and the server counts what has arrived.
 *
 * The screen then says which link is broken, instead of leaving somebody to
 * guess at four of them at once.
 */

type Step = { done: boolean; title: string; body: string; action?: { label: string; href: string } };

export function PayLinkCard() {
  const toast = useToast();
  const [devices, setDevices] = useState<
    { id: string; label: string | null; lastSeen: string | null }[] | null
  >(null);
  const [heard, setHeard] = useState<number | null>(null);
  // Read once, when the data lands, rather than on every render: "how long ago"
  // is a fact about this visit, not something to recompute mid-paint.
  const [now, setNow] = useState<number | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices(await linkedDevices());
    } catch {
      setDevices([]);
    }
    try {
      setHeard(await noticeCount(24));
    } catch {
      setHeard(null);
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const onAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const app = typeof window === "undefined" ? null : readApp();
  const paired = (devices ?? []).length > 0;
  const seen = (devices ?? []).map((d) => d.lastSeen).filter(Boolean)[0] ?? null;
  const recent = seen && now ? now - new Date(seen).getTime() < 7 * 86_400_000 : false;

  const steps: Step[] = [
    {
      done: !!app?.pay,
      title: app?.pay ? `DockIn app ${app.version}` : "The DockIn app",
      body: app
        ? app.pay
          ? "Installed, and this build can watch notifications."
          : `Version ${app.version} came before this feature.`
        : onAndroid
          ? "Open this page inside the DockIn app, not the browser."
          : "This only works in the Android app.",
      ...(app
        ? {}
        : onAndroid
          ? { action: { label: "Get the app", href: "/app" } }
          : {}),
      action:
        app && !app.pay
          ? { label: "Get the latest app", href: "/app" }
          : undefined,
    },
    {
      done: app?.notif === true,
      title: "Permission to read notifications",
      body:
        app?.notif === true
          ? "Granted. DockIn can see what your payment apps post."
          : "Android only grants this on its own screen. If the switch there is greyed out, open Settings → Apps → DockIn → the ⋮ menu → Allow restricted settings first: Android hides this from apps installed from a file until you say so.",
      action: onAndroid && app?.pay && app.notif !== true
        ? { label: "Open that screen", href: "dockin://notifications" }
        : undefined,
    },
    {
      done: paired && recent,
      title: "Your phone can reach DockIn",
      body: paired
        ? recent
          ? `Said hello ${when(seen!, now)}.`
          : "Paired, but it has not said hello recently. Open the app once."
        : "The app pairs itself when you open it while signed in.",
    },
    {
      done: (heard ?? 0) > 0,
      title: "Something is being heard",
      body:
        heard === null
          ? "Could not check just now."
          : heard > 0
            ? `${heard} notification${heard === 1 ? "" : "s"} forwarded in the last day.`
            : "Nothing yet. Pay someone ₹1 and it should appear on Money.",
    },
  ];

  const working = steps.every((s) => s.done);
  const stuck = steps.find((s) => !s.done);

  async function drop(id: string) {
    try {
      await unlinkDevice(id);
      setDevices((cur) => (cur ?? []).filter((d) => d.id !== id));
      toast.show("That phone has stopped sending payments");
    } catch (e) {
      toast.show(e instanceof PaymentError ? e.message : "Could not unlink that.");
    }
    setDropping(null);
  }

  return (
    <section className="lift rounded-3xl bg-surface p-4">
      <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">
        Payments from your phone
      </h2>

      <div className="flex items-start gap-3">
        <span
          className={cx(
            "grid size-10 shrink-0 place-items-center rounded-2xl",
            working ? "bg-safe-soft text-safe" : "bg-surface-2 text-text",
          )}
        >
          <Radio size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">
            {working ? "Watching for payments" : "Spot payments automatically"}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {working
              ? "Each one waits on Money until you tap it. Nothing is ever added on its own."
              : "DockIn reads what GPay, PhonePe, Paytm and your bank put in your notification bar, and offers each payment for one tap. Account numbers never leave the phone."}
          </p>
        </div>
      </div>

      {devices === null ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" /> Checking…
        </p>
      ) : (
        <ol className="mt-4 space-y-0 border-t border-line">
          {steps.map((s, i) => (
            <li key={s.title} className={cx("flex gap-3 py-3", i > 0 && "border-t border-line")}>
              <span
                className={cx(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                  s.done ? "bg-safe text-white" : "bg-surface-2 text-muted",
                )}
              >
                {s.done ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={13} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx("text-[14.5px] font-medium", !s.done && "text-text")}>{s.title}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{s.body}</p>
                {s.action && (
                  <a
                    href={s.action.href}
                    target={s.action.href.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    className="mt-2 inline-flex h-9 items-center rounded-full bg-accent px-3.5 text-[13px] font-medium text-on-accent"
                  >
                    {s.action.label}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {devices !== null && !working && stuck && (
        <p className="mt-1 text-[12.5px] text-muted">
          Nothing will arrive until the step above is sorted.
        </p>
      )}

      {paired && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {(devices ?? []).map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{d.label ?? "Phone"}</p>
                <p className="text-[12.5px] text-muted">
                  {d.lastSeen ? `Last heard ${when(d.lastSeen, now)}` : "Paired, not heard from yet"}
                </p>
              </div>
              <button
                onClick={() => setDropping(d.id)}
                aria-label={`Stop ${d.label ?? "this phone"} sending payments`}
                className="grid size-9 shrink-0 place-items-center rounded-full text-danger"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmSheet
        open={!!dropping}
        title="Stop this phone sending payments?"
        confirmLabel="Stop"
        onConfirm={() => dropping && drop(dropping)}
        onClose={() => setDropping(null)}
      >
        <p>
          Nothing already on your Money screen changes. That phone stops forwarding payments until
          you open DockIn on it again.
        </p>
      </ConfirmSheet>
    </section>
  );
}

/** "2 minutes ago", "yesterday" — close enough to judge whether it is alive. */
function when(iso: string, now: number | null): string {
  if (!now) return "recently";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * What the Android app said about itself when it opened the site: its version,
 * whether this build has the listener, and whether Android has allowed it.
 */
function readApp(): { version: string; pay: boolean; notif: boolean | null } | null {
  try {
    const version = localStorage.getItem("dockin-app");
    if (!version) return null;
    const notif = localStorage.getItem("dockin-app-notif");
    return {
      version,
      pay: localStorage.getItem("dockin-app-pay") === "1",
      notif: notif === null ? null : notif === "1",
    };
  } catch {
    return null;
  }
}
