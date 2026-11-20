/**
 * Assignment solutions shared in chat, and handing in your own copy.
 *
 * Someone sends their finished file and says which LMS assignment it answers.
 * Everyone else can download it as it is, or let DockIn put their own name and
 * enrollment number in place of the sender's (only those two strings, only in
 * Word files and PDFs that have real text), check the result, and submit it to
 * their own assignment on the LMS with their own saved login.
 *
 * Scanned PDFs are never touched: there is no text in them to change.
 */

import type { Task } from "./types";
import { DockIn, isNativeApp } from "./native";
import { DOCX_MIME, countIn, guessRolls, readDocxText, renameFile, replaceInDocx, type Swap } from "./docx";

/** The LMS allows bigger files, but 5 MB keeps uploads quick on campus Wi-Fi. */
export const SOLUTION_MAX = 5 * 1024 * 1024;

/** What a file message says about the assignment it answers. */
export interface ChatSolution {
  /** The LMS assignment's instance id (from "lms-assign-<id>"), when the sender had it. */
  instance: number | null;
  title: string;
  course?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  /** The sender's own name and enrollment, exactly as written in the file. */
  authorName: string;
  authorRoll: string;
}

export type DocKind = "docx" | "pdf";

export function docKind(name: string, type?: string): DocKind | null {
  if (/\.docx$/i.test(name) || type === DOCX_MIME) return "docx";
  if (/\.pdf$/i.test(name) || type === "application/pdf") return "pdf";
  return null;
}

export class SolutionError extends Error {}

// ---------------------------------------------------------------------------
// Assignments

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "lms-assign-1234" → 1234 */
export function assignInstance(taskId: string): number | null {
  const m = taskId.match(/^lms-assign-(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * LMS assignments worth offering: still open, or due in the last three weeks
 * (a late solution is still useful to someone who has not submitted).
 */
export function pickableAssignments(tasks: Task[], now = Date.now()): Task[] {
  const floor = new Date(now - 21 * 86_400_000).toISOString().slice(0, 10);
  return tasks
    .filter((t) => !t.deletedAt && t.source === "lms" && assignInstance(t.id) !== null)
    .filter((t) => !t.dueDate || t.dueDate >= floor)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

/** The same assignment on MY LMS: by id first, then by its name (and course, when both have one). */
export function findMyAssignment(sol: Pick<ChatSolution, "instance" | "title" | "course">, tasks: Task[]): Task | null {
  const live = tasks.filter((t) => !t.deletedAt && t.source === "lms" && assignInstance(t.id) !== null);
  if (sol.instance !== null) {
    const hit = live.find((t) => assignInstance(t.id) === sol.instance);
    if (hit) return hit;
  }
  const title = norm(sol.title);
  if (!title) return null;
  const same = live.filter((t) => norm(t.title) === title);
  if (same.length <= 1) return same[0] ?? null;
  const course = norm(sol.course ?? "");
  return same.find((t) => course && norm(t.notes) === course) ?? same[0];
}

export function solutionFor(t: Task, author: { name: string; roll: string }): ChatSolution {
  return {
    instance: assignInstance(t.id),
    title: t.title,
    course: t.notes || null,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    authorName: author.name.trim(),
    authorRoll: author.roll.trim(),
  };
}

// ---------------------------------------------------------------------------
// Reading a file

export interface FileText {
  kind: DocKind;
  text: string;
  /** A PDF with (almost) no text: a scan or photos. Nothing in it can change. */
  scanned: boolean;
}

export async function readText(blob: Blob, name: string): Promise<FileText> {
  const kind = docKind(name, blob.type);
  if (!kind) throw new SolutionError("Only Word (.docx) and PDF files can be changed.");
  if (kind === "docx") {
    try {
      return { kind, text: await readDocxText(blob), scanned: false };
    } catch {
      throw new SolutionError("This Word file could not be read. Save it again as .docx and resend.");
    }
  }
  const { readPdfText } = await import("./pdfSwap");
  let text = "";
  try {
    text = await readPdfText(blob);
  } catch {
    throw new SolutionError("This PDF could not be read. It may be locked with a password.");
  }
  return { kind, text, scanned: text.replace(/\s+/g, "").length < 40 };
}

/** The sender's own name and enrollment, as they appear in the file. */
export function detectAuthor(text: string, fileName: string, me: { name?: string; roll?: string }) {
  const name = me.name?.trim() ?? "";
  const roll = me.roll?.trim() ?? "";
  const rolls = guessRolls(`${text}\n${fileName}`);
  return {
    name,
    roll: roll && countIn(text, roll) > 0 ? roll : (rolls[0] ?? roll),
    otherRolls: rolls,
  };
}

/**
 * How often a name is in the text. Lenient on spacing (PDF text often loses or
 * adds spaces between words) and on case — the same way the PDF rewrite finds it.
 */
export function hits(text: string, find: string): number {
  const words = find.trim().split(/\s+/).filter(Boolean);
  if (find.trim().length < 2 || !words.length) return 0;
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "gi");
  return text.match(re)?.length ?? 0;
}

/**
 * Names the file itself gives for its author — after "Name:", "Student name -",
 * "Submitted by" — so a wrong or missing name can be fixed with one tap.
 */
export function suggestNames(text: string, not: string[] = []): string[] {
  const found: string[] = [];
  const pats = [
    /(?:^|[\n\s|])(?:student'?s?\s+)?name\s*(?:of\s+(?:the\s+)?student\s*)?[:\-–—]\s*([A-Za-z][A-Za-z.' ]{1,48})/gi,
    /submitted\s+by\s*[:\-–—]?\s*([A-Za-z][A-Za-z.' ]{1,48})/gi,
  ];
  const stop = /\s+(?:enrol+(?:ment)?|roll|reg(?:istration)?|section|sec|id|sap|branch|course|batch|class|semester|sem|to|date|subject|no)\b.*$/i;
  for (const re of pats) {
    for (const m of text.matchAll(re)) {
      const name = m[1].replace(stop, "").replace(/\s{2,}.*$/, "").replace(/[.' ]+$/, "").trim();
      if (name.length < 3 || name.split(/\s+/).length > 5) continue;
      found.push(name);
    }
  }
  const skip = new Set(not.map((x) => x.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  return found.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k) || skip.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Whose name and enrollment to swap out: what the sender said, unless the file
 * doesn't have it — then what the file itself shows (never my own).
 */
export function theirDetails(text: string, said: { name: string; roll: string }, me: { name: string; roll: string }) {
  const myRoll = me.roll.trim().toLowerCase();
  const named = suggestNames(text, [me.name]);
  const saidName = said.name.trim().toLowerCase();
  // "Yash" said, "Yash Agarwal" written: swap the whole name, not half of it.
  const fuller = saidName ? named.find((n) => n.toLowerCase() !== saidName && n.toLowerCase().includes(saidName)) : undefined;
  const name = fuller ?? (hits(text, said.name) > 0 ? said.name : (named[0] ?? said.name));
  const roll = hits(text, said.roll) > 0 ? said.roll : (guessRolls(text).find((r) => r.toLowerCase() !== myRoll) ?? said.roll);
  return { name: name.trim(), roll: roll.trim() };
}

// ---------------------------------------------------------------------------
// Making my copy

export type OutFormat = "keep" | "pdf";

export interface MyCopy {
  blob: Blob;
  name: string;
  kind: DocKind;
  /** Places changed in the file (0 when nothing was found or nothing was asked). */
  changed: number;
  text: string;
  /** It was made smaller to fit the 5 MB limit. */
  shrunk: boolean;
}

/** Can this phone turn Word into PDF? (The app does it; a browser can't without a print dialog.) */
export const canMakePdf = () => isNativeApp();

/**
 * The copy to hand in: names swapped (Word and text PDFs only), optionally
 * turned into a PDF, and squeezed under 5 MB.
 */
export async function makeCopy(
  blob: Blob,
  fileName: string,
  swaps: Swap[],
  format: OutFormat,
  onStep?: (step: "swap" | "convert" | "shrink") => void,
): Promise<MyCopy> {
  const kind = docKind(fileName, blob.type);
  if (!kind) throw new SolutionError("Only Word (.docx) and PDF files can be submitted from here.");
  const live = swaps.filter((s) => s.find.trim().length > 1 && s.replace.trim() && s.find.trim() !== s.replace.trim());

  let out: Blob = blob;
  let changed = 0;
  onStep?.("swap");
  if (live.length) {
    if (kind === "docx") {
      const before = await readDocxText(blob).catch(() => "");
      changed = live.reduce((n, s) => n + countIn(before, s.find), 0);
      out = await replaceInDocx(blob, live);
    } else {
      const { replaceInPdf } = await import("./pdfSwap");
      const r = await replaceInPdf(blob, live);
      out = r.blob;
      changed = r.count;
    }
  }
  let name = renameFile(fileName, live);
  let outKind: DocKind = kind;

  if (kind === "docx" && format === "pdf") {
    onStep?.("convert");
    out = await docxToPdf(out);
    name = name.replace(/\.docx$/i, "") + ".pdf";
    outKind = "pdf";
  }

  let shrunk = false;
  if (out.size > SOLUTION_MAX) {
    onStep?.("shrink");
    const smaller = outKind === "pdf" ? await (await import("./pdfSwap")).shrinkPdf(out, SOLUTION_MAX) : await shrinkDocx(out, SOLUTION_MAX);
    shrunk = smaller.size < out.size;
    out = smaller;
  }
  if (out.size > SOLUTION_MAX) {
    throw new SolutionError(`Even after compressing it is ${(out.size / 1048576).toFixed(1)} MB — the limit is 5 MB. Ask for a smaller file.`);
  }
  const text = (await readText(out, name).catch(() => null))?.text ?? "";
  return { blob: out, name, kind: outKind, changed, text, shrunk };
}

// ---------------------------------------------------------------------------
// Word → PDF (in the app)

/**
 * Draws the Word file as pages (docx-preview) and has the phone print that to
 * an A4 PDF. Needs the app: a browser would show a print dialog instead.
 */
export async function docxToPdf(docx: Blob): Promise<Blob> {
  if (!isNativeApp()) throw new SolutionError("Turning Word into PDF works in the DockIn app.");
  const html = await docxHtml(docx);
  let data: string;
  try {
    ({ data } = await DockIn.htmlToPdf({ html }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not implemented|is not a function|unimplemented/i.test(msg)) {
      throw new SolutionError("Update DockIn to turn Word files into PDF (or keep it as Word).");
    }
    throw new SolutionError(msg || "Could not make the PDF.");
  }
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

/** The Word file as one printable HTML page per Word page. Exported for tests. */
export async function docxHtml(docx: Blob): Promise<string> {
  const { renderAsync } = await import("docx-preview");
  const host = document.createElement("div");
  const styles = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1000px;pointer-events:none;";
  document.body.append(host, styles);
  try {
    await renderAsync(docx, host, styles, {
      className: "docx",
      inWrapper: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      experimental: true,
    });
    const css = [...styles.querySelectorAll("style"), ...host.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
    host.querySelectorAll("style").forEach((s) => s.remove());
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${css}
section.docx { margin: 0 auto !important; box-shadow: none !important; break-after: page; page-break-after: always; min-height: 0 !important; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
section.docx:last-of-type { break-after: auto; page-break-after: auto; }
</style></head><body>${host.innerHTML}</body></html>`;
  } finally {
    host.remove();
    styles.remove();
  }
}

// ---------------------------------------------------------------------------
// Making Word files smaller

/** Re-encodes big photos inside a .docx (same names, same places) until it fits. */
export async function shrinkDocx(docx: Blob, target: number): Promise<Blob> {
  if (docx.size <= target) return docx;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(docx);
  const media = Object.keys(zip.files).filter((p) => /^word\/media\/.+\.(jpe?g|png)$/i.test(p));
  let out: Blob = docx;
  for (const [quality, maxSide] of [
    [0.7, 1800],
    [0.55, 1400],
    [0.45, 1100],
  ] as const) {
    for (const path of media) {
      const raw = await zip.file(path)!.async("blob");
      if (raw.size < 120_000) continue;
      const jpeg = /\.jpe?g$/i.test(path);
      const next = await reencode(raw, jpeg ? "image/jpeg" : "image/png", quality, maxSide);
      if (next && next.size < raw.size) zip.file(path, next, { createFolders: false });
    }
    out = await zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE", compressionOptions: { level: 9 } });
    if (out.size <= target) break;
  }
  return out;
}

async function reencode(img: Blob, type: string, quality: number, maxSide: number): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(img);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    if (type === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await new Promise<Blob | null>((r) => c.toBlob(r, type, quality));
  } catch {
    return null;
  }
}
