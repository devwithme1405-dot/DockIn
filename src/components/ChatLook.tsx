"use client";

import { Check } from "lucide-react";
import { PALETTES, THEME_ORDER, WALLPAPERS, chatVars, paletteOf, setChatLook, useChatLook, type Corners, type TextSize } from "@/lib/chatLook";
import { Sheet, cx } from "./ui";

/** Telegram-style chat settings, with a live preview at the top. */
export function ChatLookSheet({ open, onClose, appDark }: { open: boolean; onClose: () => void; appDark: boolean }) {
  const look = useChatLook();
  const paint = chatVars(look, appDark);

  return (
    <Sheet open={open} onClose={onClose} title="Chat theme">
      {/* Preview */}
      <div
        className="chat-root overflow-hidden rounded-3xl p-3 text-text ring-1 ring-black/10"
        data-theme={paint.dark ? "dark" : "light"}
        style={paint.style}
        aria-hidden
      >
        <div className="flex">
          <div className="bubble-in max-w-[78%] rounded-[var(--r)] rounded-bl-[6px] px-3 py-1.5 leading-snug">
            Bhai kal ka DBMS lab hai?
            <span className="ml-2 align-bottom text-[11px] text-muted">9:41 pm</span>
          </div>
        </div>
        <div className="mt-1.5 flex justify-end">
          <div className="bubble-out max-w-[78%] rounded-[var(--r)] rounded-br-[6px] px-3 py-1.5 leading-snug">
            Haan, 10 baje. File bhej raha hoon 👍
            <span className="ml-2 align-bottom text-[11px] text-muted">9:42 pm ✓✓</span>
          </div>
        </div>
      </div>

      <p className="mt-4 mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">Colours</p>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {THEME_ORDER.map((id) => {
          const p = paletteOf(id, appDark);
          const on = look.theme === id;
          return (
            <button key={id} onClick={() => setChatLook({ theme: id })} aria-pressed={on} className="flex w-[66px] shrink-0 flex-col items-center gap-1.5">
              <span
                className={cx("relative grid h-[84px] w-[62px] content-end gap-1 overflow-hidden rounded-2xl p-1.5 ring-2 transition", on ? "ring-[#d9772b]" : "ring-black/10")}
                style={{ background: p.bg }}
              >
                <span className="ml-auto h-3.5 w-9 rounded-md" style={{ background: p.out }} />
                <span className="h-3.5 w-8 rounded-md" style={{ background: p.in }} />
                {on && (
                  <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-[#d9772b] text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className={cx("text-[12px]", on ? "font-extrabold" : "font-semibold text-muted")}>{id === "auto" ? "Auto" : PALETTES[id].name}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">Wallpaper</p>
      <div className="grid grid-cols-4 gap-2">
        {WALLPAPERS.map((w) => {
          const on = look.wallpaper === w.id;
          const v = chatVars({ ...look, wallpaper: w.id }, appDark).style as Record<string, string>;
          return (
            <button key={w.id} onClick={() => setChatLook({ wallpaper: w.id })} aria-pressed={on} className="flex flex-col items-center gap-1.5">
              <span
                className={cx("h-16 w-full rounded-2xl ring-2 transition", on ? "ring-[#d9772b]" : "ring-black/10")}
                style={{ backgroundColor: v["--chat-bg"], backgroundImage: v["--chat-wall"], backgroundSize: v["--chat-wall-size"] }}
              />
              <span className={cx("text-[12px]", on ? "font-extrabold" : "font-semibold text-muted")}>{w.name}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">Text size</p>
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["s", "Small"],
            ["m", "Medium"],
            ["l", "Large"],
          ] as [TextSize, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setChatLook({ size: id })} aria-pressed={look.size === id} className="chip">
            {label}
          </button>
        ))}
      </div>

      <p className="mt-4 mb-2 text-[12.5px] font-extrabold tracking-wide text-muted uppercase">Bubble corners</p>
      <div className="grid grid-cols-3 gap-1.5 pb-1">
        {(
          [
            ["round", "Round"],
            ["soft", "Soft"],
            ["sharp", "Sharp"],
          ] as [Corners, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setChatLook({ corners: id })} aria-pressed={look.corners === id} className="chip">
            {label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
