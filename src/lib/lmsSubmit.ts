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

/**
 * Hands a file in to the student's OWN assignment on the LMS, with the login
 * they saved on their own phone. Nothing here ever submits for anyone else.
 */
export async function submitToLms(instance: number, blob: Blob, name: string): Promise<void> {
  if (!isNativeApp()) throw new Error("Submitting works in the DockIn app.");
  try {
    await DockIn.lmsSubmit({ instance, name, mime: mimeOf(name, blob.type), data: await toBase64(blob) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/WEB_ONLY/.test(msg)) throw new WebOnlyLms();
    throw new Error(msg || "Could not submit.");
  }
}
