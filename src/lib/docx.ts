/**
 * Putting the reader's name on a shared assignment.
 *
 * A .docx is a zip of XML. The words you see on screen live in <w:t> elements,
 * but Word splits a single word across several of them whenever the formatting
 * changes mid-word — "Sachin" can really be stored as "Sac" + "hin", and a name
 * typed after an autocorrect or a spell-check pass very often is. A plain
 * find-and-replace over the XML therefore misses exactly the cases that matter
 * most, which is why this works a paragraph at a time: join the paragraph's text
 * first, find the name in the joined text, then write the replacement back into
 * the runs it actually spanned. Runs the name never touched are left byte for
 * byte alone, so bold, colour, fonts and spacing all survive.
 *
 * Nothing else in the file is opened or rewritten — no re-layout, no re-save, no
 * conversion. The file the reader gets is the author's file with two strings
 * changed, which is the only way to be sure it still opens.
 */

import JSZip from "jszip";

export interface Swap {
  /** The text as it appears in the author's document. */
  find: string;
  /** What to put in its place. */
  replace: string;
}

/** The parts of a document that can carry a name. */
const TEXT_PARTS =
  /^word\/(document\d*|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/;

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

interface Run {
  /** Index of the "<" that opens the <w:t>. */
  open: number;
  /** Index just after the ">" that ends the opening tag. */
  textStart: number;
  /** Index of the "<" that opens the closing </w:t>. */
  textEnd: number;
  /** Whether the opening tag already asks Word to keep whitespace. */
  preserved: boolean;
}

/** Every <w:t> in a chunk of XML, in document order. Self-closing ones are skipped. */
function runsIn(xml: string): Run[] {
  const out: Run[] = [];
  const open = /<w:t(\s[^>]*?)?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml))) {
    if (m[2] === "/") continue; // <w:t/> holds nothing
    const textStart = m.index + m[0].length;
    const textEnd = xml.indexOf("</w:t>", textStart);
    if (textEnd < 0) continue; // malformed; leave it be
    out.push({
      open: m.index,
      textStart,
      textEnd,
      preserved: /xml:space\s*=\s*"preserve"/.test(m[1] ?? ""),
    });
    open.lastIndex = textEnd;
  }
  return out;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * Replace every occurrence of each swap inside one paragraph's worth of XML.
 * Matching ignores case, because a name set in a heading is often typed in
 * capitals; the replacement always goes in exactly as given.
 */
function rewriteParagraph(xml: string, swaps: Swap[]): string {
  const runs = runsIn(xml);
  if (runs.length === 0) return xml;

  // One entry per visible character: which run it came from, and the exact byte
  // range of the XML that produced it (so "&amp;" counts as one character).
  const owner: number[] = [];
  const from: number[] = [];
  const to: number[] = [];
  let plain = "";

  runs.forEach((run, i) => {
    const raw = xml.slice(run.textStart, run.textEnd);
    const entity = /&(?:#\d+|[a-zA-Z]+);/g;
    let at = 0;
    let e: RegExpExecArray | null;
    const push = (start: number, end: number, text: string) => {
      for (let k = 0; k < text.length; k++) {
        owner.push(i);
        from.push(run.textStart + start);
        to.push(run.textStart + end);
      }
      plain += text;
    };
    while ((e = entity.exec(raw))) {
      for (let k = at; k < e.index; k++) push(k, k + 1, raw[k]);
      push(e.index, e.index + e[0].length, unescapeXml(e[0]));
      at = e.index + e[0].length;
    }
    for (let k = at; k < raw.length; k++) push(k, k + 1, raw[k]);
  });

  const hay = plain.toLowerCase();
  type Hit = { at: number; len: number; replace: string };
  const hits: Hit[] = [];

  for (const swap of swaps) {
    const needle = swap.find.toLowerCase();
    if (!needle) continue;
    let at = hay.indexOf(needle);
    while (at >= 0) {
      hits.push({ at, len: needle.length, replace: swap.replace });
      at = hay.indexOf(needle, at + needle.length);
    }
  }
  if (hits.length === 0) return xml;

  // Longest first, then earliest, and drop anything that overlaps a hit we have
  // already taken — so a roll number inside a longer string is only swapped once.
  hits.sort((a, b) => b.len - a.len || a.at - b.at);
  const taken: Hit[] = [];
  for (const h of hits) {
    if (taken.some((t) => h.at < t.at + t.len && t.at < h.at + h.len)) continue;
    taken.push(h);
  }

  const edits: Edit[] = [];
  const touched = new Set<number>();

  for (const hit of taken) {
    // Group the matched characters by the run they live in.
    const spans: { run: number; start: number; end: number }[] = [];
    for (let i = hit.at; i < hit.at + hit.len; i++) {
      const last = spans[spans.length - 1];
      if (last && last.run === owner[i]) last.end = to[i];
      else spans.push({ run: owner[i], start: from[i], end: to[i] });
    }
    // The first run carries the whole replacement; the rest just lose their share.
    spans.forEach((span, i) => {
      touched.add(span.run);
      edits.push({
        start: span.start,
        end: span.end,
        text: i === 0 ? escapeXml(hit.replace) : "",
      });
    });
  }

  // A replacement can leave a leading or trailing space inside a run, which Word
  // silently eats unless the run says to keep it.
  for (const i of touched) {
    const run = runs[i];
    if (run.preserved) continue;
    const gt = xml.indexOf(">", run.open);
    edits.push({ start: gt, end: gt, text: ' xml:space="preserve"' });
  }

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = xml;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}

/**
 * Replace text across a whole document part, paragraph by paragraph.
 *
 * Pure and synchronous on purpose: the splitting and splicing is the part most
 * likely to get a document subtly wrong, so it is the part that gets tested
 * directly rather than only through a zip.
 */
export function replaceInXml(xml: string, swaps: Swap[]): string {
  const live = swaps.filter((s) => s.find.trim() && s.find !== s.replace);
  if (live.length === 0) return xml;
  // Paragraphs are the unit: a name never runs across one, and keeping the
  // boundary means a heading cannot absorb the line below it.
  return xml
    .split("</w:p>")
    .map((part) => rewriteParagraph(part, live))
    .join("</w:p>");
}

/** The same, over every part of a .docx that shows text to the reader. */
export async function replaceInDocx(
  file: ArrayBuffer | Uint8Array | Blob,
  swaps: Swap[],
): Promise<Blob> {
  const zip = await JSZip.loadAsync(file);
  const parts = Object.keys(zip.files).filter((p) => TEXT_PARTS.test(p));
  if (parts.length === 0) throw new DocxError("This does not look like a Word file.");

  for (const path of parts) {
    const xml = await zip.file(path)!.async("string");
    const next = replaceInXml(xml, swaps);
    // createFolders: false keeps JSZip from inventing a "word/" entry the
    // author's own file never had, so the copy stays byte-comparable.
    if (next !== xml) zip.file(path, next, { createFolders: false });
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
  });
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class DocxError extends Error {}

/** Is this a Word file we can personalise, as far as the name and size can tell? */
export function looksLikeDocx(name: string, type?: string): boolean {
  return /\.docx$/i.test(name) || type === DOCX_MIME;
}

/**
 * The filename matters as much as the contents — a tutor seeing someone else's
 * roll number on the file is the same problem whether it is inside or outside.
 */
export function renameFile(name: string, swaps: Swap[]): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let out = stem;
  for (const swap of swaps) {
    if (!swap.find.trim() || swap.find === swap.replace) continue;
    const re = new RegExp(swap.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, swap.replace);
  }
  return out + ext;
}

/** The text Word shows, joined up — used to find the author's name to offer back. */
export async function readDocxText(file: ArrayBuffer | Uint8Array | Blob): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new DocxError("This does not look like a Word file.");
  const xml = await doc.async("string");
  return xml
    .split("</w:p>")
    .map((para) =>
      runsIn(para)
        .map((r) => unescapeXml(para.slice(r.textStart, r.textEnd)))
        .join(""),
    )
    .filter((line) => line.trim())
    .join("\n");
}
