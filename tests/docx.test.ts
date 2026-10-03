import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readDocxText, renameFile, replaceInDocx, replaceInXml } from "@/lib/docx";

const SWAPS = [
  { find: "Sachin Kumar", replace: "Harshit Jain" },
  { find: "E23CSEU0155", replace: "E23CSEU0191" },
];

const fixture = () =>
  readFile(path.join(import.meta.dirname, "fixtures", "assignment.docx"));

/** The text of one part of the rewritten file, as Word would show it. */
async function partText(file: Blob, part: string) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file(part)!.async("string");
  return xml.replace(/<[^>]+>/g, "");
}

const para = (inner: string) => `<w:p><w:r>${inner}</w:r></w:p>`;

describe("replacing text inside a paragraph", () => {
  it("catches a name Word has split across runs", () => {
    const xml = para(`<w:t>Sac</w:t><w:t>hin</w:t><w:t> Kumar</w:t>`);
    expect(replaceInXml(xml, SWAPS)).toContain("Harshit Jain");
  });

  it("keeps the formatting of runs the name never touched", () => {
    const xml =
      `<w:p>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>Name: </w:t></w:r>` +
      `<w:r><w:rPr><w:i/></w:rPr><w:t>Sachin Kumar</w:t></w:r>` +
      `<w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t> (CSE)</w:t></w:r>` +
      `</w:p>`;
    const out = replaceInXml(xml, SWAPS);
    expect(out).toContain(`<w:b/>`);
    expect(out).toContain(`<w:i/>`);
    expect(out).toContain(`w:val="FF0000"`);
    expect(out.replace(/<[^>]+>/g, "")).toBe("Name: Harshit Jain (CSE)");
  });

  it("never reads a match across two paragraphs", () => {
    const xml = para(`<w:t>Sachin</w:t>`) + para(`<w:t> Kumar</w:t>`);
    expect(replaceInXml(xml, SWAPS)).toBe(xml);
  });

  it("matches however the name was capitalised, and writes it back properly", () => {
    const xml = para(`<w:t>SACHIN KUMAR</w:t>`);
    expect(replaceInXml(xml, SWAPS).replace(/<[^>]+>/g, "")).toBe("Harshit Jain");
  });

  it("leaves escaped characters alone and escapes what it inserts", () => {
    const xml = para(`<w:t>paging &amp; Sachin Kumar &lt;notes&gt;</w:t>`);
    const out = replaceInXml(xml, [{ find: "Sachin Kumar", replace: "A & B <x>" }]);
    expect(out).toContain("paging &amp; A &amp; B &lt;x&gt; &lt;notes&gt;");
  });

  it("finds a name that starts inside an entity's run", () => {
    const xml = para(`<w:t>&amp;Sac</w:t><w:t>hin Kumar&amp;</w:t>`);
    expect(replaceInXml(xml, SWAPS).replace(/<[^>]+>/g, "")).toBe("&amp;Harshit Jain&amp;");
  });

  it("asks Word to keep the spacing it just wrote", () => {
    const xml = para(`<w:t>Sachin Kumar</w:t>`);
    expect(replaceInXml(xml, [{ find: "Sachin Kumar", replace: " H J " }])).toContain(
      'xml:space="preserve"',
    );
  });

  it("swaps every occurrence, not just the first", () => {
    const xml = para(`<w:t>Sachin Kumar and Sachin Kumar</w:t>`);
    expect(replaceInXml(xml, SWAPS).replace(/<[^>]+>/g, "")).toBe(
      "Harshit Jain and Harshit Jain",
    );
  });

  it("does nothing when the name is not there", () => {
    const xml = para(`<w:t>Nothing to see</w:t>`);
    expect(replaceInXml(xml, SWAPS)).toBe(xml);
  });

  it("ignores empty and no-op swaps", () => {
    const xml = para(`<w:t>Sachin Kumar</w:t>`);
    expect(replaceInXml(xml, [{ find: "   ", replace: "X" }])).toBe(xml);
    expect(replaceInXml(xml, [{ find: "Sachin Kumar", replace: "Sachin Kumar" }])).toBe(xml);
  });

  it("skips empty runs without losing them", () => {
    const xml = para(`<w:t/><w:t>Sachin Kumar</w:t>`);
    const out = replaceInXml(xml, SWAPS);
    expect(out).toContain("<w:t/>");
    expect(out).toContain("Harshit Jain");
  });
});

describe("rewriting a real Word file", () => {
  it("replaces the name and roll in the body, the header and the footer", async () => {
    const out = await replaceInDocx(await fixture(), SWAPS);

    const body = await partText(out, "word/document.xml");
    expect(body).toContain("Name: Harshit Jain");
    expect(body).toContain("Roll No: E23CSEU0191");
    expect(body).toContain("I, Harshit Jain, declare");
    expect(body).toContain("Harshit Jain (E23CSEU0191)"); // the cover-page table
    expect(body).not.toContain("Sachin");
    expect(body).not.toContain("0155");

    const zip = await JSZip.loadAsync(await out.arrayBuffer());
    const chrome = Object.keys(zip.files).filter((p) => /^word\/(header|footer)\d*\.xml$/.test(p));
    expect(chrome.length).toBeGreaterThan(0);
    for (const part of chrome) {
      const text = await partText(out, part);
      expect(text).not.toContain("SACHIN");
      expect(text).not.toContain("Sachin");
    }
  });

  it("leaves the question text and the rest of the document untouched", async () => {
    const body = await partText(await replaceInDocx(await fixture(), SWAPS), "word/document.xml");
    expect(body).toContain("Operating Systems");
    expect(body).toContain("Explain paging");
    expect(body).toContain("Student");
  });

  it("still opens as a Word file afterwards", async () => {
    const out = await replaceInDocx(await fixture(), SWAPS);
    const zip = await JSZip.loadAsync(await out.arrayBuffer());
    for (const must of ["[Content_Types].xml", "word/document.xml", "_rels/.rels"]) {
      expect(zip.file(must), must).toBeTruthy();
    }
    // Nothing added, nothing dropped.
    const before = await JSZip.loadAsync(await fixture());
    expect(Object.keys(zip.files).sort()).toEqual(Object.keys(before.files).sort());
  });

  it("refuses something that is not a Word file", async () => {
    const notDocx = await new JSZip().file("hello.txt", "hi").generateAsync({ type: "arraybuffer" });
    await expect(replaceInDocx(notDocx, SWAPS)).rejects.toThrow(/Word file/);
  });

  it("reads the document's text back, so the author can confirm their name", async () => {
    const text = await readDocxText(await fixture());
    expect(text).toContain("Name: Sachin Kumar");
    expect(text).toContain("Roll No: E23CSEU0155");
    expect(text).toContain("paging & segmentation (with <examples>)");
  });
});

describe("renaming the file", () => {
  it("swaps the name and roll in the filename, keeping the extension", () => {
    expect(renameFile("OS Assignment 3 - Sachin Kumar E23CSEU0155.docx", SWAPS)).toBe(
      "OS Assignment 3 - Harshit Jain E23CSEU0191.docx",
    );
  });

  it("matches a filename typed in a different case", () => {
    expect(renameFile("os_sachin kumar.docx", SWAPS)).toBe("os_Harshit Jain.docx");
  });

  it("leaves a filename without the name alone", () => {
    expect(renameFile("assignment.docx", SWAPS)).toBe("assignment.docx");
  });

  it("copes with a name that has regex characters in it", () => {
    expect(renameFile("a (b).docx", [{ find: "(b)", replace: "c" }])).toBe("a c.docx");
  });
});
