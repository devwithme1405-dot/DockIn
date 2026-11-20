import { DockIn, isNativeApp } from "./native";
import { mimeOf, toBase64 } from "./files";

export class WebOnlyLms extends Error {
  constructor() {
    super("This LMS login can only be used on the website.");
  }
}

/** "lms-assign-1234" → { module: "assign", instance: 1234 } */
export function lmsRef(taskId: string): { module: string; instance: number } | null {
  const m = taskId.match(/^lms-([a-z]+)-(\d+)$/);
  return m ? { module: m[1], instance: Number(m[2]) } : null;
}

/** The LMS kept the file but did not hand it in (still a draft). */
export class DraftOnly extends Error {
  constructor() {
    super("The LMS saved your file as a draft but did not hand it in. Open the assignment and press Submit.");
  }
}

/**
 * Hands a file in to the student's OWN assignment on the LMS, with the login
 * they saved on their own phone. Nothing here ever submits for anyone else.
 *
 * Resolves only once the LMS says it is in. "checked" is false on older app
 * builds, which upload fine but cannot ask the LMS afterwards.
 */
export async function submitToLms(instance: number, blob: Blob, name: string): Promise<{ checked: boolean }> {
  if (!isNativeApp()) throw new Error("Submitting works in the DockIn app.");
  let res: { status?: string } | void;
  try {
    res = await DockIn.lmsSubmit({ instance, name, mime: mimeOf(name, blob.type), data: await toBase64(blob) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/WEB_ONLY/.test(msg)) throw new WebOnlyLms();
    throw new Error(msg || "Could not submit.");
  }
  const status = (res && res.status) || "";
  if (status === "draft" || status === "new" || status === "reopened") throw new DraftOnly();
  return { checked: status === "submitted" };
}
