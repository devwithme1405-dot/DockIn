"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Flashlight, QrCode as QrIcon, ScanLine, X } from "lucide-react";
import { QrCode } from "./QrCode";
import { cx } from "./ui";

export type Scanned = { kind: "friend" | "group"; code: string };

/** Reads a DockIn QR: a friend link (?add=CODE), a group link (?join=CODE), or a bare code. */
export function parseScan(text: string): Scanned | null {
  const t = text.trim();
  try {
    const u = new URL(t);
    const add = u.searchParams.get("add");
    if (add) return { kind: "friend", code: add.toUpperCase() };
    const join = u.searchParams.get("join");
    if (join) return { kind: "group", code: join.toUpperCase() };
  } catch {
    /* not a link */
  }
  const bare = t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (bare.length === 8) return { kind: "friend", code: bare };
  if (bare.length === 6) return { kind: "group", code: bare };
  return null;
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** One L-shaped corner of the scan frame. */
function Corner({ at, hit }: { at: "tl" | "tr" | "bl" | "br"; hit: boolean }) {
  const pos = {
    tl: "top-0 left-0 border-t-[4px] border-l-[4px] rounded-tl-[22px]",
    tr: "top-0 right-0 border-t-[4px] border-r-[4px] rounded-tr-[22px]",
    bl: "bottom-0 left-0 border-b-[4px] border-l-[4px] rounded-bl-[22px]",
    br: "bottom-0 right-0 border-b-[4px] border-r-[4px] rounded-br-[22px]",
  }[at];
  return (
    <span
      className={cx("absolute size-12 transition-colors duration-200", pos, hit ? "border-safe" : "border-orange")}
      style={{ filter: "drop-shadow(0 0 6px rgba(242,135,31,0.55))" }}
    />
  );
}

/**
 * The friend / group QR scanner. Opens on DockIn's own dark leather instead of
 * a black flash, eases the frame in while the camera starts, fades the picture
 * in once it is live, sweeps a scan line, and ticks green on a hit. "My QR"
 * flips to your own code so two people can scan each other from one screen.
 */
export function QrScanner({
  onResult,
  onClose,
  myLink,
  myCode,
}: {
  onResult: (s: Scanned) => void;
  onClose: () => void;
  myLink?: string;
  myCode?: string | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [live, setLive] = useState(false);
  const [hit, setHit] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showMine, setShowMine] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const done = useRef(false);
  // The latest callback, without restarting the camera when the parent re-renders.
  const report = useRef(onResult);
  useEffect(() => {
    report.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (showMine) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        setProblem("Camera is blocked. Allow camera for DockIn in phone settings — or type the code instead.");
        return;
      }
      if (!alive || !video.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      track.current = stream.getVideoTracks()[0] ?? null;
      const caps = (track.current?.getCapabilities?.() ?? {}) as { torch?: boolean };
      if (caps.torch) setTorch(false);
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});

      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector: Detector | null = Native ? new Native({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;

      const tick = async () => {
        if (!alive || done.current || !video.current) return;
        const v = video.current;
        let text: string | null = null;
        if (v.readyState >= 2) {
          if (detector) {
            const found = await detector.detect(v).catch(() => []);
            text = found[0]?.rawValue ?? null;
          } else if (jsQR && ctx) {
            const w = Math.min(640, v.videoWidth);
            const h = Math.round((v.videoHeight / v.videoWidth) * w) || w;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            text = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
        }
        const found = text ? parseScan(text) : null;
        if (found) {
          done.current = true;
          setHit(true);
          navigator.vibrate?.(35);
          window.setTimeout(() => report.current(found), 420);
          return;
        }
        timer = window.setTimeout(() => void tick(), 160);
      };
      void tick();
    }
    void start();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      track.current = null;
      setLive(false);
    };
  }, [showMine]);

  async function toggleTorch() {
    const t = track.current;
    if (!t || torch === null) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden bg-[#1a110b] text-[#fff3e0] [animation:fade-in_200ms_ease-out]"
      role="dialog"
      aria-label="Scan a QR code"
    >
      {!showMine && (
        <video
          ref={video}
          playsInline
          muted
          onPlaying={() => setLive(true)}
          className={cx("absolute inset-0 h-full w-full object-cover transition-opacity duration-500", live ? "opacity-100" : "opacity-0")}
        />
      )}

      {/* Dim everything except the frame. */}
      <div className="absolute inset-0 grid place-items-center" aria-hidden={!showMine}>
        {showMine ? (
          <div className="flex flex-col items-center [animation:hit-pop_320ms_ease-out]">
            <div className="rounded-[28px] bg-white p-4 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)]">
              {myLink ? <QrCode value={myLink} size={220} /> : <div className="size-[220px]" />}
            </div>
            <p className="mt-4 font-mono text-[24px] font-bold tracking-[0.25em]">{myCode ?? "········"}</p>
            <p className="mt-1 text-[13px] text-[#e6c6a2]">Let your friend scan this</p>
          </div>
        ) : (
          <div className="relative size-64 rounded-[24px] shadow-[0_0_0_100vmax_rgba(20,12,7,0.62)]">
            <div className="scan-motion absolute inset-0 [animation:frame-in_420ms_cubic-bezier(.2,.9,.3,1.2),frame-breathe_2.6s_ease-in-out_600ms_infinite]">
              <Corner at="tl" hit={hit} />
              <Corner at="tr" hit={hit} />
              <Corner at="bl" hit={hit} />
              <Corner at="br" hit={hit} />
            </div>
            {live && !hit && (
              <span
                className="scan-motion absolute inset-x-4 top-2 h-[3px] rounded-full bg-gradient-to-r from-transparent via-orange to-transparent shadow-[0_0_14px_3px_rgba(242,135,31,0.65)] [animation:scan-sweep_1.8s_ease-in-out_infinite]"
                aria-hidden
              />
            )}
            {!live && !problem && (
              <span className="absolute inset-0 grid place-items-center">
                <span className="flex flex-col items-center gap-2 text-[13px] text-[#e6c6a2]">
                  <ScanLine size={30} className="animate-pulse text-orange" />
                  Starting camera…
                </span>
              </span>
            )}
            {hit && (
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-20 place-items-center rounded-full bg-safe text-white shadow-lg [animation:hit-pop_380ms_ease-out]">
                  <Check size={40} strokeWidth={3} />
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Close the scanner" className="grid size-11 place-items-center rounded-full bg-black/40 backdrop-blur">
          <X size={22} />
        </button>
        <p className="flex-1 text-[16.5px] font-extrabold drop-shadow">{showMine ? "My QR" : "Scan a QR"}</p>
        {!showMine && torch !== null && (
          <button
            onClick={() => void toggleTorch()}
            aria-label={torch ? "Torch off" : "Torch on"}
            className={cx("grid size-11 place-items-center rounded-full backdrop-blur", torch ? "bg-orange text-white" : "bg-black/40")}
          >
            <Flashlight size={20} />
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {problem && !showMine ? (
          <p className="rounded-2xl bg-black/60 px-4 py-3 text-center text-[14px]">{problem}</p>
        ) : (
          !showMine && <p className="text-center text-[14px] text-[#f6dcbd] drop-shadow">Point at a friend&apos;s or a group&apos;s DockIn QR</p>
        )}
        <div className="leather stitched flex rounded-full p-1">
          <button
            onClick={() => {
              done.current = false;
              setHit(false);
              setShowMine(false);
            }}
            className={cx("relative z-[1] flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold", !showMine ? "tab-glow" : "text-[#f6dcbd]")}
          >
            <ScanLine size={16} /> Scan
          </button>
          <button
            onClick={() => setShowMine(true)}
            className={cx("relative z-[1] flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold", showMine ? "tab-glow" : "text-[#f6dcbd]")}
          >
            <QrIcon size={16} /> My QR
          </button>
        </div>
      </div>
    </div>
  );
}
