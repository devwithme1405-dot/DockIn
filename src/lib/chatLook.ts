"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

/**
 * How chats look on this phone — Telegram-style: a colour theme, a wallpaper,
 * text size and bubble corners. Stored on the device (it is a personal taste,
 * not data), shared by every chat.
 */

export type ChatThemeId =
  | "auto"
  | "day"
  | "sky"
  | "paper"
  | "blush"
  | "ocean"
  | "sunset"
  | "forest"
  | "sand"
  | "slate"
  | "night"
  | "midnight"
  | "amoled";
export type Wallpaper = "doodles" | "dots" | "grid" | "waves" | "stripes" | "circles" | "gradient" | "photo" | "plain";
export type BubbleStyle = "soft" | "flat" | "outline";
export type Density = "cozy" | "compact";

export interface ChatLook {
  theme: ChatThemeId;
  wallpaper: Wallpaper;
  /** Text size in px (13–19). */
  size: number;
  /** Bubble corner radius in px (4–24). */
  corners: number;
  /** Override the theme's accent (links, ticks, buttons); null = theme's. */
  accent: string | null;
  /** Override my bubble colour; null = theme's. */
  mine: string | null;
  /** Pattern strength, 0.3–2 (1 = normal). */
  pattern: number;
  /** How much a photo wallpaper is darkened, 0–0.7. */
  dim: number;
  bubble: BubbleStyle;
  density: Density;
  /** Show people's pictures next to their messages in groups. */
  avatars: boolean;
}

interface Palette {
  name: string;
  dark: boolean;
  bg: string;
  wall: string; // wallpaper ink
  wallAlpha: number;
  head: string;
  out: string;
  outText: string;
  outMeta: string;
  outCard: string;
  tick: string;
  in: string;
  inText: string;
  inMeta: string;
  inCard: string;
  accent: string;
  input: string;
  chip: string;
}

export const PALETTES: Record<Exclude<ChatThemeId, "auto">, Palette> = {
  day: {
    name: "Mint",
    dark: false,
    bg: "#ece5dd",
    wall: "#8a7a66",
    wallAlpha: 0.13,
    head: "#fbfaf7",
    out: "#d8f5c8",
    outText: "#14261a",
    outMeta: "#5a7a62",
    outCard: "rgb(255 255 255 / 0.55)",
    tick: "#2b9bd6",
    in: "#ffffff",
    inText: "#1d1a17",
    inMeta: "#8a8178",
    inCard: "#f6f3ee",
    accent: "#1f8f5f",
    input: "#ffffff",
    chip: "rgb(255 255 255 / 0.92)",
  },
  sky: {
    name: "Sky",
    dark: false,
    bg: "#cfe3ee",
    wall: "#4d7891",
    wallAlpha: 0.14,
    head: "#fbfdff",
    out: "#e3f6d4",
    outText: "#172b14",
    outMeta: "#5b8a55",
    outCard: "rgb(255 255 255 / 0.6)",
    tick: "#3a9bdc",
    in: "#ffffff",
    inText: "#16212b",
    inMeta: "#7d8b97",
    inCard: "#f1f6fa",
    accent: "#2f86d0",
    input: "#ffffff",
    chip: "rgb(255 255 255 / 0.9)",
  },
  paper: {
    name: "Paper",
    dark: false,
    bg: "#f1e7d6",
    wall: "#9a7a55",
    wallAlpha: 0.14,
    head: "#fffaf2",
    out: "#fbe2c2",
    outText: "#3a2213",
    outMeta: "#9a7354",
    outCard: "rgb(255 255 255 / 0.6)",
    tick: "#c26a1f",
    in: "#fffdf9",
    inText: "#2c1d13",
    inMeta: "#9b8670",
    inCard: "#f7efe3",
    accent: "#b8601e",
    input: "#fffefb",
    chip: "rgb(255 250 242 / 0.94)",
  },
  blush: {
    name: "Blush",
    dark: false,
    bg: "#f3e3e6",
    wall: "#a0657a",
    wallAlpha: 0.12,
    head: "#fffbfc",
    out: "#ffdbe3",
    outText: "#3a1520",
    outMeta: "#a2697a",
    outCard: "rgb(255 255 255 / 0.6)",
    tick: "#d24a72",
    in: "#ffffff",
    inText: "#2a1a1f",
    inMeta: "#9a8389",
    inCard: "#faf2f4",
    accent: "#c4466c",
    input: "#ffffff",
    chip: "rgb(255 255 255 / 0.9)",
  },
  night: {
    name: "Night",
    dark: true,
    bg: "#0f1a24",
    wall: "#7fa6c4",
    wallAlpha: 0.07,
    head: "#17212b",
    out: "#2b5278",
    outText: "#f2f7fb",
    outMeta: "#9fc0dc",
    outCard: "rgb(0 0 0 / 0.2)",
    tick: "#7cc4ff",
    in: "#1e2c3a",
    inText: "#e8eef3",
    inMeta: "#8597a8",
    inCard: "rgb(0 0 0 / 0.2)",
    accent: "#5eb5f7",
    input: "#1e2c3a",
    chip: "rgb(30 44 58 / 0.92)",
  },
  ocean: {
    name: "Ocean",
    dark: false,
    bg: "#d7eeec",
    wall: "#3f8a86",
    wallAlpha: 0.13,
    head: "#fbfefe",
    out: "#c9ece6",
    outText: "#0f2a27",
    outMeta: "#4d847d",
    outCard: "rgb(255 255 255 / 0.6)",
    tick: "#16928a",
    in: "#ffffff",
    inText: "#13201f",
    inMeta: "#7a908e",
    inCard: "#eff7f6",
    accent: "#13867f",
    input: "#ffffff",
    chip: "rgb(255 255 255 / 0.9)",
  },
  sunset: {
    name: "Peach",
    dark: false,
    bg: "#fbe6d8",
    wall: "#c0714a",
    wallAlpha: 0.12,
    head: "#fffaf6",
    out: "#ffd9c2",
    outText: "#3b1c0d",
    outMeta: "#a8714f",
    outCard: "rgb(255 255 255 / 0.6)",
    tick: "#e0703a",
    in: "#ffffff",
    inText: "#2b1a12",
    inMeta: "#9b8577",
    inCard: "#fbf1ea",
    accent: "#d0612b",
    input: "#ffffff",
    chip: "rgb(255 255 255 / 0.9)",
  },
  forest: {
    name: "Forest",
    dark: false,
    bg: "#dfe8d6",
    wall: "#5d7a46",
    wallAlpha: 0.13,
    head: "#fbfdf8",
    out: "#cfe6b8",
    outText: "#1b2a10",
    outMeta: "#62804a",
    outCard: "rgb(255 255 255 / 0.6)",
    tick: "#4f8f2c",
    in: "#ffffff",
    inText: "#1a2014",
    inMeta: "#808b76",
    inCard: "#f2f6ee",
    accent: "#3f7f22",
    input: "#ffffff",
    chip: "rgb(255 255 255 / 0.9)",
  },
  sand: {
    name: "Sand",
    dark: false,
    bg: "#efe9df",
    wall: "#8d8170",
    wallAlpha: 0.12,
    head: "#fdfcfa",
    out: "#e6dccb",
    outText: "#2a241b",
    outMeta: "#857a68",
    outCard: "rgb(255 255 255 / 0.6)",
    tick: "#8a6d3b",
    in: "#ffffff",
    inText: "#24211c",
    inMeta: "#8f887e",
    inCard: "#f6f3ee",
    accent: "#7a5f2e",
    input: "#ffffff",
    chip: "rgb(255 255 255 / 0.92)",
  },
  slate: {
    name: "Slate",
    dark: false,
    bg: "#dfe3e8",
    wall: "#5b6878",
    wallAlpha: 0.13,
    head: "#fbfcfd",
    out: "#d2dbe6",
    outText: "#16202b",
    outMeta: "#647487",
    outCard: "rgb(255 255 255 / 0.6)",
    tick: "#3d6fb0",
    in: "#ffffff",
    inText: "#1a1f25",
    inMeta: "#808893",
    inCard: "#f1f3f6",
    accent: "#3a5f8f",
    input: "#ffffff",
    chip: "rgb(255 255 255 / 0.9)",
  },
  midnight: {
    name: "Midnight",
    dark: true,
    bg: "#101425",
    wall: "#8e9bd6",
    wallAlpha: 0.06,
    head: "#171c31",
    out: "#2c3f6e",
    outText: "#f1f4fd",
    outMeta: "#a8b7e0",
    outCard: "rgb(0 0 0 / 0.2)",
    tick: "#8fb3ff",
    in: "#1d2440",
    inText: "#e7eaf6",
    inMeta: "#8a92b3",
    inCard: "rgb(0 0 0 / 0.2)",
    accent: "#7aa2ff",
    input: "#1d2440",
    chip: "rgb(29 36 64 / 0.92)",
  },
  amoled: {
    name: "Black",
    dark: true,
    bg: "#000000",
    wall: "#5a5a5a",
    wallAlpha: 0.12,
    head: "#0b0b0b",
    out: "#1d5c42",
    outText: "#effaf4",
    outMeta: "#8cc6a8",
    outCard: "rgb(0 0 0 / 0.25)",
    tick: "#5fd4a0",
    in: "#1c1c1e",
    inText: "#ececec",
    inMeta: "#8c8c8c",
    inCard: "rgb(255 255 255 / 0.06)",
    accent: "#3fbf88",
    input: "#1c1c1e",
    chip: "rgb(28 28 30 / 0.92)",
  },
};

export const THEME_ORDER: ChatThemeId[] = ["auto", "day", "sky", "ocean", "forest", "paper", "sunset", "blush", "sand", "slate", "night", "midnight", "amoled"];
export const WALLPAPERS: { id: Wallpaper; name: string }[] = [
  { id: "doodles", name: "Doodles" },
  { id: "dots", name: "Dots" },
  { id: "grid", name: "Notebook" },
  { id: "waves", name: "Waves" },
  { id: "stripes", name: "Lines" },
  { id: "circles", name: "Bubbles" },
  { id: "gradient", name: "Gradient" },
  { id: "photo", name: "My photo" },
  { id: "plain", name: "Plain" },
];
export const ACCENTS = ["#1f8f5f", "#2f86d0", "#13867f", "#d0612b", "#c4466c", "#b8601e", "#3a5f8f", "#7a5f2e", "#e0a21b", "#5eb5f7"];
export const BUBBLES = ["#d8f5c8", "#e3f6d4", "#d6ecff", "#c9ece6", "#ffe3b8", "#ffd9c2", "#ffdbe3", "#e6dccb", "#d2dbe6", "#2b5278", "#1d5c42", "#5a3a22"];

export const DEFAULT_LOOK: ChatLook = {
  theme: "auto",
  wallpaper: "doodles",
  size: 15.5,
  corners: 18,
  accent: null,
  mine: null,
  pattern: 1,
  dim: 0.25,
  bubble: "soft",
  density: "cozy",
  avatars: true,
};
const KEY = "dockin-chat-look";
const PHOTO_KEY = "dockin-chat-wall-photo";

type Stored = { all: ChatLook; chats: Record<string, Partial<ChatLook>> };
let current: Stored | null = null;
let photo: string | null | undefined;
const listeners = new Set<() => void>();
const OLD_SIZE: Record<string, number> = { s: 14, m: 15.5, l: 17 };
const OLD_CORNERS: Record<string, number> = { round: 20, soft: 14, sharp: 8 };

function upgrade(raw: Record<string, unknown> | null | undefined): Partial<ChatLook> {
  if (!raw) return {};
  const out = { ...raw } as Record<string, unknown>;
  if (typeof out.size === "string") out.size = OLD_SIZE[out.size] ?? DEFAULT_LOOK.size;
  if (typeof out.corners === "string") out.corners = OLD_CORNERS[out.corners] ?? DEFAULT_LOOK.corners;
  return out as Partial<ChatLook>;
}

function read(): Stored {
  if (current) return current;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as (Record<string, unknown> & { all?: Record<string, unknown>; chats?: Record<string, Record<string, unknown>> }) | null;
    if (raw && raw.all) {
      current = {
        all: { ...DEFAULT_LOOK, ...upgrade(raw.all) },
        chats: Object.fromEntries(Object.entries(raw.chats ?? {}).map(([k, v]) => [k, upgrade(v)])),
      };
    } else current = { all: { ...DEFAULT_LOOK, ...upgrade(raw) }, chats: {} };
  } catch {
    current = { all: DEFAULT_LOOK, chats: {} };
  }
  return current;
}

function write(next: Stored) {
  current = next;
  cache.clear();
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* fine: it just won't be remembered */
  }
  listeners.forEach((l) => l());
}

/** Change the look for every chat, or (with `thread`) only for that chat. */
export function setChatLook(patch: Partial<ChatLook>, thread?: string | null) {
  const s = read();
  if (thread) write({ ...s, chats: { ...s.chats, [thread]: { ...(s.chats[thread] ?? {}), ...patch } } });
  else write({ ...s, all: { ...s.all, ...patch } });
}

/** Back to the default look (everywhere, or just this chat's own settings). */
export function resetChatLook(thread?: string | null) {
  const s = read();
  if (thread) {
    const chats = { ...s.chats };
    delete chats[thread];
    write({ ...s, chats });
  } else write({ all: DEFAULT_LOOK, chats: s.chats });
}

export function hasOwnLook(thread: string): boolean {
  return !!read().chats[thread];
}

const cache = new Map<string, ChatLook>();
function lookFor(thread?: string | null): ChatLook {
  const key = thread ?? "";
  const hit = cache.get(key);
  if (hit) return hit;
  const s = read();
  const v = thread && s.chats[thread] ? { ...s.all, ...s.chats[thread] } : s.all;
  cache.set(key, v);
  return v;
}

/** The look for a chat (its own settings over the shared ones). */
export function useChatLook(thread?: string | null): ChatLook {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lookFor(thread),
    () => DEFAULT_LOOK,
  );
}

/** The wallpaper photo (one, shared by every chat that uses "My photo"). */
export function useChatPhoto(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      if (photo === undefined) {
        try {
          photo = localStorage.getItem(PHOTO_KEY);
        } catch {
          photo = null;
        }
      }
      return photo;
    },
    () => null,
  );
}

/** Stores a phone photo as the wallpaper, shrunk so it never weighs much. */
export async function setChatPhoto(file: File): Promise<void> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const url = c.toDataURL("image/jpeg", 0.72);
  try {
    localStorage.setItem(PHOTO_KEY, url);
  } catch {
    throw new Error("That photo is too big to keep on this phone.");
  }
  photo = url;
  listeners.forEach((l) => l());
}

/** "auto" follows the app: Mint by day, Night in dark mode. */
export function paletteOf(theme: ChatThemeId, appDark: boolean): Palette {
  if (theme === "auto") return appDark ? PALETTES.night : PALETTES.day;
  return PALETTES[theme];
}

// Small study doodles: book, pencil, coffee, star, bulb, paper plane, heart, music note.
const DOODLES = `
<path d="M14 22h22v26H14zM25 22v26M14 22c4-3 7-3 11 0 4-3 7-3 11 0"/>
<path d="M70 14l14 14-24 24-8 2 2-8zM66 18l14 14"/>
<path d="M118 20h20v14a10 10 0 0 1-20 0zM138 24h4a4 4 0 0 1 0 8h-4M122 12c0-3 3-3 3-6M130 12c0-3 3-3 3-6"/>
<path d="M30 92l4 9 10 1-8 6 3 10-9-6-9 6 3-10-8-6 10-1z"/>
<path d="M88 84a12 12 0 1 1 14 12v6h-8v-6a12 12 0 0 1-6-12zM92 108h8"/>
<path d="M126 92l32-12-12 30-6-10zM140 100l18-20"/>
<path d="M30 150c-6-6-12-2-12 4 0 7 12 13 12 13s12-6 12-13c0-6-6-10-12-4z"/>
<path d="M86 162v-22l16-4v20M86 162a4 4 0 1 1-4-4M102 156a4 4 0 1 1-4-4"/>
<circle cx="140" cy="150" r="9"/><path d="M136 150h8M140 146v8"/>
<path d="M60 64h8M64 60v8M112 62l4 4M116 62l-4 4M10 72h6M44 132l6 2M118 128h6"/>`;

function svgUrl(body: string, size: number, color: string, alpha: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}' fill='none' stroke='${color}' stroke-opacity='${alpha}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " "))}")`;
}

const WAVES = `<path d="M0 30c25-14 50 14 75 0s50-14 75 0M0 80c25-14 50 14 75 0s50-14 75 0M0 130c25-14 50 14 75 0s50-14 75 0"/>`;
const CIRCLES = `<circle cx="30" cy="30" r="18"/><circle cx="110" cy="40" r="10"/><circle cx="70" cy="100" r="24"/><circle cx="135" cy="125" r="14"/><circle cx="20" cy="135" r="8"/>`;

function wallpaperOf(look: ChatLook, p: Palette, picture: string | null): { image: string; size: string } {
  const a = p.wallAlpha * look.pattern;
  switch (look.wallpaper) {
    case "plain":
      return { image: "none", size: "auto" };
    case "dots":
      return { image: `radial-gradient(${hexA(p.wall, a * 1.6)} 1.4px, transparent 1.6px)`, size: "18px 18px" };
    case "grid":
      return {
        image: `linear-gradient(${hexA(p.wall, a)} 1px, transparent 1px), linear-gradient(90deg, ${hexA(p.wall, a)} 1px, transparent 1px)`,
        size: "22px 22px",
      };
    case "stripes":
      return { image: `repeating-linear-gradient(135deg, ${hexA(p.wall, a * 0.9)} 0 1.5px, transparent 1.5px 16px)`, size: "auto" };
    case "waves":
      return { image: svgUrl(WAVES, 150, p.wall, a * 2.2), size: "150px 150px" };
    case "circles":
      return { image: svgUrl(CIRCLES, 160, p.wall, a * 2), size: "160px 160px" };
    case "gradient":
      return {
        image: `radial-gradient(120% 80% at 0% 0%, ${hexA(p.accent, 0.22 * look.pattern)}, transparent 60%), radial-gradient(120% 80% at 100% 100%, ${hexA(p.tick, 0.2 * look.pattern)}, transparent 60%)`,
        size: "auto",
      };
    case "photo":
      if (!picture) return { image: "none", size: "auto" };
      return { image: `linear-gradient(rgb(0 0 0 / ${look.dim}), rgb(0 0 0 / ${look.dim})), url("${picture}")`, size: "cover" };
    default:
      return { image: svgUrl(DOODLES, 170, p.wall, a * 1.7), size: "170px 170px" };
  }
}

/** Readable text on a given bubble colour. */
function inkOn(hex: string): { text: string; meta: string; dark: boolean } {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const dark = 0.299 * r + 0.587 * g + 0.114 * b < 140;
  return dark ? { text: "#f4f7fb", meta: "rgb(235 240 248 / 0.72)", dark } : { text: "#17201a", meta: "rgb(30 40 35 / 0.55)", dark };
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${Math.min(1, a).toFixed(3)})`;
}

/** The CSS variables a chat screen is painted with. */
export function chatVars(look: ChatLook, appDark: boolean, picture: string | null = null): { style: CSSProperties; dark: boolean; attrs: Record<string, string> } {
  const p = paletteOf(look.theme, appDark);
  const wall = wallpaperOf(look, p, picture);
  const accent = look.accent ?? p.accent;
  const mine = look.mine ? { bg: look.mine, ...inkOn(look.mine) } : null;
  return {
    dark: p.dark,
    attrs: { "data-bubble": look.bubble, "data-density": look.density },
    style: {
      "--chat-bg": p.bg,
      "--chat-wall": wall.image,
      "--chat-wall-size": wall.size,
      "--chat-head": p.head,
      "--out-bg": mine?.bg ?? p.out,
      "--out-text": mine?.text ?? p.outText,
      "--out-meta": mine?.meta ?? p.outMeta,
      "--out-card": mine ? (mine.dark ? "rgb(0 0 0 / 0.2)" : "rgb(255 255 255 / 0.55)") : p.outCard,
      "--out-tick": mine?.dark ? "#9fd4ff" : look.accent ?? p.tick,
      "--in-bg": p.in,
      "--in-text": p.inText,
      "--in-meta": p.inMeta,
      "--in-card": p.inCard,
      "--chat-accent": accent,
      "--chat-input": p.input,
      "--chat-chip": p.chip,
      "--chat-fs": `${look.size}px`,
      "--r": `${look.corners}px`,
      "--gap": look.density === "compact" ? "1px" : "3px",
      "--gap-first": look.density === "compact" ? "6px" : "10px",
    } as CSSProperties,
  };
}
