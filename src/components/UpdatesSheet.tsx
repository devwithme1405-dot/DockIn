"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Globe, Loader2, Smartphone, Sparkles } from "lucide-react";
import { COMING, RELEASES, releaseDate } from "@/lib/changelog";
import { DockIn, isNativeApp } from "@/lib/native";
import { isOffline } from "@/lib/net";
import { Button, cx } from "./ui";

type Check = { state: "checking" } | { state: "latest" } | { state: "available"; name: string } | { state: "unknown" };

/**
 * Profile → Updates: is this phone up to date, what's coming, and what each
 * past update brought. Lives inside a Sheet, so it needs no page of its own and
 * opens offline like the rest of Profile.
 */
export function UpdatesSheet({ version, onUpdate }: { version?: string; onUpdate: () => void }) {
  const native = isNativeApp();
  const [check, setCheck] = useState<Check>(() => (native && !isOffline() ? { state: "checking" } : { state: "unknown" }));

  useEffect(() => {
    if (!native || isOffline()) return;
    let alive = true;
    DockIn.checkUpdate()
      .then((u) => alive && setCheck(u.latest > u.current ? { state: "available", name: u.name } : { state: "latest" }))
      .catch(() => alive && setCheck({ state: "unknown" }));
    return () => {
      alive = false;
    };
  }, [native]);

  return (
    <div className="space-y-5 pb-2">
      {/* this phone */}
      <section className="rounded-2xl border border-line/70 bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            {native ? <Smartphone size={22} /> : <Globe size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-bold">{native ? `DockIn ${version || ""}`.trim() : "DockIn on the web"}</p>
            <p className="text-[13px] text-muted">
              {!native
                ? "The website is always the newest version."
                : check.state === "checking"
                  ? "Checking for an update…"
                  : check.state === "latest"
                    ? "You're on the newest version."
                    : check.state === "available"
                      ? `Update ready: ${check.name}`
                      : "Couldn't check right now — it checks again by itself."}
            </p>
          </div>
          {check.state === "checking" && <Loader2 size={18} className="shrink-0 animate-spin text-muted" />}
          {check.state === "latest" && <CheckCircle2 size={20} className="shrink-0 text-safe" />}
        </div>
        {check.state === "available" && (
          <Button className="mt-3 w-full" onClick={onUpdate}>
            <Download size={17} /> Update now
          </Button>
        )}
      </section>

      {/* planned */}
      <section>
        <h3 className="mb-2 px-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Coming next</h3>
        <ul className="space-y-2">
          {COMING.map((c) => (
            <li key={c.title} className="rounded-2xl border border-dashed border-line px-4 py-3">
              <p className="text-[14.5px] font-semibold">{c.title}</p>
              <p className="text-[13px] text-muted">{c.sub}</p>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 px-1 text-[12px] text-muted">Planned, not built yet.</p>
      </section>

      {/* history */}
      <section>
        <h3 className="mb-2 px-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Past updates</h3>
        <ol className="relative space-y-3 border-l-2 border-dashed border-line pl-4 ml-2">
          {RELEASES.map((r, i) => (
            <li key={`${r.date}-${r.title}`} className="relative">
              <span
                aria-hidden
                className={cx(
                  "absolute top-4 -left-[23px] size-3 rounded-full ring-4 ring-[var(--bg)]",
                  i === 0 ? "bg-orange" : "bg-line",
                )}
              />
              <div className="rounded-2xl border border-line/70 bg-surface p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[12.5px] font-semibold text-muted">{releaseDate(r.date)}</span>
                  {i === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange/15 px-2 py-0.5 text-[11px] font-bold text-orange">
                      <Sparkles size={11} /> New
                    </span>
                  )}
                  <span
                    className={cx(
                      "rounded-full px-2 py-0.5 text-[11px] font-bold",
                      r.app ? "bg-accent-soft text-accent" : "bg-mess-soft text-muted",
                    )}
                  >
                    {r.app ? "App update" : "Automatic"}
                  </span>
                </div>
                <p className="mt-1 text-[16px] font-bold leading-snug">{r.title}</p>
                <ul className="mt-2 space-y-1.5">
                  {r.items.map((it) => (
                    <li key={it} className="flex gap-2 text-[13.5px] leading-snug">
                      <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent/60" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 px-1 text-[12px] text-muted">
          “App update” changes arrive with the app update. “Automatic” ones reach your phone by themselves when DockIn opens.
        </p>
      </section>
    </div>
  );
}
