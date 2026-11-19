"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

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

/**
 * Full-screen camera that reads a friend's or a group's QR. Uses the phone's
 * built-in barcode reader when the WebView has one, and a small JS decoder
 * otherwise.
 */
export function QrScanner({ onResult, onClose }: { onResult: (s: Scanned) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        setProblem("Camera blocked. Allow camera for DockIn in phone settings, or type the code instead.");
        return;
      }
      if (!alive || !video.current) return;
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
        const hit = text ? parseScan(text) : null;
        if (hit) {
          done.current = true;
          navigator.vibrate?.(40);
          onResult(hit);
          return;
        }
        raf = window.setTimeout(() => void tick(), 180) as unknown as number;
      };
      void tick();
    }
    void start();
    return () => {
      alive = false;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white" role="dialog" aria-label="Scan a QR code">
      <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <div className="size-64 rounded-[28px] border-[3px] border-orange shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]" />
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[16px] font-bold drop-shadow">Scan a friend&apos;s or group QR</p>
        <button onClick={onClose} aria-label="Close the scanner" className="grid size-11 place-items-center rounded-full bg-black/45">
          <X size={22} />
        </button>
      </div>
      {problem && (
        <p className="absolute inset-x-5 bottom-[max(2rem,env(safe-area-inset-bottom))] rounded-2xl bg-black/70 px-4 py-3 text-center text-[14px]">
          {problem}
        </p>
      )}
    </div>
  );
}
