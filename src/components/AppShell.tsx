"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChartNoAxesColumn, House, SquareCheckBig, UsersRound, UtensilsCrossed } from "lucide-react";
import { useUnreadChats } from "@/lib/chat";
import { FRIENDS } from "@/lib/features";
import { applyTextScale, applyTheme, ensureCategories, getProfile } from "@/lib/repo";
import { db } from "@/lib/db";
import { toDateStr } from "@/lib/dates";
import { ToastProvider, cx } from "./ui";
import { RemindersSync } from "./RemindersSync";
import { SocialSync } from "./SocialSync";
import { AppUpdate } from "./AppUpdate";
import { useAuth } from "@/lib/auth";
import { DockIn, appReady, isNativeApp, onPhone } from "@/lib/native";
import { setupSeen } from "@/lib/setup";
import { getSupabase } from "@/lib/supabase";
import { getSyncStatus, startSync, subscribeSync } from "@/lib/sync";
import { goTab, tabOf } from "@/lib/tabs";
import { TabHost } from "./TabHost";

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
  { href: "/cafeteria", label: "Cafeteria", icon: UtensilsCrossed },
  { href: "/tasks", label: "Tasks", icon: SquareCheckBig },
  ...(FRIENDS ? [{ href: "/circle", label: "Friends", icon: UsersRound }] : []),
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
   * The entrance animations (the stagger that rises each card in) are a first
   * impression, not something to replay on every tab tap — that replay was what
   * made moving between pages feel like the whole app reloading. Once the first
   * screen has settled, a flag on <html> turns the stagger off, so from then on
   * switching tabs is instant, the way a native app's tabs are.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      document.documentElement.dataset.navved = "1";
    }, 650);
    return () => clearTimeout(t);
  }, []);

  // A long press is for our own actions (select, delete, react) — never the
  // phone's copy / share menu. Text fields keep theirs, for paste.
  useEffect(() => {
    const block = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    document.addEventListener("selectstart", block);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
    };
  }, []);

  // Budget phones: watch ~1.5 s of frames once the first screen has settled.
  // If the phone can't keep up, switch on lite mode (no looping or blurred
  // effects) now and on every later launch.
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("lite")) return;
    let raf = 0;
    let last = 0;
    let slow = 0;
    let frames = 0;
    const start = window.setTimeout(() => {
      const tick = (t: number) => {
        if (document.visibilityState !== "visible") return;
        if (last) {
          frames++;
          if (t - last > 34) slow++; // a dropped frame or worse
        }
        last = t;
        if (frames < 90) raf = requestAnimationFrame(tick);
        else if (slow / frames > 0.25) {
          root.classList.add("lite");
          try {
            localStorage.setItem("dockin-lite", "1");
          } catch {}
        }
      };
      raf = requestAnimationFrame(tick);
    }, 2500);
    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
    };
  }, []);

  // The moment there is a real screen to show, tell the phone to drop the launch
  // splash it has been holding — so the cap animation hands straight over to the
  // app with no blank brown gap in between. This mirrors the `ready` gate below
  // that actually renders the screen, so the splash lifts exactly as it appears.
  const onboardingRoute = pathname === "/onboarding" || pathname === "/setup";
  const screenReady = !bare && !restoring && profile !== undefined && (onboardingRoute || !!profile?.onboarded);
  useEffect(() => {
    if (screenReady) appReady();
  }, [screenReady]);
  // The app's code is running: the boot watchdog in the layout can stand down.
  useEffect(() => {
    (window as unknown as { __dockinReady?: boolean }).__dockinReady = true;
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
        const to = new URL(path, window.location.href);
        if (tabOf(to.pathname)) goTab(to.pathname + to.search);
        else router.push(path);
        window.dispatchEvent(new CustomEvent("dockin-open", { detail: path }));
      }),
    [router],
  );

  /**
   * Every internal link to a tab — the tab bar, Today's cards, a back arrow — is
   * caught here, before Next's router sees it, and becomes an instant switch
   * (see lib/tabs). Links to other screens still go through Next, with a safety
   * net: if one has not opened within a few seconds, which only a stalled
   * network causes, it is loaded directly and the service worker answers from
   * the cache. Nothing waits on a dead socket any more.
   */
  const navTimer = useRef<number | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || BARE.has(window.location.pathname)) return;
      if (url.hash && url.pathname === window.location.pathname) return;
      if (tabOf(url.pathname)) {
        e.preventDefault();
        e.stopPropagation();
        goTab(url.pathname + url.search);
        return;
      }
      if (navTimer.current) window.clearTimeout(navTimer.current);
      const dest = url.pathname + url.search;
      navTimer.current = window.setTimeout(() => {
        navTimer.current = null;
        if (window.location.pathname !== url.pathname) window.location.assign(dest);
      }, 4000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    // Arrived: the safety net is no longer needed.
    if (navTimer.current) {
      window.clearTimeout(navTimer.current);
      navTimer.current = null;
    }
  }, [pathname]);


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
      // In the app: once the live site's worker (which only takes over with a
      // complete copy) is in charge, let it open screens from now on instead
      // of the copy inside the APK — that is how web updates keep arriving.
      if (isNativeApp()) {
        const live = () => {
          if (navigator.serviceWorker.controller) void DockIn.setLive({ on: true }).catch(() => {});
        };
        live();
        navigator.serviceWorker.addEventListener("controllerchange", live);
      }
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
  // The launch screen is a one-time thing. Once content has shown, a slow Dexie
  // read or an auth flicker while moving between tabs must never bring it back —
  // that looked like the whole app reopening on every navigation. It is also
  // kept in sessionStorage, so if a script-recovery reload fires mid-session
  // (see the heal script in layout) the cover does not play a second time; a
  // real fresh launch clears sessionStorage and shows it again.
  const [bootedOnce, setBootedOnce] = useState(() => {
    try {
      return sessionStorage.getItem("dockin-booted") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const t = setTimeout(() => setMinShown(true), Math.max(0, 260 - performance.now()));
    return () => clearTimeout(t);
  }, []);
  // Remember, for this app session, that the cover has already played.
  useEffect(() => {
    if (!bootedOnce) return;
    try {
      sessionStorage.setItem("dockin-booted", "1");
    } catch {}
  }, [bootedOnce]);

  // A bare page (privacy, password reset) draws on its own, with no tabs, no
  // launch screen and no sign-in gate — it may be the first DockIn page a phone
  // ever opens.
  if (bare) {
    return (
      <ToastProvider>
        <div className="paper-page mx-auto min-h-dvh w-full max-w-md">{children}</div>
      </ToastProvider>
    );
  }

  const onboarding = pathname === "/onboarding" || pathname === "/setup";
  const ready = !restoring && profile !== undefined && (onboarding || !!profile?.onboarded);
  if (ready && minShown && !bootedOnce) setBootedOnce(true);
  const showBoot = (!ready || !minShown) && !bootedOnce;
  const activeTab = tabOf(pathname);

  return (
    <ToastProvider>
      <div className={cx("paper-page mx-auto min-h-dvh w-full max-w-md", !onboarding && "page-curl")}>
        {ready && (
          <main
            className={cx(!onboarding && "pb-[calc(6.5rem+env(safe-area-inset-bottom))]")}
          >
            {/* The tabs stay mounted underneath every other screen, so coming
                back from Profile or a subject is as instant as switching tabs. */}
            {!onboarding && <TabHost active={activeTab} />}
            {(onboarding || !activeTab) && children}
          </main>
        )}
        {ready && !onboarding && <TabBar pathname={pathname} />}
        {ready && !onboarding && isNativeApp() && <RemindersSync />}
        {ready && !onboarding && FRIENDS && <SocialSync />}
        {isNativeApp() && <AppUpdate />}
      </div>
      {/* In the app the phone's own launch splash covers the load, so a second
          brown web overlay would only bring back the very gap it holds through.
          The web overlay is for the browser/PWA, where there is no native splash. */}
      <BrandHold show={showBoot && !isNativeApp()} />
    </ToastProvider>
  );
}

/**
 * Android plays the opening — the mark docking onto the brown cover — while the
 * app starts. All this does is hold that same brown for the breath between
 * Android handing over and the first screen being ready, so the two read as one
 * motion with no second splash of its own. No logo, no words: the opening has
 * already happened.
 */
function BrandHold({ show }: { show: boolean }) {
  const [mounted, setMounted] = useState(true);
  if (show && !mounted) setMounted(true);
  useEffect(() => {
    if (show) return;
    const t = setTimeout(() => setMounted(false), 360);
    return () => clearTimeout(t);
  }, [show]);
  if (!mounted) return null;
  return <div className={cx("brand-hold", !show && "brand-hold-out")} aria-hidden />;
}

function TabBar({ pathname }: { pathname: string }) {
  const attention = useNeedsAttention();
  const chats = useUnreadChats();
  const asks = useLiveQuery(() => db.friends.filter((f) => f.status === "pending" && f.theyAsked).count(), []) ?? 0;
  const unread = chats + asks;
  return (
    // A strip of stitched leather floating over the page; the current tab is a
    // glowing orange tile, the way a lit key looks on a desk.
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
    >
      <ul
        className={cx(
          "glass-nav grid h-[70px] items-center gap-0.5 rounded-[26px] px-1.5",
          TABS.length > 5 ? "grid-cols-6" : "grid-cols-5",
        )}
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="relative z-[1]">
              {/* A plain link: the shell turns the tap into an instant tab switch. */}
              <a
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-[54px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[9.5px] font-bold tracking-[0.01em] transition-[color,transform] duration-200 active:scale-95",
                  active ? "tab-glow" : "text-[#f6dcbd]/85",
                )}
              >
                <Tab label={label} icon={Icon} active={active} badge={href === "/tasks" ? attention : href === "/circle" ? unread : 0} />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The inside of a tab. There is no "loading" state any more, and no timer that
 * reloads the page if a tab is slow — a tab switch has nothing to wait for.
 */
function Tab({
  label,
  icon: Icon,
  active,
  badge,
}: {
  label: string;
  icon: typeof House;
  active: boolean;
  badge: number;
}) {
  return (
    <>
      <span className="relative">
        <Icon size={21} strokeWidth={active ? 2.4 : 2} />
        {badge > 0 && (
          <span
            className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full border border-[#6c3416] bg-danger px-1 text-[10px] font-bold text-white tabular-nums"
            aria-label={`${badge} need attention`}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate px-0.5">{label}</span>
    </>
  );
}

