/**
 * Profile pictures without uploads: a gradient tile holding either the first
 * letter of the name or a chosen emoji. Stored on the profile as a short string
 * so it costs nothing to sync and renders identically everywhere.
 *
 *   "i:3"      first letter, palette 3
 *   "e:🦊:3"   emoji, palette 3
 *   undefined  first letter, palette picked from the name
 */

export interface Palette {
  from: string;
  to: string;
}

// Warm, earthy tones that sit on DockIn's paper and leather — not neon app colours.
export const PALETTES: Palette[] = [
  { from: "#c9773f", to: "#8a3f17" }, // terracotta
  { from: "#b5838d", to: "#6d4552" }, // dusty plum
  { from: "#d4a373", to: "#9c6b3c" }, // caramel
  { from: "#c46a4b", to: "#7f2f1d" }, // rust
  { from: "#e0a345", to: "#a8661c" }, // mustard
  { from: "#a3a565", to: "#5f6233" }, // olive
  { from: "#7a9e7e", to: "#3f5f45" }, // moss
  { from: "#6f9aa0", to: "#355a60" }, // slate teal
  { from: "#9a7b6c", to: "#5a4136" }, // clay
  { from: "#8c6a54", to: "#4a3122" }, // cocoa
];

export const AVATAR_EMOJIS = [
  "🦊", "🐼", "🐧", "🐱", "🐶", "🐨",
  "🦉", "🐯", "🦁", "🐸", "🐵", "🦄",
  "🚀", "⚡", "🔥", "🌙", "⭐", "🌊",
  "🎧", "🎮", "📚", "☕", "🏏", "🧠",
];

export interface AvatarLook {
  kind: "initial" | "emoji";
  emoji: string | null;
  palette: number;
}

/** Stable palette for someone who has not chosen one, so it still feels personal. */
function paletteFromName(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h % PALETTES.length;
}

export function parseAvatar(avatar: string | undefined, name: string): AvatarLook {
  const fallback: AvatarLook = { kind: "initial", emoji: null, palette: paletteFromName(name) };
  if (!avatar) return fallback;
  const parts = avatar.split(":");
  if (parts[0] === "i") {
    const p = Number(parts[1]);
    return { kind: "initial", emoji: null, palette: Number.isInteger(p) && p >= 0 ? p % PALETTES.length : fallback.palette };
  }
  if (parts[0] === "e" && parts[1]) {
    const p = Number(parts[2]);
    return {
      kind: "emoji",
      emoji: parts[1],
      palette: Number.isInteger(p) && p >= 0 ? p % PALETTES.length : fallback.palette,
    };
  }
  return fallback;
}

export function formatAvatar(look: AvatarLook): string {
  return look.kind === "emoji" && look.emoji
    ? `e:${look.emoji}:${look.palette}`
    : `i:${look.palette}`;
}

export function gradientOf(palette: number): string {
  const p = PALETTES[((palette % PALETTES.length) + PALETTES.length) % PALETTES.length];
  return `linear-gradient(135deg, ${p.from}, ${p.to})`;
}
