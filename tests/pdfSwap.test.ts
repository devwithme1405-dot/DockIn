import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readPdfText, replaceInPdf } from "../src/lib/pdfSwap";

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
