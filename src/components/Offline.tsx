"use client";

import { useState, type CSSProperties } from "react";
import {
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  ChevronRight,
  CloudUpload,
  House,
  MessageCircle,
  ScanLine,
  WifiLow,
  SquareCheckBig,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { FRIENDS } from "@/lib/features";
import { acceptWeak, dismissWeak, retryNow, useNet } from "@/lib/net";
import { showMessPass } from "@/lib/messPass";
import { goTab } from "@/lib/tabs";
import { Sheet, cx } from "./ui";

/**
 * Everything offline mode shows: the strip at the top (offline, or a moment of
 * "Back online"), the sheet it opens (what works offline, one tap each), and
 * the "low network detected multiple times" prompt.
 */
export function OfflineLayer() {
  const net = useNet();
  const [sheet, setSheet] = useState(false);
  return (
    <>
      {(net.offline || net.back) && <OfflineStrip back={!net.offline && net.back} onOpen={() => setSheet(true)} />}
      <OfflineSheet open={sheet && net.offline} chosen={net.chosen} onClose={() => setSheet(false)} />
      {net.weak && !net.offline && <WeakPrompt />}
    </>
  );
}

/** The strip under the status bar. Every header leaves room for it (--sat). */
function OfflineStrip({ back, onOpen }: { back: boolean; onOpen: () => void }) {
  return (
    <div className="offline-strip fixed inset-x-0 top-0 z-[60]" role="status" aria-live="polite">
      <div className="mx-auto flex h-9 max-w-md items-center justify-center px-4">
        {back ? (
          <span className="offline-pill offline-pill-back">
            <Check size={14} strokeWidth={3} />
            <span>Back online</span>
            <span className="opacity-80">· syncing</span>
          </span>
        ) : (
          <button onClick={onOpen} className="offline-pill" aria-label="Offline mode. See what works offline">
            <span className="offline-dot" aria-hidden />
            <WifiOff size={13} strokeWidth={2.6} />
            <span>Offline mode</span>
            <span className="opacity-75">· everything&rsquo;s saved</span>
            <ChevronRight size={13} strokeWidth={2.6} className="-mr-1 opacity-75" />
          </button>
        )}
      </div>
    </div>
  );
}

type Spot = { label: string; note: string; icon: LucideIcon; tint: string; go: () => void };

/** Navigate once the sheet's own Back entry has been stepped over. */
function afterClose(fn: () => void) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", onPop);
    fn();
  };
  const onPop = () => window.setTimeout(go, 0);
  window.addEventListener("popstate", onPop);
  window.setTimeout(go, 450);
}

function OfflineSheet({ open, chosen, onClose }: { open: boolean; chosen: boolean; onClose: () => void }) {
  const spots: Spot[] = [
    { label: "Mess pass", note: "Show it at the counter", icon: ScanLine, tint: "#e0662b", go: showMessPass },
    { label: "Timetable", note: "Today and the week", icon: CalendarDays, tint: "#4b7fc4", go: () => goTab("/timetable") },
    { label: "Attendance", note: "Mark present or absent", icon: ChartNoAxesColumn, tint: "#2f9c8c", go: () => goTab("/attendance") },
    { label: "Tasks", note: "Add, edit, tick off", icon: SquareCheckBig, tint: "#c0862b", go: () => goTab("/tasks") },
    { label: "Today", note: "Your day at a glance", icon: House, tint: "#a5562a", go: () => goTab("/") },
    ...(FRIENDS
      ? [{ label: "Chats", note: "Read saved messages", icon: MessageCircle, tint: "#7a5ad8", go: () => goTab("/circle") }]
      : []),
  ];
  const pick = (s: Spot) => {
    onClose();
    afterClose(s.go);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Offline mode">
      <div className="offline-hero flex items-center gap-3.5 rounded-3xl p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
          <WifiOff size={23} strokeWidth={2.4} />
        </span>
        <p className="text-[13.5px] leading-snug">
          <b className="block text-[15.5px] font-extrabold">{chosen ? "The network kept dropping." : "No internet? No problem."}</b>
          Everything you do is saved on this phone. DockIn goes back online by itself and syncs the moment the network is good.
        </p>
      </div>

      <p className="mt-5 mb-2.5 text-[12px] font-extrabold tracking-[0.08em] text-muted uppercase">Works offline</p>
      <div className="grid grid-cols-2 gap-2.5">
        {spots.map((s, i) => (
          <button
            key={s.label}
            onClick={() => pick(s)}
            className={cx("tile-tint anim-pop flex items-center gap-3 rounded-2xl p-3 text-left active:scale-[0.98]", i === 0 && "col-span-2")}
            style={{ "--tint": s.tint, "--d": `${i * 40}ms` } as CSSProperties}
          >
            <span className="tile-icon grid size-10 shrink-0 place-items-center rounded-xl">
              <s.icon size={19} strokeWidth={2.4} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-extrabold">{s.label}</span>
              <span className="block truncate text-[12px] font-semibold text-muted">{s.note}</span>
            </span>
            {i === 0 && <ChevronRight size={17} className="ml-auto text-muted" />}
          </button>
        ))}
      </div>

      <p className="mt-5 mb-2 text-[12px] font-extrabold tracking-[0.08em] text-muted uppercase">Waits for internet</p>
      <div className="flex flex-wrap gap-1.5">
        {["Sending messages", "Friend requests", "LMS hand-in", "Camu refresh", "Cloud backup"].map((t) => (
          <span key={t} className="rounded-full border border-card-edge px-3 py-1.5 text-[12px] font-semibold text-muted">
            {t}
          </span>
        ))}
      </div>

      <button
        onClick={retryNow}
        className="mt-6 flex w-full items-center justify-center gap-2 text-[12.5px] font-semibold text-muted active:opacity-70"
      >
        <span className="offline-dot offline-dot-muted" aria-hidden /> Looking for a good network — tap to check now
      </button>
    </Sheet>
  );
}

/** "Low network detected multiple times" — offer offline mode, never force it. */
function WeakPrompt() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.9rem+var(--sab))] z-[58] mx-auto max-w-md px-4">
      <div role="alertdialog" aria-label="Low network" className="back-online glass-card pointer-events-auto rounded-3xl p-3.5">
        <div className="flex items-center gap-3">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-warn-soft text-warn">
            <span className="anim-halo absolute inset-0 rounded-2xl bg-warn/20" aria-hidden />
            <WifiLow size={22} strokeWidth={2.6} className="relative" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-tight font-extrabold">Low network detected multiple times</p>
            <p className="text-[12.5px] leading-snug text-muted">Switch to offline mode? It comes back online by itself.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={dismissWeak} className="btn-paper lip-sm h-10 flex-1 rounded-xl text-[13px] font-bold">
            Stay online
          </button>
          <button onClick={acceptWeak} className="btn-leather lip-sm h-10 flex-1 rounded-xl text-[13px] font-bold">
            Switch to offline
          </button>
        </div>
      </div>
    </div>
  );
}

/** On Today, while offline: the pass one tap away, and a word that all is well. */
export function OfflineCard({ className }: { className?: string }) {
  const net = useNet();
  if (!net.offline) return null;
  return (
    <div className={cx("mx-5", className)}>
      <div className="offline-hero flex items-center gap-3 rounded-3xl p-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15">
          <CloudUpload size={21} strokeWidth={2.4} />
        </span>
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug">
          <b className="block text-[14.5px] font-extrabold">You&rsquo;re offline</b>
          Mark attendance and tick tasks as usual — it all syncs later.
        </p>
        <button
          onClick={showMessPass}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl bg-white px-3 text-[13px] font-extrabold text-[#7a3c1c] shadow-[0_6px_14px_-8px_rgb(0_0_0/0.6)] active:scale-95"
        >
          <ScanLine size={16} strokeWidth={2.6} /> Mess pass
        </button>
      </div>
    </div>
  );
}
