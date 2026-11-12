"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Loader2, Radio, Smartphone } from "lucide-react";
import { DockIn, isNativeApp, onPhone, type PhoneStatus } from "@/lib/native";
import { cx, useToast } from "./ui";

/**
 * The phone's switches, read live and fixed in one tap each.
 *
 * Inside the Android app the only thing to turn on is notifications, so class
 * and task reminders can reach you — plus, on phones that aggressively sleep
 * apps, letting DockIn run in the background so those reminders actually fire.
 * Each line says whether it is on, and the button opens the exact Android
 * screen that changes it. Coming back to the app re-reads it all.
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

/** The switches that matter for reminders, for a one-line summary. */
export function phoneChecklist(status: PhoneStatus): { key: string; on: boolean }[] {
  const list = [{ key: "notifications", on: status.notifications === "granted" }];
  if (status.battery !== undefined) list.push({ key: "battery", on: status.battery });
  return list;
}

export function PhoneSetup({ bare = false }: { bare?: boolean }) {
  const toast = useToast();
  const { status, native, reload } = usePhoneStatus();
  const [busy, setBusy] = useState<string | null>(null);

  if (!native) return <GetTheApp />;

  if (!status) {
    return (
      <Card bare={bare}>
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" /> Checking this phone…
        </p>
      </Card>
    );
  }

  const ready = status.notifications === "granted" && status.battery !== false;
  const oem = oemGuide(status.maker);

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

  return (
    <Card bare={bare}>
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
          <p className="text-[15px] font-medium">{ready ? "Reminders are set up" : "Let DockIn remind you"}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {ready
              ? "DockIn can nudge you before a class, an assignment, or an exam."
              : "Turn on notifications so DockIn can remind you before a class, an assignment, or an exam."}
          </p>
        </div>
      </div>

      <ol className="mt-4 border-t border-line">
        <Step
          done={status.notifications === "granted"}
          title="Let DockIn notify you"
          body={
            status.notifications === "granted"
              ? "On. Class, assignment and exam reminders can reach you."
              : "Reminders are notifications, so DockIn must be allowed to send them."
          }
          action={
            status.notifications !== "granted" && (
              <ActionButton busy={busy === "notif"} onClick={allowNotifications}>
                Allow
              </ActionButton>
            )
          }
        />

        {oem && (
          <Step
            done={false}
            title={`${oem.name}: never stop DockIn`}
            body={oem.how}
            action={
              <span className="flex flex-col items-end gap-1.5">
                {oem.buttons.map((b) => (
                  <ActionButton key={b.which} busy={busy === b.which} onClick={() => run(b.which, () => DockIn.openOemSettings({ which: b.which }))}>
                    {b.label}
                  </ActionButton>
                ))}
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
                ? "On. Android will not put DockIn to sleep, so reminders fire on time."
                : "Choose “Allow” (or “Unrestricted”) so Android never pauses DockIn, and reminders fire on time."
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
      </div>
    </Card>
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
          <p className="text-[15px] font-medium">Reminders need the Android app</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {onAndroid
              ? "Install DockIn once. It is this same app, plus it can remind you before classes and deadlines."
              : "Open DockIn on your Android phone to get reminders before classes and deadlines."}
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

function Card({ children, bare }: { children: ReactNode; bare?: boolean }) {
  if (bare) return <section id="phone">{children}</section>;
  return (
    <section id="phone" className="lift scroll-mt-20 rounded-3xl bg-surface p-4">
      <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">Reminders from your phone</h2>
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
