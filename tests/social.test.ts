import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetAll } from "@/lib/repo";
import { MAX_FILE_BYTES, cleanCode, fileKind, hideShare, setShareDone } from "@/lib/social";
import { DOCX_MIME } from "@/lib/docx";
import { SYNC_KINDS } from "@/lib/sync";

beforeEach(async () => {
  await resetAll();
  await db.shareState.clear();
  await db.shares.clear();
});

describe("codes typed by hand", () => {
  it("forgives spaces, dashes and lower case", () => {
    expect(cleanCode(" abcd-1234 ")).toBe("ABCD1234");
    expect(cleanCode("ab cd 12 34")).toBe("ABCD1234");
    expect(cleanCode("")).toBe("");
  });
});

describe("what you did with a shared item", () => {
  it("is yours alone, and travels with your own data", async () => {
    expect(SYNC_KINDS).toContain("shareState");

    await setShareDone("share-1", true);
    const done = await db.shareState.get("share-1");
    expect(done).toMatchObject({ done: true, hidden: false });
    expect(done!.doneAt).toBeGreaterThan(0);
    expect(done!.updatedAt).toBeGreaterThan(0);

    // hiding it later must not throw away the fact that it is done
    await hideShare("share-1");
    const both = await db.shareState.get("share-1");
    expect(both).toMatchObject({ done: true, hidden: true });

    // and un-ticking it must not un-hide it
    await setShareDone("share-1", false);
    const after = await db.shareState.get("share-1");
    expect(after).toMatchObject({ done: false, hidden: true, doneAt: null });
  });

  it("hides something that was never opened", async () => {
    await hideShare("share-2");
    expect(await db.shareState.get("share-2")).toMatchObject({ done: false, hidden: true });
  });
});

describe("the project address from the environment", () => {
  it("keeps only the origin, whatever was pasted in", async () => {
    const { projectOrigin } = await import("@/lib/supabase");
    const want = "https://abc123.supabase.co";

    expect(projectOrigin(want)).toBe(want);
    expect(projectOrigin(want + "/")).toBe(want);
    // the three the dashboard shows next to it, any of which is easy to copy
    expect(projectOrigin(want + "/rest/v1/")).toBe(want);
    expect(projectOrigin(want + "/auth/v1")).toBe(want);
    expect(projectOrigin(want + "/graphql/v1")).toBe(want);
    expect(projectOrigin("  " + want + "  ")).toBe(want);

    // nothing usable means "no cloud project", not a crash
    expect(projectOrigin(undefined)).toBeUndefined();
    expect(projectOrigin("")).toBeUndefined();
    expect(projectOrigin("not a url")).toBeUndefined();
  });
});

describe("the file on a shared assignment", () => {
  it("accepts a Word file or a PDF and nothing else", () => {
    expect(fileKind("a.docx")).toBe("docx");
    expect(fileKind("A.DOCX")).toBe("docx");
    expect(fileKind("report.pdf")).toBe("pdf");
    // some phones hand over a blank name but a correct type
    expect(fileKind("upload", DOCX_MIME)).toBe("docx");
    expect(fileKind("upload", "application/pdf")).toBe("pdf");
    // the old binary format cannot be rewritten, so it is not offered
    expect(fileKind("old.doc")).toBeNull();
    expect(fileKind("notes.txt")).toBeNull();
    expect(fileKind("sneaky.docx.exe")).toBeNull();
  });

  it("holds the bucket's own size limit, so the app refuses before uploading", () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});
