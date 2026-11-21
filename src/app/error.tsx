"use client";

import { useEffect } from "react";
import { House, RotateCcw, TriangleAlert, WifiOff } from "lucide-react";
import { useNet } from "@/lib/net";

/**
 * The safety net for a screen that throws while rendering.
 *
 * Without this, a single bad value from Camu (or anywhere) does not just break
 * one card — React tears the whole tree down, and because the error happens
 * during a tab's navigation, the move is abandoned and the app simply stays put.
 * That is the "I tap Attendance and nothing happens, it's stuck" bug: not a
 * frozen app, a crashed render with nowhere to land.
 *
 * Now the crash lands here instead. The navigation completes onto a real screen,
 * "Try again" re-renders the page that failed, and a full reset is one tap away
 * for the rare case where the code on the phone itself is out of date.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // So a screenshot of the console (or a future on-device log) shows what broke.
    console.error("[dockin] screen crashed:", error);
  }, [error]);

  // Offline, the likely cause is a part of the app this phone has not saved yet.
  // Say so plainly, and never offer the reset: it would delete the saved copy.
  const offline = useNet().offline || (typeof navigator !== "undefined" && navigator.onLine === false);

  const hardReset = () => {
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((rs) => {
          rs.forEach((r) => {
            if (r.active) r.active.postMessage("dockin-reset");
            r.unregister();
          });
        });
      }
      if ("caches" in window) {
        caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).finally(() => location.reload());
        return;
      }
    } catch {}
    location.reload();
  };

  return (
    <main className="page-wash grid min-h-dvh place-items-center px-6">
      <div className="lift w-full max-w-sm rounded-3xl bg-surface p-6 text-center">
        {offline ? (
          <>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-mess-soft text-mess">
              <WifiOff size={26} />
            </span>
            <h1 className="mt-4 text-[20px] font-extrabold tracking-tight">Not saved for offline yet</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Open this once with internet and it works offline after that. Your data is safe, and the rest of DockIn
              works right now.
            </p>
            {/* A plain link: the app turns it into an instant switch to Today. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="btn-leather mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold"
            >
              <House size={18} /> Go to Today
            </a>
          </>
        ) : (
          <>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
              <TriangleAlert size={26} />
            </span>
            <h1 className="mt-4 text-[20px] font-extrabold tracking-tight">This screen hit a snag</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Something on this page couldn&rsquo;t load. Your data is safe — nothing was lost.
            </p>
          </>
        )}

        {!offline && (
          <>
            <button
              onClick={reset}
              className="btn-leather mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold"
            >
              <RotateCcw size={18} /> Try again
            </button>
            <button
              onClick={hardReset}
              className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl text-[13.5px] font-semibold text-muted underline-offset-2 active:underline"
            >
              Still stuck? Reset the app
            </button>
          </>
        )}

        {(error?.message || error?.digest) && (
          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-[12px] font-semibold text-muted">Technical details</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-card p-3 text-[11px] leading-snug text-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
              {error?.message}
              {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
