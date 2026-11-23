/**
 * Putting the reader's name and enrollment into a text PDF.
 *
 * A PDF has no "text" to edit, only drawing instructions: "use font F1 at 12pt,
 * move here, show these glyph codes". So this reads each page's instructions,
 * decodes the glyphs back into letters (through the font's ToUnicode map),
 * finds the name, and then:
 *
 *   1. REMOVES the old glyphs from the instructions — really removes them, so
 *      the old name is gone from search, copy-paste and any checker that reads
 *      the text, not hidden under a white box. A spacing step of exactly their
 *      width is left in their place, so nothing after them on the line moves.
 *   2. WRITES the new text at the same spot, size and colour, in the closest
 *      standard font (the original font usually only carries the letters the
 *      author used, so it cannot spell a different name).
 *
 * Text inside images (scans) is not touched. Everything else in the file is
 * kept as it was. Runs entirely on the phone.
 */

import type { PDFDocument as PDFDocumentT, PDFFont, PDFPage, PDFDict as PDFDictT, PDFNumber as PDFNumberT } from "pdf-lib";
import type { Swap } from "./docx";

// ---------------------------------------------------------------------------
// Content stream tokens

type Tok =
  | { t: "num"; v: number; s: number; e: number }
  | { t: "name"; v: string; s: number; e: number }
  | { t: "str"; v: number[]; s: number; e: number }
  | { t: "arr"; v: Tok[]; s: number; e: number }
  | { t: "op"; v: string; s: number; e: number }
  | { t: "other"; s: number; e: number };

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

function isWs(ch: string | undefined) {
  return ch !== undefined && WS.has(ch.charCodeAt(0));
}

/** Splits a content stream (as a one-byte-per-char string) into operations. */
function* operations(src: string): Generator<{ op: string; args: Tok[]; s: number; e: number }> {
  let i = 0;
  const n = src.length;
  let args: Tok[] = [];
  let argStart = -1;

  const skipWs = () => {
    while (i < n) {
      const c = src[i];
      if (isWs(c)) i++;
      else if (c === "%") {
        while (i < n && src[i] !== "\n" && src[i] !== "\r") i++;
      } else break;
    }
  };

  const readLiteral = (): Tok => {
    const s = i;
    i++; // (
    let depth = 1;
    const bytes: number[] = [];
    while (i < n && depth > 0) {
      const c = src[i];
      if (c === "\\") {
        const d = src[i + 1];
        i += 2;
        if (d === "n") bytes.push(10);
        else if (d === "r") bytes.push(13);
        else if (d === "t") bytes.push(9);
        else if (d === "b") bytes.push(8);
        else if (d === "f") bytes.push(12);
        else if (d === "\r") {
          if (src[i] === "\n") i++;
        } else if (d === "\n") {
          /* line continuation */
        } else if (d !== undefined && d >= "0" && d <= "7") {
          let oct = d;
          while (oct.length < 3 && src[i] >= "0" && src[i] <= "7") oct += src[i++];
          bytes.push(parseInt(oct, 8) & 255);
        } else if (d !== undefined) bytes.push(d.charCodeAt(0));
        continue;
      }
      if (c === "(") depth++;
      if (c === ")") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      bytes.push(c.charCodeAt(0));
      i++;
    }
    return { t: "str", v: bytes, s, e: i };
  };

  const readHex = (): Tok => {
    const s = i;
    i++; // <
    let hex = "";
    while (i < n && src[i] !== ">") {
      if (!isWs(src[i])) hex += src[i];
      i++;
    }
    i++; // >
    if (hex.length % 2) hex += "0";
    const bytes: number[] = [];
    for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16) || 0);
    return { t: "str", v: bytes, s, e: i };
  };

  const readToken = (): Tok | null => {
    skipWs();
    if (i >= n) return null;
    const c = src[i];
    const s = i;
    if (c === "(") return readLiteral();
    if (c === "<") {
      if (src[i + 1] === "<") {
        // a dictionary (marked-content properties): skip it whole
        let depth = 0;
        while (i < n) {
          if (src[i] === "<" && src[i + 1] === "<") {
            depth++;
            i += 2;
          } else if (src[i] === ">" && src[i + 1] === ">") {
            depth--;
            i += 2;
            if (depth === 0) break;
          } else if (src[i] === "(") readLiteral();
          else i++;
        }
        return { t: "other", s, e: i };
      }
      return readHex();
    }
    if (c === "[") {
      i++;
      const items: Tok[] = [];
      for (;;) {
        skipWs();
        if (i >= n) break;
        if (src[i] === "]") {
          i++;
          break;
        }
        const t = readToken();
        if (!t) break;
        items.push(t);
      }
      return { t: "arr", v: items, s, e: i };
    }
    if (c === "/") {
      i++;
      while (i < n && !isWs(src[i]) && !DELIM.has(src[i])) i++;
      return { t: "name", v: src.slice(s + 1, i), s, e: i };
    }
    if (c === "]" || c === ")" || c === ">" || c === "{" || c === "}") {
      i++;
      return { t: "other", s, e: i };
    }
    while (i < n && !isWs(src[i]) && !DELIM.has(src[i])) i++;
    const word = src.slice(s, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { t: "num", v: parseFloat(word), s, e: i };
    return { t: "op", v: word, s, e: i };
  };

  for (;;) {
    const tok = readToken();
    if (!tok) return;
    if (tok.t === "op") {
      const s = argStart >= 0 ? argStart : tok.s;
      yield { op: tok.v, args, s, e: tok.e };
      args = [];
      argStart = -1;
      if (tok.v === "ID") {
        // inline image data: binary until whitespace + "EI" + whitespace
        const m = /\sEI(?=[\s]|$)/g;
        m.lastIndex = i + 1;
        const hit = m.exec(src);
        i = hit ? hit.index + 3 : n;
      }
    } else {
      if (argStart < 0) argStart = tok.s;
      args.push(tok);
    }
  }
}

// ---------------------------------------------------------------------------
// Fonts

interface FontInfo {
  twoByte: boolean;
  toUni: Map<number, string>;
  width: (code: number) => number; // glyph space, 1/1000 em
  baseName: string;
}

function latin1(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let k = 0; k < bytes.length; k += CH) s += String.fromCharCode(...bytes.subarray(k, k + CH));
  return s;
}

function utf16be(hex: string): string {
  let out = "";
  for (let k = 0; k + 3 < hex.length + 0; k += 4) out += String.fromCharCode(parseInt(hex.slice(k, k + 4), 16));
  if (hex.length === 2) out = String.fromCharCode(parseInt(hex, 16));
  return out;
}

function parseCMap(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(m[1], 16), utf16be(m[2]));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
    for (const m of body.matchAll(re)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[4] !== undefined) {
        const base = m[4];
        const last = parseInt(base.slice(-4) || base, 16);
        const head = base.length > 4 ? base.slice(0, -4) : "";
        for (let c = lo; c <= hi; c++) map.set(c, utf16be(head + (last + c - lo).toString(16).padStart(4, "0")));
      } else if (m[5] !== undefined) {
        const list = [...m[5].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]);
        list.forEach((h, k) => map.set(lo + k, utf16be(h)));
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Page model

type Mat = [number, number, number, number, number, number];
const ID: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Mat, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

interface Glyph {
  ch: string;
  /** Which string token (by index into `strings`), and the code's position in it. */
  str: number;
  code: number;
  /** Text-space advance (already scaled by size, Tc, Tw, Tz). */
  adv: number;
  /** Text matrix × CTM at the glyph's origin. */
  m: Mat;
  size: number;
  hscale: number;
  rise: number;
  font: string;
  color: [number, number, number];
  render: number;
  /**
   * False when text in a font we can't measure came earlier on this line
   * without a fresh position since: this glyph's place is then a guess, and a
   * name is never written at a guessed place.
   */
  sure: boolean;
}

interface StrTok {
  tok: Tok & { t: "str" };
  font: FontInfo;
  /** How the string is shown: inside a TJ array, or by Tj / ' / ". */
  how: "TJ" | "Tj" | "'" | '"';
  op: { s: number; e: number; args: Tok[] };
  size: number;
  hscale: number;
  /** Per-code removal plan. */
  remove: Set<number>;
  /** Extra spacing after a removed run (keyed by its last code), so the rest of the line makes room. */
  extra: Map<number, number>;
  /** Positioned by Td, Tm, T-star or BT right before it (not continuing earlier text). */
  fresh: boolean;
  /** Index of its first glyph in the page's glyph list. */
  firstGlyph: number;
  /** Text-space advance for each code index (for the spacing left behind). */
  adv: number[];
}

interface PageText {
  glyphs: Glyph[];
  strings: StrTok[];
  /** Text with spaces / newlines inferred from positions, and what each char is. */
  text: string;
  owner: number[]; // glyph index, or -1 for an inferred space / newline
  /** q left open at the end (or Q with no q: negative), so new drawing starts from a clean state. */
  openQ: number;
  underQ: number;
}

function readPage(src: string, fonts: Map<string, FontInfo>): PageText {
  const glyphs: Glyph[] = [];
  const strings: StrTok[] = [];
  let ctm: Mat = ID;
  let fill: [number, number, number] = [0, 0, 0];
  // q / Q save and restore the whole graphics state, text state included.
  type Saved = { ctm: Mat; fill: [number, number, number]; fontKey: string; size: number; tc: number; tw: number; th: number; tl: number; rise: number; render: number };
  const stack: Saved[] = [];
  let underQ = 0;
  let drift = false;
  let tm: Mat = ID;
  let tlm: Mat = ID;
  let fontKey = "";
  let size = 0;
  let tc = 0;
  let tw = 0;
  let th = 1;
  let tl = 0;
  let rise = 0;
  let render = 0;
  let fresh = true;

  const nums = (args: Tok[]) => args.filter((a) => a.t === "num").map((a) => (a as { v: number }).v);

  const show = (tok: Tok & { t: "str" }, how: StrTok["how"], op: StrTok["op"]) => {
    const font = fonts.get(fontKey);
    if (!font) {
      // A font we can't read: move along by a rough width, and remember that
      // whatever follows on this line (until the next fresh position) is a guess.
      tm = mul([1, 0, 0, 1, (tok.v.length * 0.5 * size + tc) * th, 0], tm);
      drift = true;
      return;
    }
    const st: StrTok = { tok, font, how, op, size, hscale: th, remove: new Set(), extra: new Map(), adv: [], fresh, firstGlyph: glyphs.length };
    fresh = false;
    const idx = strings.push(st) - 1;
    const b = tok.v;
    const step = font.twoByte ? 2 : 1;
    for (let k = 0, ci = 0; k + step - 1 < b.length; k += step, ci++) {
      const code = font.twoByte ? (b[k] << 8) | b[k + 1] : b[k];
      const w = font.width(code) / 1000;
      const isSpace = !font.twoByte && code === 32;
      const adv = (w * size + tc + (isSpace ? tw : 0)) * th;
      const m = mul(tm, ctm);
      const ch = font.toUni.get(code) ?? (font.twoByte ? "" : String.fromCharCode(code));
      glyphs.push({ ch, str: idx, code: ci, adv, m, size, hscale: th, rise, font: fontKey, color: fill, render, sure: !drift });
      st.adv.push(adv);
      tm = mul([1, 0, 0, 1, adv, 0], tm);
    }
  };

  for (const { op, args, s, e } of operations(src)) {
    const v = nums(args);
    switch (op) {
      case "q":
        stack.push({ ctm, fill, fontKey, size, tc, tw, th, tl, rise, render });
        break;
      case "Q": {
        const top = stack.pop();
        if (top) ({ ctm, fill, fontKey, size, tc, tw, th, tl, rise, render } = top);
        else underQ++;
        break;
      }
      case "cm":
        if (v.length === 6) ctm = mul(v as Mat, ctm);
        break;
      case "g":
        if (v.length === 1) fill = [v[0], v[0], v[0]];
        break;
      case "rg":
        if (v.length === 3) fill = [v[0], v[1], v[2]];
        break;
      case "k":
        if (v.length === 4) fill = [(1 - v[0]) * (1 - v[3]), (1 - v[1]) * (1 - v[3]), (1 - v[2]) * (1 - v[3])];
        break;
      case "sc":
      case "scn":
        if (v.length === 3) fill = [v[0], v[1], v[2]];
        else if (v.length === 1) fill = [v[0], v[0], v[0]];
        break;
      case "BT":
        tm = ID;
        tlm = ID;
        drift = false;
        break;
      case "Tf": {
        const nm = args.find((a) => a.t === "name") as { v: string } | undefined;
        if (nm) fontKey = nm.v;
        if (v.length) size = v[v.length - 1];
        break;
      }
      case "Tc":
        tc = v[0] ?? 0;
        break;
      case "Tw":
        tw = v[0] ?? 0;
        break;
      case "Tz":
        th = (v[0] ?? 100) / 100;
        break;
      case "TL":
        tl = v[0] ?? 0;
        break;
      case "Ts":
        rise = v[0] ?? 0;
        break;
      case "Tr":
        render = v[0] ?? 0;
        break;
      case "Td":
        tlm = mul([1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0], tlm);
        tm = tlm;
        fresh = true;
        drift = false;
        break;
      case "TD":
        tl = -(v[1] ?? 0);
        tlm = mul([1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0], tlm);
        tm = tlm;
        fresh = true;
        drift = false;
        break;
      case "Tm":
        if (v.length === 6) {
          tlm = v as Mat;
          tm = tlm;
          fresh = true;
          drift = false;
        }
        break;
      case "T*":
        tlm = mul([1, 0, 0, 1, 0, -tl], tlm);
        tm = tlm;
        fresh = true;
        drift = false;
        break;
      case "Tj": {
        const str = args.find((a) => a.t === "str") as (Tok & { t: "str" }) | undefined;
        if (str) show(str, "Tj", { s, e, args });
        break;
      }
      case "'":
      case '"': {
        if (op === '"' && v.length >= 2) {
          tw = v[0];
          tc = v[1];
        }
        tlm = mul([1, 0, 0, 1, 0, -tl], tlm);
        tm = tlm;
        fresh = true;
        drift = false;
        const str = args.find((a) => a.t === "str") as (Tok & { t: "str" }) | undefined;
        if (str) show(str, op, { s, e, args });
        break;
      }
      case "TJ": {
        const arr = args.find((a) => a.t === "arr") as { v: Tok[] } | undefined;
        if (!arr) break;
        for (const item of arr.v) {
          if (item.t === "str") show(item, "TJ", { s, e, args });
          else if (item.t === "num") tm = mul([1, 0, 0, 1, (-item.v / 1000) * size * th, 0], tm);
        }
        break;
      }
    }
  }

  // Reading order is drawing order (true for Word / Docs exports); spaces and
  // line breaks are inferred from where each glyph lands.
  let text = "";
  const owner: number[] = [];
  glyphs.forEach((g, i) => {
    const prev = glyphs[i - 1];
    if (prev) {
      const a = apply(prev.m, prev.adv, 0);
      const b = apply(g.m, 0, 0);
      const em = Math.max(1, Math.abs(g.size * Math.hypot(g.m[1], g.m[3])));
      const dy = Math.abs(b.y - a.y);
      const dx = b.x - a.x;
      if (dy > em * 0.5) {
        text += "\n";
        owner.push(-1);
      } else if (dx > em * 0.18 && !/\s$/.test(text)) {
        text += " ";
        owner.push(-1);
      }
    }
    for (const c of g.ch) {
      text += c;
      owner.push(i);
    }
  });
  return { glyphs, strings, text, owner, openQ: stack.length, underQ };
}

// ---------------------------------------------------------------------------
// Loading pages

type Lib = typeof import("pdf-lib");

async function pageSources(lib: Lib, doc: PDFDocumentT, page: PDFPage) {
  const { PDFName, PDFDict, PDFArray, PDFRawStream, PDFNumber, decodePDFRawStream } = lib;
  const ctx = doc.context;
  const contents = page.node.Contents();
  const parts: Uint8Array[] = [];
  const list = contents instanceof PDFArray ? contents.asArray().map((x) => ctx.lookup(x)) : [contents];
  for (const c of list) {
    if (c instanceof PDFRawStream) parts.push(decodePDFRawStream(c).decode());
  }
  const joined = parts.map((p) => latin1(p)).join("\n");

  const resources =
    (page.node.Resources() as PDFDictT | undefined) ??
    (page.node.getInheritableAttribute(PDFName.of("Resources")) as PDFDictT | undefined);
  const fonts = new Map<string, FontInfo>();
  const fontDict = resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
  if (fontDict) {
    for (const [key, ref] of fontDict.entries()) {
      const f = ctx.lookup(ref);
      if (!(f instanceof PDFDict)) continue;
      const sub = f.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() ?? "";
      const base = f.lookupMaybe(PDFName.of("BaseFont"), PDFName)?.asString() ?? "";
      let toUni = new Map<number, string>();
      const tu = f.lookup(PDFName.of("ToUnicode"));
      if (tu instanceof PDFRawStream) {
        try {
          toUni = parseCMap(latin1(decodePDFRawStream(tu).decode()));
        } catch {
          /* no map: letters cannot be read for this font */
        }
      }
      let width: (c: number) => number = () => 500;
      const twoByte = sub === "/Type0";
      if (twoByte) {
        const enc = f.lookupMaybe(PDFName.of("Encoding"), PDFName)?.asString() ?? "";
        if (!/Identity/.test(enc)) continue; // other CMaps: not supported, leave alone
        const desc = f.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray)?.lookup(0);
        const ws = new Map<number, number>();
        let dw = 1000;
        if (desc instanceof PDFDict) {
          const d = desc.lookupMaybe(PDFName.of("DW"), PDFNumber);
          if (d) dw = d.asNumber();
          const w = desc.lookupMaybe(PDFName.of("W"), PDFArray);
          if (w) {
            const items = w.asArray().map((x) => ctx.lookup(x));
            for (let k = 0; k < items.length; ) {
              const first = items[k];
              const next = items[k + 1];
              if (!(first instanceof PDFNumber)) {
                k++;
                continue;
              }
              if (next instanceof PDFArray) {
                next.asArray().forEach((x, j) => {
                  const n = ctx.lookup(x);
                  if (n instanceof PDFNumber) ws.set(first.asNumber() + j, n.asNumber());
                });
                k += 2;
              } else {
                const last = items[k + 1];
                const val = items[k + 2];
                if (last instanceof PDFNumber && val instanceof PDFNumber) {
                  for (let c = first.asNumber(); c <= last.asNumber() && c - first.asNumber() < 65536; c++) ws.set(c, val.asNumber());
                }
                k += 3;
              }
            }
          }
        }
        width = (c) => ws.get(c) ?? dw;
      } else {
        const fc = f.lookupMaybe(PDFName.of("FirstChar"), PDFNumber)?.asNumber() ?? 0;
        const arr = f.lookupMaybe(PDFName.of("Widths"), PDFArray);
        const widths = arr ? arr.asArray().map((x) => (ctx.lookup(x) as PDFNumberT)?.asNumber?.() ?? 0) : [];
        const missing =
          (f.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict)?.lookupMaybe(PDFName.of("MissingWidth"), PDFNumber)?.asNumber() ?? 0) || 500;
        if (widths.length) width = (c) => widths[c - fc] ?? missing;
        else {
          // The 14 standard fonts (and files that lean on them) give no widths:
          // use the standard metrics, not a flat guess that drifts along the line.
          const std = lib.StandardFontEmbedder.for(
            standardFor(lib, base.replace(/^\/?([A-Z]{6}\+)?/, "")) as unknown as Parameters<typeof lib.StandardFontEmbedder.for>[0],
          );
          const cache = new Map<number, number>();
          width = (c) => {
            let w = cache.get(c);
            if (w === undefined) {
              try {
                w = std.widthOfTextAtSize(String.fromCharCode(c), 1000) || missing;
              } catch {
                w = missing;
              }
              cache.set(c, w);
            }
            return w;
          };
        }
      }
      fonts.set(key.asString().slice(1), { twoByte, toUni, width, baseName: base });
    }
  }
  return { src: joined, fonts };
}

async function lib(): Promise<Lib> {
  return import("pdf-lib");
}

async function open(file: Blob | ArrayBuffer | Uint8Array) {
  const L = await lib();
  const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : file instanceof Uint8Array ? file : new Uint8Array(file);
  try {
    return { L, doc: await L.PDFDocument.load(bytes, { updateMetadata: false }) };
  } catch (e) {
    if (/encrypt/i.test(String(e))) throw new PdfSwapError("This PDF is locked, so it can't be edited. Ask for the Word file.");
    throw new PdfSwapError("That PDF could not be opened.");
  }
}

export class PdfSwapError extends Error {}

/** All the text in a PDF (for finding the name and counting it). Empty for scans. */
export async function readPdfText(file: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const { L, doc } = await open(file);
  const out: string[] = [];
  for (const page of doc.getPages()) {
    try {
      const { src, fonts } = await pageSources(L, doc, page);
      out.push(readPage(src, fonts).text);
    } catch {
      /* a page we can't read just adds nothing */
    }
  }
  return out.join("\n\n");
}

function matcher(find: string): RegExp | null {
  const words = find.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "gi");
}

function standardFor(L: Lib, base: string) {
  const b = base.toLowerCase();
  const bold = /bold|black|heavy|semibold/.test(b);
  const italic = /italic|oblique/.test(b);
  const S = L.StandardFonts;
  if (/times|serif|cambria|caladea|georgia|garamond|bookman|bookantiqua|minion|palatino|tinos|charter|baskerville|didot|constantia|century|bodoni|lora|merriweather|playfair|crimson|cormorant|spectral|literata/.test(b) && !/sans/.test(b))
    return bold ? (italic ? S.TimesRomanBoldItalic : S.TimesRomanBold) : italic ? S.TimesRomanItalic : S.TimesRoman;
  if (/courier|mono|consol|code/.test(b)) return bold ? S.CourierBold : S.Courier;
  return bold ? (italic ? S.HelveticaBoldOblique : S.HelveticaBold) : italic ? S.HelveticaOblique : S.Helvetica;
}

const fmt = (n: number) => (Math.abs(n) < 1e-6 ? "0" : String(Math.round(n * 1000) / 1000));
const hex = (bytes: number[]) => `<${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}>`;

/**
 * Replaces each swap's text in a PDF. Returns the new file and how many
 * places were changed (0 means nothing was found as text).
 */
export async function replaceInPdf(file: Blob | ArrayBuffer | Uint8Array, swaps: Swap[]): Promise<{ blob: Blob; count: number }> {
  const live = swaps.filter((s) => s.find.trim() && s.replace.trim() && s.find.trim() !== s.replace.trim());
  const { L, doc } = await open(file);
  let count = 0;
  const embedded = new Map<string, PDFFont>();

  for (const page of doc.getPages()) {
    let parsed: Awaited<ReturnType<typeof pageSources>>;
    try {
      parsed = await pageSources(L, doc, page);
    } catch {
      continue;
    }
    const pt = readPage(parsed.src, parsed.fonts);
    let box: { x: number; y: number; w: number; h: number } | null = null;
    try {
      const mb = page.getMediaBox();
      box = { x: Math.min(mb.x, mb.x + mb.width), y: Math.min(mb.y, mb.y + mb.height), w: Math.abs(mb.width), h: Math.abs(mb.height) };
    } catch {
      box = null;
    }

    type Hit = { at: number; len: number; replace: string };
    const hits: Hit[] = [];
    for (const sw of live) {
      const re = matcher(sw.find);
      if (!re) continue;
      for (const m of pt.text.matchAll(re)) hits.push({ at: m.index!, len: m[0].length, replace: sw.replace.trim() });
    }
    hits.sort((a, b) => b.len - a.len || a.at - b.at);
    const taken: Hit[] = [];
    for (const h of hits) if (!taken.some((t) => h.at < t.at + t.len && t.at < h.at + h.len)) taken.push(h);
    if (!taken.length) continue;

    // Left to right, so text moved by one change is placed right for the next.
    taken.sort((x, y) => x.at - y.at);
    const plans: { glyph: Glyph; text: string; font: PDFFont; size: number; m: Mat }[] = [];
    const opShift = new Map<number, number>(); // op start → TJ units to prepend
    const lineShift: { y: number; dx: number; dy: number; after: number }[] = [];
    const blank = (c: string) => /^\s*$/.test(c) || c === "\u00a0";

    for (const h of taken) {
      const idx = [...new Set(pt.owner.slice(h.at, h.at + h.len).filter((x) => x >= 0))];
      if (!idx.length) continue;
      // A name broken over two lines is left alone rather than half-changed.
      if (pt.text.slice(h.at, h.at + h.len).includes("\n")) continue;
      // Where it sits must be known for sure: a new name is never written at a guessed place.
      if (idx.some((gi) => !pt.glyphs[gi].sure)) continue;
      const at0 = apply(pt.glyphs[idx[0]].m, 0, 0);
      if (box && (at0.x < box.x - 2 || at0.x > box.x + box.w + 2 || at0.y < box.y - 2 || at0.y > box.y + box.h + 2)) continue;
      const first = pt.glyphs[idx[0]];
      const lastIdx = idx[idx.length - 1];
      const last = pt.glyphs[lastIdx];
      for (const gi of idx) pt.strings[pt.glyphs[gi].str].remove.add(pt.glyphs[gi].code);

      const scale = Math.hypot(first.m[0], first.m[1]) || 1;
      const ux = first.m[0] / scale;
      const uy = first.m[1] / scale;
      const start = apply(first.m, 0, 0);
      const em = first.size * scale;
      const onLine = (g: Glyph) => Math.abs(apply(g.m, 0, 0).y - start.y) < em * 0.5;

      // Earlier changes on this line have already moved this text.
      let mx = 0;
      let my = 0;
      for (const ls of lineShift) {
        if (Math.abs(ls.y - start.y) < em * 0.5 && idx[0] > ls.after) {
          mx += ls.dx;
          my += ls.dy;
        }
      }
      const m: Mat = [first.m[0], first.m[1], first.m[2], first.m[3], first.m[4] + mx, first.m[5] + my];

      const std = standardFor(L, parsed.fonts.get(first.font)?.baseName ?? "");
      let font = embedded.get(std);
      if (!font) {
        font = await doc.embedFont(std);
        embedded.set(std, font);
      }
      let size = first.size;
      // "SACHIN KUMAR" in a header stays in capitals.
      const seen = pt.text.slice(h.at, h.at + h.len);
      const text = /[a-z]/i.test(seen) && seen === seen.toUpperCase() && seen !== seen.toLowerCase() ? h.replace.toUpperCase() : h.replace;
      const want = font.widthOfTextAtSize(text, size) * first.hscale;
      // Measured on the page, so kerning between runs (Chrome splits at "AV") counts.
      const endAt = apply(last.m, last.adv, 0);
      const oldW = ((endAt.x - start.x) * ux + (endAt.y - start.y) * uy) / scale;
      const delta = want - oldW;

      // The next visible text on this line, if any.
      let k = lastIdx + 1;
      while (k < pt.glyphs.length && blank(pt.glyphs[k].ch)) k++;
      const nextVis = k < pt.glyphs.length && onLine(pt.glyphs[k]) ? pt.glyphs[k] : null;
      const endOld = apply(last.m, last.adv, 0);
      const gap = nextVis ? Math.hypot(apply(nextVis.m, 0, 0).x - endOld.x, apply(nextVis.m, 0, 0).y - endOld.y) : Infinity;

      if (nextVis && gap > em * 2.5 && delta > 0) {
        // A separate column (a table cell): keep it in place, fit the name.
        const room = (Math.hypot(apply(nextVis.m, 0, 0).x - start.x, apply(nextVis.m, 0, 0).y - start.y) / scale) - first.size * 0.4;
        if (want > room) size = Math.max(first.size * 0.75, size * (room / want));
      } else if (Math.abs(delta) > 0.01) {
        // Normal text: the rest of the line moves by the difference.
        const lastSt = pt.strings[last.str];
        lastSt.extra.set(last.code, (lastSt.extra.get(last.code) ?? 0) + delta);
        const devDelta = delta * scale;
        for (const st of pt.strings) {
          if (!st.fresh || st.op.s <= lastSt.op.s || st.firstGlyph >= pt.glyphs.length) continue;
          const g0 = pt.glyphs[st.firstGlyph];
          if (!onLine(g0)) continue;
          if (pt.strings.findIndex((x) => x.op.s === st.op.s) !== pt.strings.indexOf(st)) continue; // first string of its op only
          const sc = Math.hypot(g0.m[0], g0.m[1]) || 1;
          const units = -((devDelta / sc) / ((st.size * st.hscale) || 1)) * 1000;
          opShift.set(st.op.s, (opShift.get(st.op.s) ?? 0) + units);
        }
        lineShift.push({ y: start.y, dx: devDelta * ux, dy: devDelta * uy, after: lastIdx });
      }
      plans.push({ glyph: first, text, font, size, m });
      count++;
    }
    if (!plans.length) continue;

    // 1) Rewrite the strings that lost glyphs, leaving their width as spacing.
    type Edit = { s: number; e: number; text: string };
    const edits: Edit[] = [];
    const byOp = new Map<number, { op: StrTok["op"]; how: StrTok["how"]; strs: StrTok[] }>();
    for (const st of pt.strings) {
      if (!st.remove.size) continue;
      const k = st.op.s;
      const g = byOp.get(k) ?? { op: st.op, how: st.how, strs: [] };
      g.strs.push(st);
      byOp.set(k, g);
    }
    const rebuilt = (st: StrTok): string => {
      const step = st.font.twoByte ? 2 : 1;
      const out: string[] = [];
      let run: number[] = [];
      let gap = 0;
      const unit = st.size * st.hscale || 1;
      const codes = Math.floor(st.tok.v.length / step);
      for (let ci = 0; ci < codes; ci++) {
        const bytes = st.tok.v.slice(ci * step, ci * step + step);
        if (st.remove.has(ci)) {
          if (run.length) {
            out.push(hex(run));
            run = [];
          }
          gap += (st.adv[ci] ?? 0) + (st.extra.get(ci) ?? 0);
        } else {
          if (gap) {
            out.push(fmt((-gap / unit) * 1000));
            gap = 0;
          }
          run.push(...bytes);
        }
      }
      if (run.length) out.push(hex(run));
      if (gap) out.push(fmt((-gap / unit) * 1000));
      return out.join(" ");
    };
    const pre = (k: number) => (opShift.has(k) ? `${fmt(opShift.get(k)!)} ` : "");
    for (const { op, how, strs } of byOp.values()) {
      if (how === "TJ") {
        // Spaced out: TJ arrays are often written "<..>1<..>" with no gaps.
        for (const st of strs) edits.push({ s: st.tok.s, e: st.tok.e, text: ` ${rebuilt(st)} ` });
        if (opShift.has(op.s)) {
          const arr = op.args.find((a) => a.t === "arr");
          if (arr) edits.push({ s: arr.s + 1, e: arr.s + 1, text: ` ${pre(op.s)}` });
        }
      } else if (how === "Tj") {
        edits.push({ s: op.s, e: op.e, text: `[${pre(op.s)}${rebuilt(strs[0])}] TJ` });
      } else if (how === "'") {
        edits.push({ s: op.s, e: op.e, text: `T* [${pre(op.s)}${rebuilt(strs[0])}] TJ` });
      } else {
        const nums = op.args.filter((a) => a.t === "num") as { v: number }[];
        edits.push({ s: op.s, e: op.e, text: `${fmt(nums[0]?.v ?? 0)} Tw ${fmt(nums[1]?.v ?? 0)} Tc T* [${pre(op.s)}${rebuilt(strs[0])}] TJ` });
      }
      opShift.delete(op.s);
    }
    // Ops that only move along (nothing removed from them).
    for (const st of pt.strings) {
      if (!opShift.has(st.op.s)) continue;
      const k = st.op.s;
      const raw = parsed.src.slice(st.tok.s, st.tok.e);
      if (st.how === "TJ") {
        const arr = st.op.args.find((a) => a.t === "arr");
        if (arr) edits.push({ s: arr.s + 1, e: arr.s + 1, text: ` ${pre(k)}` });
      } else if (st.how === "Tj") edits.push({ s: st.op.s, e: st.op.e, text: `[${pre(k)}${raw}] TJ` });
      else if (st.how === "'") edits.push({ s: st.op.s, e: st.op.e, text: `T* [${pre(k)}${raw}] TJ` });
      else {
        const nums = st.op.args.filter((a) => a.t === "num") as { v: number }[];
        edits.push({ s: st.op.s, e: st.op.e, text: `${fmt(nums[0]?.v ?? 0)} Tw ${fmt(nums[1]?.v ?? 0)} Tc T* [${pre(k)}${raw}] TJ` });
      }
      opShift.delete(k);
    }
    // Back to front; at the same spot the replacement goes before the insert.
    edits.sort((a, b) => b.s - a.s || b.e - a.e);
    let src = parsed.src;
    for (const ed of edits) src = src.slice(0, ed.s) + ed.text + src.slice(ed.e);

    // 2) Draw the new text where the old began.
    let extra = "";
    for (const { glyph: g, text, font, size, m } of plans) {
      const key = page.node.newFontDictionary("DkSwap", font.ref).asString();
      const [r, gg, b] = g.color;
      extra +=
        `\nq ${fmt(r)} ${fmt(gg)} ${fmt(b)} rg BT ${key} ${fmt(size)} Tf ${fmt(g.hscale * 100)} Tz ${fmt(g.rise)} Ts ${g.render === 3 ? 3 : 0} Tr ` +
        `${m.map(fmt).join(" ")} Tm ${font.encodeText(text).toString()} Tj ET Q`;
    }

    // Original drawing wrapped in q/Q so its state can't leak into ours — and
    // balanced first: a page that leaves a "q … cm" open (or closes more than
    // it opened) would otherwise have the new name drawn through its leftover
    // transform, landing somewhere else on the page.
    const head = "q\n".repeat(pt.underQ + 1);
    const tail = "\nQ".repeat(pt.openQ) + "\nQ".repeat(pt.underQ + 1);
    const bytes = new Uint8Array([...(head + src + tail + extra + "\n")].map((c) => c.charCodeAt(0) & 255));
    const stream = doc.context.flateStream(bytes);
    page.node.set(L.PDFName.of("Contents"), doc.context.register(stream));
  }

  const out = await doc.save();
  return { blob: new Blob([out as BlobPart], { type: "application/pdf" }), count };
}

/**
 * Makes a PDF smaller by re-saving its big photos (JPEGs) at a sensible size
 * and quality. Text and drawings are untouched.
 */
export async function shrinkPdf(file: Blob, target: number): Promise<Blob> {
  if (file.size <= target) return file;
  const { L, doc } = await open(file);
  const { PDFName, PDFRawStream, PDFNumber } = L;
  for (const [quality, maxSide] of [
    [0.62, 1700],
    [0.5, 1300],
    [0.4, 1000],
  ] as const) {
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict;
      if (d.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() !== "/Image") continue;
      const filter = d.lookup(PDFName.of("Filter"));
      if (!(filter instanceof PDFName) || filter.asString() !== "/DCTDecode") continue;
      if (obj.contents.length < 60_000) continue;
      try {
        const bmp = await createImageBitmap(new Blob([obj.contents as BlobPart], { type: "image/jpeg" }));
        const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close?.();
        const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
        if (!jpg || jpg.size >= obj.contents.length) continue;
        const next = doc.context.stream(new Uint8Array(await jpg.arrayBuffer()), {
          Type: "XObject",
          Subtype: "Image",
          Width: c.width,
          Height: c.height,
          ColorSpace: "DeviceRGB",
          BitsPerComponent: 8,
          Filter: "DCTDecode",
        });
        const smask = d.get(PDFName.of("SMask"));
        if (smask) next.dict.set(PDFName.of("SMask"), smask);
        doc.context.assign(ref, next);
        void PDFNumber;
      } catch {
        /* an image we can't redo stays as it was */
      }
    }
    const out = new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" });
    if (out.size <= target) return out;
  }
  return new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" });
}

/** Where a piece of text starts on each page (bottom-left origin, points). For checks and tests. */
export async function whereIs(file: Blob | ArrayBuffer | Uint8Array, find: string): Promise<{ page: number; x: number; y: number }[]> {
  const { L, doc } = await open(file);
  const out: { page: number; x: number; y: number }[] = [];
  const re = matcher(find);
  if (!re) return out;
  const pages = doc.getPages();
  for (let p = 0; p < pages.length; p++) {
    try {
      const { src, fonts } = await pageSources(L, doc, pages[p]);
      const pt = readPage(src, fonts);
      for (const m of pt.text.matchAll(re)) {
        const gi = pt.owner.slice(m.index!, m.index! + m[0].length).find((x) => x >= 0);
        if (gi === undefined) continue;
        const at = apply(pt.glyphs[gi].m, 0, 0);
        out.push({ page: p, x: at.x, y: at.y });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}
