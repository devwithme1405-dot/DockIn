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
  kind: "initial" | "emoji" | "photo";
  emoji: string | null;
  palette: number;
  /** For a photo: its public address. */
  url?: string;
}

const PHOTO_BASE = (() => {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  return raw ? `${raw}/storage/v1/object/public/avatars/a/` : "";
})();

/** 'p:<key>' — a profile photo in the public avatars bucket. */
export function photoUrl(key: string): string {
  return PHOTO_BASE ? `${PHOTO_BASE}${key}.jpg` : "";
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
  if (parts[0] === "p" && /^[a-z0-9]{12}$/.test(parts[1] ?? "") && PHOTO_BASE) {
    return { kind: "photo", emoji: null, palette: fallback.palette, url: photoUrl(parts[1]) };
  }
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

/** Profile photos are stored at this size: sharp in the full-screen viewer, still tiny. */
export const PHOTO_SIDE = 512;

/**
 * Centre square of `source`, scaled to `out`×`out` in halving steps with
 * high-quality smoothing — one big jump from a 4000px camera photo is what
 * made photos look smeared.
 */
function squareOf(source: CanvasImageSource, w: number, h: number, out: number): HTMLCanvasElement | null {
  let side = Math.min(w, h);
  let canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  let ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, side, side);
  while (side / 2 >= out) {
    const next = document.createElement("canvas");
    next.width = next.height = Math.floor(side / 2);
    const nctx = next.getContext("2d");
    if (!nctx) return null;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
    side = next.width;
    ctx = nctx;
  }
  if (side === out) return canvas;
  const final = document.createElement("canvas");
  final.width = final.height = out;
  const fctx = final.getContext("2d");
  if (!fctx) return null;
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = "high";
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, out, out);
  fctx.drawImage(canvas, 0, 0, out, out);
  return final;
}

/** WebP where the phone can make it (~35 KB at 512px), JPEG otherwise (~55 KB). */
async function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const as = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  const webp = await as("image/webp", 0.82);
  let out = webp && webp.type === "image/webp" ? webp : await as("image/jpeg", 0.85);
  // The bucket takes up to 200 KB; a very busy photo gets a little more squeeze.
  if (out && out.size > 180_000) out = (await as("image/jpeg", 0.7)) ?? out;
  return out;
}

/**
 * Makes a profile photo on the phone (512×512 centre crop, ~35–55 KB), uploads
 * it under a fresh 12-character key and returns 'p:<key>'. The old photo (if
 * this phone made it) is removed. Nothing big ever touches the database: it
 * stores only the key; the picture sits in Storage.
 */
export async function uploadAvatarPhoto(file: File, previous?: string): Promise<string> {
  const { getSupabase } = await import("./supabase");
  const sb = getSupabase();
  if (!sb) throw new Error("Sign in to add a photo.");
  if (!file.type.startsWith("image/")) throw new Error("Pick a photo.");

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("That photo could not be read.");
  const canvas = squareOf(bitmap, bitmap.width, bitmap.height, PHOTO_SIDE);
  bitmap.close?.();
  if (!canvas) throw new Error("That photo could not be read.");
  const blob = await encode(canvas);
  if (!blob) throw new Error("That photo could not be read.");

  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const key = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  // Always "<key>.jpg": every app version builds the address that way; the
  // stored content type says what it really is, and browsers go by that.
  const { error } = await sb.storage.from("avatars").upload(`a/${key}.jpg`, blob, {
    contentType: blob.type || "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    if (/Bucket not found/i.test(error.message)) throw new Error("Photos are not set up on the server yet.");
    throw new Error("Could not upload the photo.");
  }
  const old = previous?.startsWith("p:") ? previous.slice(2) : null;
  if (old && /^[a-z0-9]{12}$/.test(old)) void sb.storage.from("avatars").remove([`a/${old}.jpg`]);
  return `p:${key}`;
}
