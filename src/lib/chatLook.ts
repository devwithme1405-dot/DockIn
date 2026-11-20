"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

/**
 * How chats look on this phone — Telegram-style: a colour theme, a wallpaper,
 * text size and bubble corners. Stored on the device (it is a personal taste,
 * not data), shared by every chat.
 */

export type ChatThemeId = "auto" | "day" | "sky" | "paper" | "blush" | "night" | "amoled";
export type Wallpaper = "doodles" | "dots" | "grid" | "plain";
export type TextSize = "s" | "m" | "l";
export type Corners = "round" | "soft" | "sharp";

export interface ChatLook {
  theme: ChatThemeId;
  wallpaper: Wallpaper;
  size: TextSize;
  corners: Corners;
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

export const THEME_ORDER: ChatThemeId[] = ["auto", "day", "sky", "paper", "blush", "night", "amoled"];
export const WALLPAPERS: { id: Wallpaper; name: string }[] = [
  { id: "doodles", name: "Doodles" },
  { id: "dots", name: "Dots" },
  { id: "grid", name: "Notebook" },
  { id: "plain", name: "Plain" },
];
const SIZE_PX: Record<TextSize, number> = { s: 14, m: 15.5, l: 17 };
const RADIUS_PX: Record<Corners, number> = { round: 20, soft: 14, sharp: 8 };

const DEFAULT: ChatLook = { theme: "auto", wallpaper: "doodles", size: "m", corners: "round" };
const KEY = "dockin-chat-look";

let current: ChatLook | null = null;
const listeners = new Set<() => void>();

function read(): ChatLook {
  if (current) return current;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<ChatLook> | null;
    current = { ...DEFAULT, ...(raw ?? {}) };
  } catch {
    current = DEFAULT;
  }
  return current;
}

export function setChatLook(patch: Partial<ChatLook>) {
  current = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* fine: it just won't be remembered */
  }
  listeners.forEach((l) => l());
}

export function useChatLook(): ChatLook {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => DEFAULT,
  );
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

function wallpaperOf(w: Wallpaper, p: Palette): { image: string; size: string } {
  if (w === "plain") return { image: "none", size: "auto" };
  if (w === "dots")
    return {
      image: `radial-gradient(${hexA(p.wall, p.wallAlpha * 1.6)} 1.4px, transparent 1.6px)`,
      size: "18px 18px",
    };
  if (w === "grid")
    return {
      image: `linear-gradient(${hexA(p.wall, p.wallAlpha)} 1px, transparent 1px), linear-gradient(90deg, ${hexA(p.wall, p.wallAlpha)} 1px, transparent 1px)`,
      size: "22px 22px",
    };
  return { image: svgUrl(DOODLES, 170, p.wall, p.wallAlpha * 1.7), size: "170px 170px" };
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${Math.min(1, a).toFixed(3)})`;
}

/** The CSS variables a chat screen is painted with. */
export function chatVars(look: ChatLook, appDark: boolean): { style: CSSProperties; dark: boolean } {
  const p = paletteOf(look.theme, appDark);
  const wall = wallpaperOf(look.wallpaper, p);
  return {
    dark: p.dark,
    style: {
      "--chat-bg": p.bg,
      "--chat-wall": wall.image,
      "--chat-wall-size": wall.size,
      "--chat-head": p.head,
      "--out-bg": p.out,
      "--out-text": p.outText,
      "--out-meta": p.outMeta,
      "--out-card": p.outCard,
      "--out-tick": p.tick,
      "--in-bg": p.in,
      "--in-text": p.inText,
      "--in-meta": p.inMeta,
      "--in-card": p.inCard,
      "--chat-accent": p.accent,
      "--chat-input": p.input,
      "--chat-chip": p.chip,
      "--chat-fs": `${SIZE_PX[look.size]}px`,
      "--r": `${RADIUS_PX[look.corners]}px`,
    } as CSSProperties,
  };
}
