"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChartNoAxesColumn, House, SquareCheckBig, Wallet } from "lucide-react";
import { FRIENDS } from "@/lib/features";
import { applyTextScale, applyTheme, ensureCategories, getProfile } from "@/lib/repo";
import { db } from "@/lib/db";
import { toDateStr } from "@/lib/dates";
import { ToastProvider, cx } from "./ui";
import { BootSplash } from "./BootSplash";
import { useAuth } from "@/lib/auth";
import { isNativeApp, onPhone } from "@/lib/native";
import { setupSeen } from "@/lib/setup";
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
      if (!FRIENDS) return mine;
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
  { href: "/", label: "Today", icon: House },
  { href: "/attendance", label: "Attendance", icon: ChartNoAxesColumn },
  { href: "/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/tasks", label: "Tasks", icon: SquareCheckBig },
];

/**
 * Pages that stand on their own, outside the app's tabs and its sign-in gate:
 * the privacy page Google Play needs, and the password-reset link, which a
 * phone that has never run DockIn must be able to open.
 */
const BARE = new Set(["/privacy", "/reset"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const bare = BARE.has(pathname);
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
    // Never keep someone waiting on a slow network: open the app regardless
    // after a few seconds.
    if (!userId) return;
    const t = setTimeout(() => setGaveUp(true), 5000);
    return () => clearTimeout(t);
  }, [userId]);

  /**
   * Hold the launch screen only when there is genuinely nothing to show.
   *
   * Waiting for the first sync makes sense on a phone that has just signed in
   * and has no data of its own — showing an empty app and filling it in a
   * second later would look like everything had been lost. On every other
   * launch the data is already here, and waiting on the network to confirm what
   * is already on the screen is how an app on a bad signal feels broken.
   */
  const restoring = authLoading || (!!userId && profile === null && !sync.ready && !gaveUp);

  useEffect(() => {
    if (bare) return;
    if (profile === undefined) return;
    if (profile === null && (authLoading || (userId && !sync.ready && !gaveUp))) return;
    const onboarded = !!profile?.onboarded;
    if (!onboarded && pathname !== "/onboarding") router.replace("/onboarding");
    if (onboarded && pathname === "/onboarding") router.replace("/");
    // In the app, the one-time setup (Camu, LMS, permissions) comes straight
    // after onboarding — and once for anyone who had the app before it existed.
    if (onboarded && pathname !== "/setup" && isNativeApp() && !setupSeen()) router.replace("/setup");
  }, [bare, profile, pathname, router, authLoading, userId, sync.ready, gaveUp]);

  useEffect(() => {
    void ensureCategories();
  }, []);

  /**
   * DockIn's own notifications say which screen to open ("Spent ₹250 at
   * Zomato" opens Money). The phone holds on to the request until this
   * listener exists, so it works from a cold start as well as from the
   * background.
   */
  useEffect(
    () =>
      onPhone("open", ({ path }) => {
        router.push(path);
        // A screen already open (Money) still hears which payment to show.
        window.dispatchEvent(new CustomEvent("dockin-open", { detail: path }));
      }),
    [router],
  );

  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      // The stamp lives inside the script now, not in this address: the page
      // asking for it is usually served from the cache, where its own stamp is
      // out of date, so a stamp here would pin the worker to whatever build the
      // cached page came from.
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

  // Just long enough not to flash. It used to be 900ms, which on a phone that
  // was ready in 200 was two thirds of a second of staring at a logo for no
  // reason — and the first thing anybody notices about an app is how long it
  // takes to show them something.
  const [minShown, setMinShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinShown(true), Math.max(0, 260 - performance.now()));
    return () => clearTimeout(t);
  }, []);

  // A bare page (privacy, password reset) draws on its own, with no tabs, no
  // launch screen and no sign-in gate — it may be the first DockIn page a phone
  // ever opens.
  if (bare) {
    return (
      <ToastProvider>
        <div className="mx-auto min-h-dvh w-full max-w-md bg-bg">{children}</div>
      </ToastProvider>
    );
  }

  const onboarding = pathname === "/onboarding" || pathname === "/setup";
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
      <ul className={cx("grid", TABS.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
                <Tab
                  href={href}
                  label={label}
                  icon={Icon}
                  active={active}
                  badge={href === "/tasks" ? attention : 0}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The inside of a tab, which knows whether its own navigation is still running.
 *
 * There used to be a blind timer here: if the page had not changed within a
 * second and a half, load it the hard way. That was meant for a tab that would
 * not open at all, but it cannot tell "broken" from "slow" — so on a weak
 * signal an ordinary tap turned into a full page reload, and the app appeared
 * to reload itself over and over.
 *
 * `useLinkStatus` says whether this link's navigation is actually still
 * pending. So the tap can show that something is happening, and the hard
 * fallback waits for a length of time that no working navigation reaches.
 */
function Tab({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof House;
  active: boolean;
  badge: number;
}) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      if (window.location.pathname !== href) window.location.assign(href);
    }, 6000);
    return () => clearTimeout(t);
  }, [pending, href]);

  return (
    <>
      <span className={cx("relative transition-opacity", pending && "opacity-50")}>
        <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
        {badge > 0 && (
          <span
            className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums"
            aria-label={`${badge} need attention`}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {label}
    </>
  );
}

