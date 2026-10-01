"use client";

import { useEffect, type ReactNode } from "react";
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
import { applyTheme, getProfile } from "@/lib/repo";
import { ToastProvider, cx } from "./ui";

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
    if (profile) applyTheme(profile.theme);
  }, [profile]);

  useEffect(() => {
    if (profile === undefined) return;
    const onboarded = !!profile?.onboarded;
    if (!onboarded && pathname !== "/onboarding") router.replace("/onboarding");
    if (onboarded && pathname === "/onboarding") router.replace("/");
  }, [profile, pathname, router]);

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

  const onboarding = pathname === "/onboarding";
  const ready = profile !== undefined && (onboarding || !!profile?.onboarded);

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-bg">
        {ready ? (
          <main className={cx(!onboarding && "pb-[calc(5.5rem+env(safe-area-inset-bottom))]")}>
            {children}
          </main>
        ) : (
          <div className="grid min-h-dvh place-items-center">
            <div className="size-8 animate-pulse rounded-lg bg-surface-2" />
          </div>
        )}
        {ready && !onboarding && <TabBar pathname={pathname} />}
      </div>
    </ToastProvider>
  );
}

function TabBar({ pathname }: { pathname: string }) {
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
                <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
