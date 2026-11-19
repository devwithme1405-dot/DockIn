/**
 * The five tabs, and how moving between them works.
 *
 * Tabs do not go through Next's router. Every tab screen stays mounted in
 * TabHost and is only shown or hidden, so switching is a CSS toggle — no network,
 * no remount, no re-query, nothing to wait for. The address bar is moved with the
 * native History API, which Next itself supports and keeps usePathname /
 * useSearchParams in step with, without fetching anything.
 *
 * Back behaves like a native app's tab bar: from any tab it returns to Today,
 * then leaves — rather than replaying every tab you ever tapped.
 */

/**
 * Screens kept alive in the TabHost: the bottom-bar tabs plus Profile, which
 * opens from Today's header. Opening any of these is a show/hide, never a
 * page load, so none of them can freeze on a weak signal.
 */
export const TAB_PATHS = ["/", "/attendance", "/timetable", "/cafeteria", "/tasks", "/circle", "/settings"] as const;
export type TabPath = (typeof TAB_PATHS)[number];

const SET = new Set<string>(TAB_PATHS);

/** The tab a path belongs to, or null for any other screen. Exact match only. */
export function tabOf(pathname: string): TabPath | null {
  return SET.has(pathname) ? (pathname as TabPath) : null;
}

/** Sent after a tab has become the visible one; detail is the tab path. */
export const TAB_SHOWN = "dockin:tab";

type Marked = { dockinFromToday?: boolean } | null;

/** Show a tab (optionally with a query, e.g. "/timetable?view=calendar"). */
export function goTab(url: string): void {
  const to = new URL(url, window.location.href);
  const target = to.pathname + to.search;
  const here = window.location.pathname + window.location.search;

  // Tapping the tab you are on scrolls it back to the top, like every app.
  if (target === here) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const state = window.history.state as Marked;
  if (window.location.pathname === "/") {
    // Leaving Today: keep Today underneath, so Back comes home.
    window.history.pushState({ dockinFromToday: true }, "", target);
  } else if (!tabOf(window.location.pathname)) {
    // From a screen like Profile: a normal step forward, Back returns to it.
    window.history.pushState({ dockinFromToday: false }, "", target);
  } else if (to.pathname === "/" && state?.dockinFromToday) {
    // Going home when home is the entry right behind us: just step back.
    window.history.back();
  } else {
    // Tab to tab: swap the entry in place, carrying the "home is behind" mark.
    window.history.replaceState({ dockinFromToday: !!state?.dockinFromToday }, "", target);
  }
}
