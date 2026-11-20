"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, RotateCcw } from "lucide-react";
import {
  ACCENTS,
  BUBBLES,
  PALETTES,
  THEME_ORDER,
  WALLPAPERS,
  chatVars,
  hasOwnLook,
  paletteOf,
  resetChatLook,
  setChatLook,
  setChatPhoto,
  useChatLook,
  useChatPhoto,
  type BubbleStyle,
  type ChatLook,
  type Density,
} from "@/lib/chatLook";
import { Sheet, cx, useToast } from "./ui";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">{children}</p>;
}

function Swatch({ color, on, onClick, label }: { color: string; on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={cx("grid size-10 shrink-0 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-[var(--bg)] transition", on ? "ring-[#d9772b]" : "ring-transparent")}
      style={{ background: color }}
    >
      {on && <Check size={16} strokeWidth={3} className="text-white mix-blend-difference" />}
    </button>
  );
}

/**
 * Telegram-style chat settings with a live preview: colours, accent, my bubble
 * colour, wallpaper (patterns, gradient or your own photo), text size, corners,
 * bubble style, spacing, group pictures — for every chat, or just this one.
 */
export function ChatLookSheet({ open, onClose, appDark, thread }: { open: boolean; onClose: () => void; appDark: boolean; thread?: string }) {
  const toast = useToast();
  const [scope, setScope] = useState<"all" | "this">(() => (thread && hasOwnLook(thread) ? "this" : "all"));
  const target = scope === "this" ? (thread ?? null) : null;
  const look = useChatLook(target);
  const picture = useChatPhoto();
  const paint = chatVars(look, appDark, picture);
  const photoInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<ChatLook>) => setChatLook(patch, target);

  return (
    <Sheet open={open} onClose={onClose} title="Customise chat">
      {thread && (
        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-2xl bg-surface-2 p-1">
          {(
            [
              ["all", "All chats"],
              ["this", "Only this chat"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setScope(id);
                if (id === "this" && thread && !hasOwnLook(thread)) setChatLook({}, thread);
              }}
              className={cx("h-9 rounded-xl text-[13.5px] font-bold transition", scope === id ? "bg-surface shadow-sm" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Live preview */}
      <div
        className="chat-root sticky top-0 z-[2] overflow-hidden rounded-3xl p-3 text-text ring-1 ring-black/10"
        data-theme={paint.dark ? "dark" : "light"}
        {...paint.attrs}
        style={paint.style}
        aria-hidden
      >
        <div className="flex">
          <div className="bubble-in max-w-[78%] rounded-[var(--r)] rounded-bl-[6px] px-3 py-1.5 leading-snug">
            Bhai kal ka DBMS lab hai?
            <span className="ml-2 align-bottom text-[11px] text-muted">9:41 pm</span>
          </div>
        </div>
        <div className="mt-[var(--gap-first)] flex justify-end">
          <div className="bubble-out max-w-[78%] rounded-[var(--r)] rounded-br-[6px] px-3 py-1.5 leading-snug">
            Haan, 10 baje. <span className="chat-accent font-bold">@Yash</span> file bhej 👍
            <span className="ml-2 align-bottom text-[11px] text-muted">9:42 pm ✓✓</span>
          </div>
        </div>
      </div>

      <Label>Colours</Label>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {THEME_ORDER.map((id) => {
          const p = paletteOf(id, appDark);
          const on = look.theme === id;
          return (
            <button key={id} onClick={() => set({ theme: id })} aria-pressed={on} className="flex w-[62px] shrink-0 flex-col items-center gap-1.5">
              <span
                className={cx("relative grid h-[80px] w-[58px] content-end gap-1 overflow-hidden rounded-2xl p-1.5 ring-2 transition", on ? "ring-[#d9772b]" : "ring-black/10")}
                style={{ background: p.bg }}
              >
                <span className="ml-auto h-3.5 w-8 rounded-md" style={{ background: p.out }} />
                <span className="h-3.5 w-7 rounded-md" style={{ background: p.in }} />
                {on && (
                  <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-[#d9772b] text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className={cx("text-[11.5px]", on ? "font-extrabold" : "font-semibold text-muted")}>{id === "auto" ? "Auto" : PALETTES[id].name}</span>
            </button>
          );
        })}
      </div>

      <Label>Accent</Label>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        <button
          onClick={() => set({ accent: null })}
          aria-pressed={look.accent === null}
          className={cx("chip shrink-0", look.accent === null && "on")}
        >
          Theme
        </button>
        {ACCENTS.map((c) => (
          <Swatch key={c} color={c} on={look.accent === c} onClick={() => set({ accent: c })} label={`Accent ${c}`} />
        ))}
      </div>

      <Label>My bubbles</Label>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        <button onClick={() => set({ mine: null })} aria-pressed={look.mine === null} className={cx("chip shrink-0", look.mine === null && "on")}>
          Theme
        </button>
        {BUBBLES.map((c) => (
          <Swatch key={c} color={c} on={look.mine === c} onClick={() => set({ mine: c })} label={`Bubble ${c}`} />
        ))}
      </div>

      <Label>Wallpaper</Label>
      <div className="grid grid-cols-3 gap-2">
        {WALLPAPERS.map((w) => {
          const on = look.wallpaper === w.id;
          const v = chatVars({ ...look, wallpaper: w.id }, appDark, picture).style as Record<string, string>;
          return (
            <button
              key={w.id}
              onClick={() => {
                if (w.id === "photo" && !picture) photoInput.current?.click();
                else set({ wallpaper: w.id });
              }}
              aria-pressed={on}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={cx("grid h-16 w-full place-items-center rounded-2xl ring-2 transition", on ? "ring-[#d9772b]" : "ring-black/10")}
                style={{ backgroundColor: v["--chat-bg"], backgroundImage: v["--chat-wall"], backgroundSize: v["--chat-wall-size"], backgroundPosition: "center" }}
              >
                {w.id === "photo" && !picture && <ImagePlus size={20} className="text-muted" />}
              </span>
              <span className={cx("text-[12px]", on ? "font-extrabold" : "font-semibold text-muted")}>{w.name}</span>
            </button>
          );
        })}
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            await setChatPhoto(f);
            set({ wallpaper: "photo" });
          } catch (err) {
            toast.show(err instanceof Error ? err.message : "Could not use that photo.");
          }
        }}
      />
      {look.wallpaper === "photo" ? (
        <div className="mt-3 space-y-2">
          <Slider label="Darken" min={0} max={0.7} step={0.05} value={look.dim} onChange={(v) => set({ dim: v })} show={`${Math.round(look.dim * 100)}%`} />
          <button onClick={() => photoInput.current?.click()} className="chip">
            Change photo
          </button>
        </div>
      ) : (
        look.wallpaper !== "plain" && (
          <div className="mt-3">
            <Slider label="Pattern" min={0.3} max={2} step={0.1} value={look.pattern} onChange={(v) => set({ pattern: v })} show={`${Math.round(look.pattern * 100)}%`} />
          </div>
        )
      )}

      <Label>Text</Label>
      <Slider label="Size" min={13} max={19} step={0.5} value={look.size} onChange={(v) => set({ size: v })} show={`${look.size}px`} />

      <Label>Bubbles</Label>
      <Slider label="Corners" min={4} max={24} step={1} value={look.corners} onChange={(v) => set({ corners: v })} show={`${look.corners}px`} />
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {(
          [
            ["soft", "Shadow"],
            ["flat", "Flat"],
            ["outline", "Outline"],
          ] as [BubbleStyle, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => set({ bubble: id })} aria-pressed={look.bubble === id} className="chip">
            {label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {(
          [
            ["cozy", "Comfortable"],
            ["compact", "Compact"],
          ] as [Density, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => set({ density: id })} aria-pressed={look.density === id} className="chip">
            {label}
          </button>
        ))}
      </div>
      <label className="field mt-2.5 flex items-center gap-3 px-3.5 py-2.5">
        <span className="flex-1 text-[14.5px] font-bold">Pictures next to messages in groups</span>
        <input type="checkbox" checked={look.avatars} onChange={(e) => set({ avatars: e.target.checked })} className="size-5 accent-[#d9772b]" />
      </label>

      <button
        onClick={() => {
          resetChatLook(target);
          if (target) setScope("all");
          toast.show(target ? "This chat follows your main look again" : "Back to the default look");
        }}
        className="mt-5 mb-1 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[14px] font-bold"
      >
        <RotateCcw size={16} /> {target ? "Use my main look here" : "Reset to default"}
      </button>
    </Sheet>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  show,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  show: string;
}) {
  return (
    <label className="field flex items-center gap-3 px-3.5 py-2.5">
      <span className="w-16 shrink-0 text-[13.5px] font-bold">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 accent-[#d9772b]"
        aria-label={label}
      />
      <span className="w-12 shrink-0 text-right text-[12.5px] font-bold text-muted tabular-nums">{show}</span>
    </label>
  );
}
