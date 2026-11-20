"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCw, X } from "lucide-react";
import { useBackClose } from "@/lib/backClose";

/**
 * Crop a photo to a circle before it is used (profile and group pictures).
 * Drag to move, pinch or use the slider to zoom, rotate in quarter turns.
 *
 *   const cropped = await cropPhoto(file); // null if cancelled
 */

type Request = { file: File; resolve: (f: File | null) => void };
let pending: Request | null = null;
const listeners = new Set<() => void>();

export function cropPhoto(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    pending?.resolve(null);
    pending = { file, resolve };
    listeners.forEach((l) => l());
  });
}

/** Mounted once (AppShell); shows the cropper whenever cropPhoto() asks. */
export function CropHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    const on = () => setReq(pending);
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);
  if (!req) return null;
  const finish = (f: File | null) => {
    req.resolve(f);
    pending = null;
    setReq(null);
  };
  return <PhotoCropper key={req.file.name + req.file.size + req.file.lastModified} file={req.file} onDone={finish} />;
}

const OUT = 512;

function PhotoCropper({ file, onDone }: { file: File; onDone: (f: File | null) => void }) {
  useBackClose(true, () => onDone(null));
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0); // quarter turns
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [side] = useState(() => Math.min(340, (typeof window !== "undefined" ? window.innerWidth : 360) - 40));
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg({ url, w: el.naturalWidth, h: el.naturalHeight });
    el.onerror = () => onDone(null);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, onDone]);

  const turned = rot % 2 === 1;
  const iw = img ? (turned ? img.h : img.w) : 1;
  const ih = img ? (turned ? img.w : img.h) : 1;
  const base = side / Math.min(iw, ih);
  const scale = base * zoom;
  const clamp = (p: { x: number; y: number }, z = zoom) => {
    const s = base * z;
    const mx = Math.max(0, (iw * s - side) / 2);
    const my = Math.max(0, (ih * s - side) / 2);
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };

  function down(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  }
  function move(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const z = Math.max(1, Math.min(5, (gesture.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.current.dist));
      setZoom(z);
      setPos((p) => clamp(p, z));
    } else if (pointers.current.size === 1) {
      setPos((p) => clamp({ x: p.x + now.x - prev.x, y: p.y + now.y - prev.y }));
    }
  }
  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }

  async function use() {
    if (!img) return;
    setBusy(true);
    const el = new Image();
    el.src = img.url;
    await el.decode().catch(() => {});
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return onDone(null);
    const k = OUT / side;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.translate(OUT / 2 + pos.x * k, OUT / 2 + pos.y * k);
    ctx.rotate((rot * Math.PI) / 2);
    ctx.scale(scale * k, scale * k);
    ctx.drawImage(el, -img.w / 2, -img.h / 2);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    onDone(blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : null);
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#0d0b0a] text-white [animation:fade-in_160ms_ease-out]" role="dialog" aria-label="Crop photo">
      <header className="flex items-center gap-2 px-2 pt-[max(0.5rem,var(--sat))] pb-2">
        <button onClick={() => onDone(null)} aria-label="Cancel" className="grid size-11 place-items-center rounded-full active:bg-white/10">
          <X size={22} />
        </button>
        <p className="flex-1 text-[17px] font-bold">Move and zoom</p>
        <button onClick={() => setRot((r) => (r + 1) % 4)} aria-label="Rotate" className="grid size-11 place-items-center rounded-full active:bg-white/10">
          <RotateCw size={20} />
        </button>
      </header>

      <div className="grid flex-1 place-items-center overflow-hidden">
        <div
          className="relative touch-none select-none"
          style={{ width: side, height: side }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
              style={{
                width: img.w,
                height: img.h,
                transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) rotate(${rot * 90}deg) scale(${scale})`,
                willChange: "transform",
              }}
            />
          )}
          {/* the circle you keep; everything outside is dimmed */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(0_0_0/0.62)] ring-2 ring-white/80" />
        </div>
      </div>

      <div className="px-6 pb-[calc(max(0.75rem,var(--sab))+0.5rem)]">
        <div className="flex items-center gap-3">
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.25))} aria-label="Zoom out" className="grid size-9 place-items-center rounded-full bg-white/10">
            <Minus size={17} />
          </button>
          <input
            type="range"
            min={1}
            max={5}
            step={0.01}
            value={zoom}
            onChange={(e) => {
              const z = Number(e.target.value);
              setZoom(z);
              setPos((p) => clamp(p, z));
            }}
            aria-label="Zoom"
            className="h-2 flex-1 accent-[#f0a25a]"
          />
          <button onClick={() => setZoom((z) => Math.min(5, z + 0.25))} aria-label="Zoom in" className="grid size-9 place-items-center rounded-full bg-white/10">
            <Plus size={17} />
          </button>
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={() => onDone(null)} className="h-12 flex-1 rounded-2xl bg-white/10 text-[15px] font-bold">
            Cancel
          </button>
          <button onClick={() => void use()} disabled={!img || busy} className="h-12 flex-[1.4] rounded-2xl bg-[#f0a25a] text-[15px] font-extrabold text-[#2a1608] disabled:opacity-50">
            {busy ? "Saving…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
