"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarCheck,
  CalendarDays,
  ListChecks,
  Sun,
  Wallet,
} from "lucide-react";
import { applyTextScale, applyTheme, ensureCategories, getProfile } from "@/lib/repo";
import { db } from "@/lib/db";
import { toDateStr } from "@/lib/dates";
import { ToastProvider, cx } from "./ui";
import { BootSplash } from "./BootSplash";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getSyncStatus, startSync, subscribeSync } from "@/lib/sync";

/**
 * How many things want attention right now: your own tasks that are overdue or
 * due today, plus anything shared with you that you have not ticked off. It
 * rides on the Tasks tab so the nudge is there without a notification.
 */
function useNeedsAttention(): number {
  return (
    useLiveQuery(async () => {
      const today = toDateStr();
      const mine = await db.tasks
        .filter((t) => !t.deletedAt && !t.done && !!t.dueDate && t.dueDate <= today)
        .count();
      const states = new Map((await db.shareState.toArray()).map((s) => [s.id, s]));
      const shared = (await db.shares.toArray()).filter((s) => {
        const st = states.get(s.id);
        if (st?.done || st?.hidden) return false;
        return !s.dueDate || s.dueDate <= today;
      }).length;
      return mine + shared;
    }, []) ?? 0
  );
}

const TABS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = still loading, null = no profile yet
  const profile = useLiveQuery(() => getProfile(), []);

  useEffect(() => {
    if (!profile) return;
    applyTheme(profile.theme);
    applyTextScale(profile.textScale);
    if (profile.theme !== "system") return;
    // "System" follows the phone live, e.g. when it switches to dark at sunset.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [profile]);

  // Cloud sync runs in the background for signed-in students.
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const sync = useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) return;
    return startSync(sb, userId);
  }, [userId]);
  useEffect(() => {
    // Never keep someone waiting on a slow network: open the app after a few seconds.
    if (!userId) return;
    const t = setTimeout(() => setGaveUp(true), 6000);
    return () => clearTimeout(t);
  }, [userId]);
  const restoring = authLoading || (!!userId && !sync.ready && !gaveUp);

  useEffect(() => {
    if (profile === undefined) return;
    if (profile === null && (authLoading || (userId && !sync.ready && !gaveUp))) return;
    const onboarded = !!profile?.onboarded;
    if (!onboarded && pathname !== "/onboarding") router.replace("/onboarding");
    if (onboarded && pathname === "/onboarding") router.replace("/");
  }, [profile, pathname, router, authLoading, userId, sync.ready, gaveUp]);

  useEffect(() => {
    void ensureCategories();
  }, []);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else if ("serviceWorker" in navigator) {
      // Dev mode: a worker left over from an earlier production run on this
      // address would keep serving old pages, so remove it and its caches.
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }, []);

  // The launch screen stays up for a moment even on fast phones so it never just flickers.
  const [minShown, setMinShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinShown(true), Math.max(0, 900 - performance.now()));
    return () => clearTimeout(t);
  }, []);

  const onboarding = pathname === "/onboarding";
  const ready = !restoring && profile !== undefined && (onboarding || !!profile?.onboarded);

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-bg">
        {ready && (
          <main className={cx(!onboarding && "pb-[calc(5.5rem+env(safe-area-inset-bottom))]")}>
            {children}
          </main>
        )}
        {ready && !onboarding && <TabBar pathname={pathname} />}
      </div>
      <BootSplash show={!ready || !minShown} message={restoring && userId ? "Getting your data…" : undefined} />
    </ToastProvider>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  const attention = useNeedsAttention();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
                  {href === "/tasks" && attention > 0 && (
                    <span
                      className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums"
                      aria-label={`${attention} need attention`}
                    >
                      {attention > 9 ? "9+" : attention}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
