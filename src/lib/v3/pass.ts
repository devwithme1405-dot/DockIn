"use client";

import { DockIn, isNativeApp } from "../native";
import { fmtTime, fromDateStr } from "../dates";
import { needsProof, passSummary, type PassDraft } from "../outpass";
import { whatsappUrl } from "../money";

/**
 * Outpass, the parts that leave DockIn: MyCamu (with the mail screenshot ready
 * for its upload button), the parents (a ready message), and — once — the
 * DockIn team (how MyCamu's form is sent, so a later version can submit it).
 */

/** Camu takes a screenshot, not a 6 MB photo: shrink big images to a sharp JPEG. */
export async function shrinkImage(b: Blob, max = 1800, quality = 0.86): Promise<Blob> {
  if (!b.type.startsWith("image/") || b.type === "image/gif") return b;
  if (b.type === "image/jpeg" && b.size < 900_000) return b;
  try {
    const bmp = await createImageBitmap(b);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return b;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
    return out && out.size < b.size ? out : b;
  } catch {
    return b;
  }
}

function toBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

const extOf = (type: string) => (type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "application/pdf" ? "pdf" : "jpg");

/**
 * MyCamu, signed in, with the pass pinned on top (and copied). For a leave the
 * mail screenshot goes along: when MyCamu's form asks for a file, DockIn offers
 * this exact image first.
 */
export async function sendToCamu(p: PassDraft, proof?: Blob): Promise<"opened" | "copied"> {
  const note = passSummary(p);
  try {
    await navigator.clipboard?.writeText(note);
  } catch {
    /* the pinned bar carries it anyway */
  }
  if (!isNativeApp()) return "copied";
  const opts: { path: string; note: string; proofData?: string; proofName?: string } = { path: "/", note };
  if (proof && needsProof(p)) {
    const small = await shrinkImage(proof);
    opts.proofData = await toBase64(small);
    opts.proofName = `mail-screenshot.${extOf(small.type)}`;
  }
  await DockIn.openCamu(opts);
  return "opened";
}

const day = (s: string) => fromDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** When the pass is for, in one readable line. */
export function passWhen(p: PassDraft): string {
  if (p.kind === "dayout") return `${day(p.fromDate)}, ${fmtTime(p.fromTime)} – ${fmtTime(p.toTime)}`;
  return `${day(p.fromDate)} ${fmtTime(p.fromTime)} → ${day(p.toDate)} ${fmtTime(p.toTime)}`;
}

/** The message for the parents: what was applied for, and what to do. */
export function parentText(p: PassDraft): string {
  const what = p.kind === "dayout" ? "a Day Out Pass" : p.leaveType === "Leave" ? "a leave" : `${p.leaveType.toLowerCase()} leave`;
  return [
    `Hi! I've applied for ${what} on MyCamu.`,
    `🗓 ${passWhen(p)}`,
    `📝 Reason: ${p.reason}`,
    "Please approve it in MyCamu when you can 🙏",
  ].join("\n");
}

/** The phone's share sheet; WhatsApp on the web (or on an APK from before it). */
export async function shareText(text: string, title = "Share"): Promise<void> {
  if (isNativeApp()) {
    try {
      await DockIn.shareText({ text, title });
      return;
    } catch {
      /* older APK: fall through to WhatsApp */
    }
  }
  window.open(whatsappUrl(text), "_blank", "noopener");
}

// ------------------------------------------------------------ teaching DockIn

/** One request MyCamu's page sent while it was open inside DockIn. */
export interface CamuNote {
  at: number;
  page: string;
  method: string;
  url: string;
  body: string;
  status: number;
  answer: string;
}

function list(json: string | undefined): CamuNote[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? (v as CamuNote[]) : [];
  } catch {
    return [];
  }
}

export interface CamuNotes {
  /** What MyCamu *sent* on the pass pages (the submit, the upload) — the part that matters. */
  writes: CamuNote[];
  picked: CamuNote[];
  recent: CamuNote[];
}

/** What DockIn has noted so far; null outside the app (or on an APK without it). */
export async function camuNotes(): Promise<CamuNotes | null> {
  if (!isNativeApp()) return null;
  try {
    const r = await DockIn.camuCaptured();
    return { writes: list(r.writes), picked: list(r.picked), recent: list(r.items) };
  } catch {
    return null;
  }
}

/** The path of a URL, without the host or query — enough to tell requests apart. */
export function notePath(n: CamuNote): string {
  try {
    return new URL(n.url, "https://x").pathname;
  } catch {
    return n.url.slice(0, 60);
  }
}

const READS = /\/(get|list|fetch|search|count|view)[^/]*\/?$|getall|config|dashboard|summary/i;
/** Was this MyCamu sending something (not just reading)? Also for APKs that don't keep `writes`. */
export const isWrite = (n: CamuNote) => !!n.url && !READS.test(n.url);

/**
 * Everything worth sending to the DockIn team, small enough for a WhatsApp
 * message (long texts get cut): the sends first and whole, newest first; the
 * reads only as one line each.
 */
export function notesReport(n: CamuNotes, limit = 3800): string {
  const seen = new Set<string>();
  const all = [...n.writes, ...n.picked, ...n.recent].filter((x) => {
    const k = `${x.at}|${x.url}|${x.method}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  all.sort((a, b) => b.at - a.at);
  const writes = all.filter(isWrite);
  const reads = all.filter((x) => !isWrite(x));
  const counts = new Map<string, number>();
  for (const r of reads) {
    const k = `${r.method} ${notePath(r) || "(no url)"} ${r.status}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const readLines = [...counts].map(([k, c]) => (c > 1 ? `${k} ×${c}` : k));
  const build = (body: number, answer: number) =>
    [
      `DockIn · MyCamu notes · ${new Date().toISOString()}`,
      `SENT (${writes.length}):`,
      JSON.stringify(
        writes.map((w) => ({ at: new Date(w.at).toISOString(), page: w.page, m: w.method, url: w.url, st: w.status, body: w.body.slice(0, body), ans: w.answer.slice(0, answer) })),
      ),
      `READ: ${readLines.join(" | ")}`,
    ].join("\n");
  for (const [b, a] of [
    [2400, 400],
    [1500, 200],
    [900, 120],
    [500, 60],
    [250, 0],
  ] as const) {
    const out = build(b, a);
    if (out.length <= limit) return out;
  }
  return build(250, 0).slice(0, limit);
}

export async function clearCamuNotes(): Promise<void> {
  if (!isNativeApp()) return;
  await DockIn.clearCamuCaptured().catch(() => {});
}

/** Opens MyCamu just to make a pass as usual, so DockIn can learn the form. */
export async function openCamuToTeach(): Promise<void> {
  if (!isNativeApp()) return;
  await DockIn.openCamu({ path: "/", note: "Make a pass as usual and submit it — DockIn is noting how MyCamu sends it." });
}
