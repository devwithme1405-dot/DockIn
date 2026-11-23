import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readPdfText, replaceInPdf, whereIs } from "../src/lib/pdfSwap";

const SWAPS = [
  { find: "Vaibhav Sharma", replace: "Harshit Singh Chauhan" },
  { find: "S25CSEU0155", replace: "S25CSEU0167" },
];

describe("names in a PDF (Chrome / Word style CID fonts)", () => {
  const src = readFileSync(new URL("./fixtures/solution-chrome.pdf", import.meta.url));

  it("reads the text, so the name and roll can be found and counted", async () => {
    const text = await readPdfText(src);
    expect(text).toMatch(/Vaibhav Sharma/);
    expect(text).toMatch(/S25CSEU0155/);
  });

  it("removes the old name for real and writes the new one", async () => {
    const { blob, count } = await replaceInPdf(src, SWAPS);
    expect(count).toBeGreaterThanOrEqual(5);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
    const text = await readPdfText(bytes);
    expect(text).not.toMatch(/Vaibhav/i);
    expect(text).not.toMatch(/S25CSEU0155/);
    // Teacher's name and the rest stay.
    expect(text).toMatch(/Rakesh Gupta/);
    expect(text).toMatch(/normalization/);
  });
});

describe("names in a PDF with a simple font", () => {
  it("works without a ToUnicode map too", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 200]);
    const f = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Name: Vaibhav Sharma  Roll: S25CSEU0155 end", { x: 20, y: 150, size: 12, font: f, color: rgb(0, 0, 0) });
    const bytes = await doc.save();
    const { blob, count } = await replaceInPdf(bytes, SWAPS);
    expect(count).toBe(2);
    const text = await readPdfText(await blob.arrayBuffer());
    expect(text).not.toMatch(/Vaibhav|0155/);
    expect(text).toMatch(/end/);
  });
});

describe("names in a Word-made PDF (LibreOffice export)", () => {
  it("keeps the rest of each line and capitals in headers", async () => {
    const src = readFileSync(new URL("./fixtures/solution-writer.pdf", import.meta.url));
    const { blob, count } = await replaceInPdf(src, [
      { find: "Sachin Kumar", replace: "Harshit Singh Chauhan" },
      { find: "E23CSEU0155", replace: "E23CSEU0167" },
    ]);
    expect(count).toBeGreaterThanOrEqual(8);
    const text = (await readPdfText(await blob.arrayBuffer())).replace(/\s+/g, " ");
    expect(text).not.toMatch(/Sachin|0155/i);
    expect(text).toMatch(/HARSHIT SINGH CHAUHAN/);
    // The words after each name survive (new names are drawn on top, last).
    expect(text).toMatch(/, declare that this work is my own\./);
    expect(text).toMatch(/Student \( \)/);
    expect(text.match(/Harshit Singh Chauhan/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe("the new name lands exactly where the old one was", () => {
  async function rawPdf(content: string, fontKey = "F1") {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const f = await doc.embedFont(StandardFonts.Helvetica);
    // Draw nothing with pdf-lib: just register the font, then use our own stream.
    const key = page.node.newFontDictionary(fontKey, f.ref).asString();
    page.node.set(
      (await import("pdf-lib")).PDFName.of("Contents"),
      doc.context.register(doc.context.flateStream(content.replaceAll("/F1", key))),
    );
    return doc.save();
  }
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5;

  it("on a page that leaves a transform open (q … cm with no Q)", async () => {
    const src = await rawPdf("q 1 0 0 1 60 40 cm BT /F1 12 Tf 10 100 Td (Name: Sachin Kumar   Subject: DBMS) Tj ET");
    const [before] = await whereIs(src, "Sachin Kumar");
    const { blob, count } = await replaceInPdf(src, [{ find: "Sachin Kumar", replace: "Harshit Jain" }]);
    expect(count).toBe(1);
    const out = new Uint8Array(await blob.arrayBuffer());
    const [after] = await whereIs(out, "Harshit Jain");
    expect(near(before, after)).toBe(true);
    // DBMS stays where it was and stays DBMS.
    const text = await readPdfText(out);
    expect(text).toMatch(/Subject:\s*DBMS/);
    expect(text).not.toMatch(/Sachin/);
  });

  it("mid-line in a standard font with no widths table", async () => {
    const src = await rawPdf("BT /F1 12 Tf 20 200 Td (Course: DBMS  Name: Sachin Kumar  Roll: E24CSEU0001) Tj ET");
    const [before] = await whereIs(src, "Sachin Kumar");
    // Helvetica metrics: "Course: DBMS  Name: " is about 117pt wide, not 20 × 6 = 120 nor anything wild.
    expect(before.x).toBeGreaterThan(20 + 100);
    expect(before.x).toBeLessThan(20 + 135);
    const { blob } = await replaceInPdf(src, [{ find: "Sachin Kumar", replace: "Harshit Jain" }]);
    const [after] = await whereIs(new Uint8Array(await blob.arrayBuffer()), "Harshit Jain");
    expect(near(before, after)).toBe(true);
  });

  it("never writes a name at a guessed place (text after an unreadable font)", async () => {
    // /F9 is not in the page's fonts, so where "Sachin" starts is unknown.
    const src = await rawPdf("BT /F9 12 Tf 20 200 Td (Subject: DBMS ) Tj /F1 12 Tf (Sachin Kumar) Tj ET");
    const { count } = await replaceInPdf(src, [{ find: "Sachin Kumar", replace: "Harshit Jain" }]);
    expect(count).toBe(0);
  });

  it("text state comes back after Q", async () => {
    // Character spacing set inside q…Q must not stretch the line drawn after it.
    const src = await rawPdf("q 5 Tc Q BT /F1 12 Tf 20 200 Td (Name: Sachin Kumar) Tj ET");
    const [before] = await whereIs(src, "Sachin Kumar");
    expect(before.x).toBeLessThan(20 + 40);
  });
});
