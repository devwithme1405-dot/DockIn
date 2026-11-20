"use client";

import { Component, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import TodayPage from "@/app/page";
import AttendancePage from "@/app/attendance/page";
import TimetablePage from "@/app/timetable/page";
import CafeteriaPage from "@/app/cafeteria/page";
import TasksPage from "@/app/tasks/page";
import CirclePage from "@/app/circle/page";
import SettingsPage from "@/app/settings/page";
import RouteError from "@/app/error";
import { TAB_PATHS, TAB_SHOWN, type TabPath } from "@/lib/tabs";

const SCREENS: Record<TabPath, ComponentType> = {
  "/": TodayPage,
  "/attendance": AttendancePage,
  "/timetable": TimetablePage,
  "/cafeteria": CafeteriaPage,
  "/tasks": TasksPage,
  "/circle": CirclePage,
  "/settings": SettingsPage,
};

/**
 * The five tab screens, kept alive.
 *
 * This is what makes the tabs instant. A tab used to be a page navigation:
 * Next fetched the route's data from the server, then the screen remounted,
 * re-queried the database and replayed its entrance. On a weak signal that
 * fetch was the freeze. Now each screen is rendered once and then only shown or
 * hidden — a tap is a CSS toggle, with the data and the scroll position exactly
 * where you left them.
 *
 * The screen you open with renders first; the other four are brought up quietly
 * in idle moments right after, so the first tap on any of them is already ready.
 */
export function TabHost({ active }: { active: TabPath | null }) {
  const [mounted, setMounted] = useState<ReadonlySet<TabPath>>(() => new Set(active ? [active] : []));
  // A tab opened before its idle turn came mounts on the spot.
  if (active && !mounted.has(active)) setMounted(new Set([...mounted, active]));

  useEffect(() => {
    let cancelled = false;
    const idle = (cb: () => void) => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(cb, { timeout: 1200 });
      else window.setTimeout(cb, 120);
    };
    const step = (left: number) => {
      if (cancelled || left <= 0) return;
      setMounted((prev) => {
        // Friends and Profile are heavier and opened less: they mount on first
        // open instead, so start-up stays light.
        const next = TAB_PATHS.find((p) => !prev.has(p) && p !== "/circle" && p !== "/settings");
        return next ? new Set([...prev, next]) : prev;
      });
      idle(() => step(left - 1));
    };
    // After the first screen has painted, one tab per idle moment.
    const start = window.setTimeout(() => idle(() => step(TAB_PATHS.length)), 600);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, []);

  // Each tab keeps its own scroll position, the way native tabs do.
  const scrolls = useRef(new Map<TabPath, number>());
  const shown = useRef<TabPath | null>(active);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (shown.current) scrolls.current.set(shown.current, window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    if (shown.current === active) return;
    shown.current = active;
    if (!active) return;
    window.scrollTo(0, scrolls.current.get(active) ?? 0);
    window.dispatchEvent(new CustomEvent(TAB_SHOWN, { detail: active }));
  }, [active]);

  return (
    <>
      {TAB_PATHS.map((path) => {
        if (!mounted.has(path)) return null;
        const Screen = SCREENS[path];
        return (
          <div key={path} hidden={path !== active} className="tab-show">
            <ScreenBoundary>
              <Screen />
            </ScreenBoundary>
          </div>
        );
      })}
    </>
  );
}

/**
 * The safety net for one tab. The tabs live in the layout now, outside the
 * route's own error.tsx, so each gets the same "hit a snag / Try again" screen
 * here — and a crash in one tab never takes the other four down with it.
 */
class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) return <RouteError error={this.state.error} reset={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
