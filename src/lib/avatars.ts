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

export const PALETTES: Palette[] = [
  { from: "#4f8dfb", to: "#1f3fd6" },
  { from: "#8b5cf6", to: "#5b21b6" },
  { from: "#f472b6", to: "#be185d" },
  { from: "#fb7185", to: "#be123c" },
  { from: "#fb923c", to: "#c2410c" },
  { from: "#fbbf24", to: "#b45309" },
  { from: "#34d399", to: "#047857" },
  { from: "#2dd4bf", to: "#0f766e" },
  { from: "#38bdf8", to: "#0369a1" },
  { from: "#a3a3a3", to: "#404040" },
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
