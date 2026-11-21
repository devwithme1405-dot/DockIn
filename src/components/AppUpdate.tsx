"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Loader2, RotateCcw, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { DockIn, isNativeApp, onPhone, type UpdateState } from "@/lib/native";
import { BACK_ONLINE, isOffline } from "@/lib/net";
import { useBackClose } from "@/lib/backClose";
import { cx, useToast } from "./ui";

const CHECKED = "dockin-update-checked";
const LATER = "dockin-update-later";
const BUILD = "dockin-native-build";
const JUST = "dockin-just-updated";

/** Ask GitHub at most this often on its own (a notification tap always asks). */
const CHECK_EVERY = 10 * 60_000;
/** "Later" hides the popup for this long; the phone's daily reminder still comes. */
const LATER_FOR = 6 * 3_600_000;

type Phase = "idle" | "downloading" | "verifying" | "installing" | "confirm" | "permission" | "failed";
const BUSY: Phase[] = ["downloading", "verifying", "installing"];

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

/**
 * Keeps the APK current, from inside the app — no links to send around.
 *
 * - Looks for a new APK when DockIn opens, comes back to the front, gets its
 *   network back, or is opened from an "update ready" notification (the phone
 *   also checks every few hours in the background and posts that notification,
 *   and CI pushes one to everybody the moment a release is out).
 * - Shows a popup: Update now → download (with progress, resumed on a weak
 *   line, checked end to end) → Android installs it. The one-time "allow DockIn
 *   to install apps" step continues by itself when the person comes back.
 * - After an update the cached screens are swapped for the new ones and a
 *   "DockIn updated ✓" note confirms it.
 *
 * Works with every APK out there: the v2 updater (progress states, resume,
 * checks) is used when the phone has it, the original one otherwise.
 */
export function AppUpdate() {
  const toast = useToast();
  const [offer, setOffer] = useState<{ code: number; name: string; ready: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const v2 = useRef(false);
  const [hasV2, setHasV2] = useState(false);
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const install = useCallback(async () => {
    setNote(null);
    setPct(0);
    setPhase("downloading");
    setOpen(true);
    try {
      await DockIn.installUpdate();
      // The old updater just opens Android's screen; the new one reports on.
      if (!v2.current) setPhase("confirm");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (/ALLOW_INSTALL/.test(msg)) {
        setPhase("permission");
      } else if (/BUSY/.test(msg)) {
        /* already going: its own events keep the popup current */
      } else if (/newest/i.test(msg)) {
        setOffer(null);
        setOpen(false);
        setPhase("idle");
      } else {
        setPhase("failed");
        setNote(msg && !/^Error$/.test(msg) ? msg : "The download did not finish. Try again on a better connection.");
      }
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;

    // A new APK keeps showing old screens until the cached site goes: on a new
    // build number, drop the cache (not your data) and reload once.
    void DockIn.status()
      .then(async (s) => {
        const now = String(s.build ?? "");
        let before: string | null = null;
        try {
          before = localStorage.getItem(BUILD);
          localStorage.setItem(BUILD, now);
        } catch {
          return;
        }
        if (before && now && before !== now) {
          write(JUST, s.version || now);
          try {
            await DockIn.setLive({ on: false }).catch(() => {});
            const regs = await navigator.serviceWorker?.getRegistrations();
            await Promise.all((regs ?? []).map((r) => r.unregister()));
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          } catch {
            /* nothing cached */
          }
          window.location.reload();
          return;
        }
        const just = read<string>(JUST);
        if (just) {
          try {
            localStorage.removeItem(JUST);
          } catch {}
          toast.show(`DockIn updated to ${just} ✓`);
        }
      })
      .catch(() => {});

    void DockIn.updateInfo()
      .then(() => {
        v2.current = true;
        setHasV2(true);
      })
      .catch(() => (v2.current = false));

    const check = async (force: boolean) => {
      if (isOffline()) return;
      if (!force) {
        const last = read<number>(CHECKED) ?? 0;
        if (Date.now() - last < CHECK_EVERY) return;
      }
      write(CHECKED, Date.now());
      try {
        const u = await DockIn.checkUpdate();
        if (!alive) return;
        if (u.latest > u.current) {
          setOffer({ code: u.latest, name: u.name, ready: !!u.ready });
          const later = read<{ code: number; at: number }>(LATER);
          const snoozed = !force && later?.code === u.latest && Date.now() - later.at < LATER_FOR;
          if (!snoozed) setOpen(true);
        } else {
          setOffer(null);
          setOpen(false);
        }
      } catch {
        /* offline or GitHub slow: the next trigger asks again */
      }
    };

    const asked = () => /[?&]update=1\b/.test(window.location.search);
    const first = window.setTimeout(() => void check(asked()), 2500);

    const offResume = onPhone("resume", () => {
      // Back from Android's "Install unknown apps" setting: carry on by itself.
      if (phaseRef.current === "permission") {
        if (v2.current) {
          void DockIn.updateInfo()
            .then((i) => {
              if (i.canInstall) void install();
            })
            .catch(() => {});
        } else {
          setPhase("idle");
          setNote("Allowed? Tap Update now to finish.");
        }
        return;
      }
      // The old updater can't tell whether Android's screen was cancelled.
      if (phaseRef.current === "confirm" && !v2.current) {
        setPhase("idle");
        setNote("Didn't finish? Tap Update now again.");
      }
      void check(false);
    });
    const onOpen = (e: Event) => {
      const path = (e as CustomEvent<string>).detail ?? "";
      if (/update=1/.test(path)) void check(true);
    };
    window.addEventListener("dockin-open", onOpen);
    const onBack = () => void check(false);
    window.addEventListener(BACK_ONLINE, onBack);

    const handles: { remove: () => void }[] = [];
    void DockIn.addListener("updateProgress", (p) => setPct(p.percent)).then((h) => handles.push(h));
    void DockIn.addListener("updateState", (p: { state: UpdateState; message?: string }) => {
      if (p.state === "failed") {
        setPhase("failed");
        setNote(p.message ?? "The update didn't install. Try again.");
        setOpen(true);
      } else if (p.state === "confirm") {
        setPhase("confirm");
        setOpen(true);
      } else if (p.state === "done") {
        setPhase("installing");
      } else {
        setPhase(p.state);
      }
    })
      .then((h) => handles.push(h))
      .catch(() => {});

    return () => {
      alive = false;
      window.clearTimeout(first);
      offResume();
      window.removeEventListener("dockin-open", onOpen);
      window.removeEventListener(BACK_ONLINE, onBack);
      handles.forEach((h) => h.remove());
    };
  }, [install, toast]);

  const busy = BUSY.includes(phase);
  const later = useCallback(() => {
    setOpen(false);
    if (offer && !BUSY.includes(phaseRef.current)) write(LATER, { code: offer.code, at: Date.now() });
  }, [offer]);
  useBackClose(open && !!offer, later);

  if (!offer) return null;

  // Hidden while it works: a small chip keeps it findable.
  if (!open) {
    if (!busy && phase !== "confirm") return null;
    return (
      <button
        onClick={() => setOpen(true)}
        className="glass-pill fixed bottom-[calc(6.9rem+var(--sab))] left-1/2 z-[58] flex h-10 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-[13px] font-bold"
      >
        <Loader2 size={15} className="animate-spin text-orange" />
        {phase === "downloading" ? `Updating… ${pct}%` : phase === "confirm" ? "Finish the update" : "Updating…"}
      </button>
    );
  }

  const status =
    phase === "downloading"
      ? `Downloading… ${pct}%`
      : phase === "verifying"
        ? "Checking the download…"
        : phase === "installing"
          ? "Installing…"
          : phase === "confirm"
            ? "Tap “Update” on Android’s screen"
            : null;

  return (
    <div className="no-rise fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="DockIn update">
      <div className="anim-fade absolute inset-0 bg-black/45" onClick={busy ? () => setOpen(false) : later} />
      <div className="anim-sheet paper-page absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-3xl border-t-[1.5px] border-card-edge px-5 pt-3 pb-[max(1.25rem,var(--sab))] shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />

        <div className="offline-hero relative overflow-hidden rounded-3xl p-4">
          <div className="flex items-center gap-3.5">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15">
              {phase === "failed" ? <RotateCcw size={26} /> : <Sparkles size={26} strokeWidth={2.2} />}
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase opacity-80">
                {phase === "failed" ? "Update didn't finish" : "New update ready"}
              </p>
              <p className="font-display text-[24px] leading-tight font-extrabold">DockIn {offer.name}</p>
            </div>
          </div>
        </div>

        {phase === "permission" ? (
          <div className="mt-4 rounded-2xl border border-card-edge bg-surface p-4">
            <p className="flex items-center gap-2 text-[14.5px] font-extrabold">
              <ShieldCheck size={18} className="text-safe" /> One-time step
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              In the screen that opened, turn on <b className="text-text">Allow from this source</b> for DockIn, then come
              back. {hasV2 ? "The update carries on by itself." : "Then tap Update now."}
            </p>
          </div>
        ) : phase === "failed" ? (
          <p className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-[13.5px] leading-snug font-semibold text-warn">{note}</p>
        ) : status ? (
          <div className="mt-5">
            <div className="flex items-center justify-between text-[13.5px] font-bold">
              <span className="flex items-center gap-2">
                {phase === "confirm" ? <Smartphone size={16} className="text-orange" /> : <Loader2 size={16} className="animate-spin text-orange" />}
                {status}
              </span>
            </div>
            <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-line">
              <div
                className={cx("h-full rounded-full bg-orange transition-[width] duration-300", phase !== "downloading" && "w-full")}
                style={phase === "downloading" ? { width: `${Math.max(4, pct)}%` } : undefined}
              />
            </div>
            {phase === "confirm" && (
              <p className="mt-2.5 text-[12.5px] text-muted">Android asks once to make sure it&rsquo;s you. Your data stays.</p>
            )}
          </div>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {[
              offer.ready ? "Already downloaded — installs in seconds" : "Installs right here — no link, no Play Store",
              "Your attendance, tasks and chats stay exactly as they are",
              "Fixes and new features from the team",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-safe-soft text-safe">
                  <Check size={12} strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        )}

        {note && phase === "idle" && <p className="mt-3 text-[12.5px] font-semibold text-muted">{note}</p>}

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={busy || phase === "confirm" ? () => setOpen(false) : later}
            className="btn-paper h-12 flex-1 rounded-2xl text-[15px] font-bold"
          >
            {busy || phase === "confirm" ? "Hide" : "Later"}
          </button>
          {!busy && (
            <button
              onClick={() => void install()}
              className="btn-leather inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-2xl text-[15px] font-bold"
            >
              {phase === "failed" ? (
                <>
                  <RotateCcw size={17} /> Try again
                </>
              ) : phase === "permission" ? (
                <>
                  <ShieldCheck size={17} /> Open setting
                </>
              ) : phase === "confirm" ? (
                <>
                  <Smartphone size={17} /> Show it again
                </>
              ) : (
                <>
                  <Download size={17} /> Update now
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
