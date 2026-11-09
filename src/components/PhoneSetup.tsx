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
  const [done, setDone] = useState<Record<string, boolean>>(() => readTicks());

  function tick(key: string) {
    setDone((d) => {
      const next = { ...d, [key]: !d[key] };
      try {
        localStorage.setItem(TICKS, JSON.stringify(next));
      } catch {
        // private mode: the tick just lasts this visit
      }
      return next;
    });
  }

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

  const ready = (status.listening || !!status.screen) && status.notifications === "granted";
  const oem = oemGuide(status.maker);
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
      toast.show("Sent. It should drop down from the top — tap Split to see the sheet.");
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
              : "DockIn reads payments from GPay, PhonePe, Paytm, Slice, your bank or any app, and asks where the money went. Chats are never read. It all stays on this phone."}
          </p>
        </div>
      </div>

      <ol className="mt-4 border-t border-line">
        {status.screen !== undefined && (
          <Step
            done={status.screen}
            title="Catch the moment I pay"
            body={
              status.screen
                ? "On. The moment PhonePe, Paytm, GPay, BHIM, Slice or CRED says “Payment successful”, DockIn's alert drops down — no SMS needed."
                : "The fastest and surest way. In Accessibility, open “DockIn payment screens” and turn it on. Only payment apps are read, only the amount and who you paid, and it never leaves this phone."
            }
            action={
              !status.screen && (
                <ActionButton busy={busy === "screen"} onClick={() => run("screen", () => DockIn.openScreenSettings())}>
                  Turn on
                </ActionButton>
              )
            }
          >
            {!status.screen && restricted && (
              <div className="mt-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
                Switch greyed out, or &ldquo;Restricted setting&rdquo;? Open <b className="text-text">App info</b>, tap{" "}
                <b className="text-text">⋮</b> at the top right, choose{" "}
                <b className="text-text">Allow restricted settings</b>, then tap Turn on again.
                <button
                  onClick={() => run("appinfo", () => DockIn.openAppSettings())}
                  className="mt-2 flex items-center gap-1 font-medium text-accent"
                >
                  Open App info <ChevronRight size={14} />
                </button>
              </div>
            )}
          </Step>
        )}

        <Step
          done={status.notifications === "granted"}
          title="Let DockIn notify you"
          body={
            status.notifications === "granted"
              ? "On. One alert per payment, with For me and Split right on it."
              : "The payment alert is a notification, so DockIn must be allowed to send them."
          }
          action={
            status.notifications !== "granted" && (
              <ActionButton busy={busy === "notif"} onClick={allowNotifications}>
                Allow
              </ActionButton>
            )
          }
        />

        <Step
          done={!!done.channel}
          title="Show payment alerts on top"
          body="So the alert drops down over any app instead of hiding in the tray: in Payments, turn on “Pop on screen” (also called Floating notifications, Banners or Heads-up), sound and lock screen."
          action={
            <span className="flex flex-col items-end gap-1.5">
              <ActionButton busy={busy === "channel"} onClick={() => run("channel", () => DockIn.openOemSettings({ which: "channel" }))}>
                Open
              </ActionButton>
              <Tick on={!!done.channel} onClick={() => tick("channel")} />
            </span>
          }
        />

        <Step
          done={status.listening}
          title="Also read payment notifications"
          body={
            status.listening
              ? "On. Catches GPay, CRED and bank apps that announce a payment, and card payments too."
              : "A second way in, for apps that post a “You paid” notification. Only payment apps are looked at."
          }
          action={
            !status.listening && (
              <ActionButton busy={busy === "listen"} onClick={() => run("listen", () => DockIn.openListenerSettings())}>
                Turn on
              </ActionButton>
            )
          }
        />

        {oem && (
          <Step
            done={!!done.oem}
            title={`${oem.name}: never stop DockIn`}
            body={oem.how}
            action={
              <span className="flex flex-col items-end gap-1.5">
                {oem.buttons.map((b) => (
                  <ActionButton key={b.which} busy={busy === b.which} onClick={() => run(b.which, () => DockIn.openOemSettings({ which: b.which }))}>
                    {b.label}
                  </ActionButton>
                ))}
                <Tick on={!!done.oem} onClick={() => tick("oem")} />
              </span>
            }
          />
        )}

        {status.battery !== undefined && (
          <Step
            done={status.battery}
            title="No battery restrictions"
            body={
              status.battery
                ? "On. Android will not put DockIn to sleep."
                : "Choose “Allow” (or “Unrestricted”) so Android never pauses DockIn in the background."
            }
            action={
              !status.battery && (
                <ActionButton busy={busy === "battery"} onClick={() => run("battery", () => DockIn.openBatterySettings())}>
                  Allow
                </ActionButton>
              )
            }
          />
        )}
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
            <BellRing size={13} /> Test alert
          </button>
        )}
      </div>
      <DetectionLog />
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
  if ((status.listening || status.screen) && status.notifications === "granted") return null;
  return (
    <Link
      href="/settings#phone"
      className="mx-5 mt-4 flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-accent"
    >
      <Radio size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 text-[13.5px] font-medium">
        {status.listening || status.screen ? "Allow notifications so DockIn can ask after each payment" : "Turn on payment detection — two taps"}
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

const TICKS = "dockin.phone-ticks";

function readTicks(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(TICKS) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** For switches Android will not let an app read back: the person ticks them. */
function Tick({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx("text-[12px] font-medium", on ? "text-safe" : "text-muted underline")}>
      {on ? "Done ✓" : "Mark done"}
    </button>
  );
}

type OemWhich = "autostart" | "battery";

/** Each maker's own "let it run" switches, which stock Android does not have. */
export function oemGuide(maker: string): { name: string; how: string; buttons: { label: string; which: OemWhich }[] } | null {
  const m = maker.toLowerCase();
  const lock = " Then open Recents, long-press the DockIn card and tap the lock, so “clear all” never stops it.";
  if (/xiaomi|redmi|poco/.test(m))
    return {
      name: "Xiaomi",
      how: "Turn on Autostart, and set Battery saver to “No restrictions”." + lock,
      buttons: [
        { label: "Autostart", which: "autostart" },
        { label: "Battery", which: "battery" },
      ],
    };
  if (/samsung/.test(m))
    return {
      name: "Samsung",
      how: "In Battery › Background usage limits, make sure DockIn is not in Sleeping or Deep sleeping apps — add it to Never sleeping apps.",
      buttons: [{ label: "Battery", which: "autostart" }],
    };
  if (/oneplus|oppo|realme/.test(m))
    return {
      name: /oneplus/.test(m) ? "OnePlus" : /realme/.test(m) ? "realme" : "OPPO",
      how: "Turn on Auto launch, and in App info › Battery choose “Allow background activity”." + lock,
      buttons: [{ label: "Auto launch", which: "autostart" }],
    };
  if (/vivo|iqoo/.test(m))
    return {
      name: /iqoo/.test(m) ? "iQOO" : "vivo",
      how: "Allow Autostart, and in Battery › Background power consumption, allow DockIn high background power use." + lock,
      buttons: [
        { label: "Autostart", which: "autostart" },
        { label: "Battery", which: "battery" },
      ],
    };
  return null;
}

interface LogLine {
  at: number;
  kind: "caught" | "twin" | "missed" | "off";
  app: string;
  text: string;
  ms?: number;
}

/**
 * What detection saw lately. When a payment is missed, "Copy" hands over the
 * screen it did not understand (long numbers masked), so it can be taught.
 */
function DetectionLog() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);

  async function load() {
    try {
      const r = await DockIn.payLog();
      setLines((JSON.parse(r.lines) as LogLine[]).reverse());
    } catch {
      setLines([]);
    }
  }

  async function copy() {
    const text = lines
      .map((l) => `${new Date(l.at).toLocaleString("en-IN")} ${l.kind} ${l.app}${l.ms != null ? ` ${l.ms}ms` : ""}\n${l.text}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text || "empty");
      toast.show("Copied. Paste it to whoever is fixing it.");
    } catch {
      toast.show("Could not copy on this phone.");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="mt-3 text-[12.5px] font-medium text-muted underline"
      >
        Detection log
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-2xl bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold">Detection log</p>
        <span className="flex gap-3 text-[12.5px] font-medium text-accent">
          <button onClick={copy}>Copy</button>
          <button onClick={() => setOpen(false)}>Close</button>
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="text-[12.5px] text-muted">Nothing yet. Pay someone and it shows here.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {lines.map((l, i) => (
            <li key={i} className="text-[12px] leading-snug">
              <span className={cx("font-semibold", l.kind === "missed" || l.kind === "off" ? "text-danger" : "text-safe")}>
                {l.kind === "caught" ? "Caught" : l.kind === "twin" ? "Same payment again" : l.kind === "missed" ? "Not read" : "Switched off"}
              </span>
              <span className="text-muted">
                {" "}· {new Date(l.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                {l.ms != null && l.kind === "caught" ? ` · ${l.ms < 1000 ? `${l.ms} ms` : `${(l.ms / 1000).toFixed(1)} s`}` : ""}
              </span>
              <p className="break-words text-muted">{l.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
