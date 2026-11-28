import { flagsNow, track } from "./telemetry";
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
export async function submitToLms(
  instance: number,
  blob: Blob,
  name: string,
  /** The task's LMS link and title: the phone uses them to be sure it is the right assignment. */
  hint: { url?: string | null; title?: string | null } = {},
): Promise<{ checked: boolean }> {
  if (!isNativeApp()) throw new Error("Submitting works in the DockIn app.");
  if (!flagsNow().lms_submit) {
    track("lms.submit", { ok: false, reason: "paused" });
    throw new Error("Submitting from DockIn is paused for a bit. Save the file and upload it on the LMS.");
  }
  try {
    const r = await submitInner(instance, blob, name, hint);
    track("lms.submit", { ok: true, checked: r.checked });
    return r;
  } catch (e) {
    track("lms.submit", { ok: false, reason: lmsReason(e) });
    throw e;
  }
}

/** A short, fixed word for why a hand-in failed (no LMS text, which can name the course). */
function lmsReason(e: unknown): string {
  if (e instanceof WebOnlyLms) return "web_only";
  if (e instanceof DraftOnly) return "draft_only";
  const m = e instanceof Error ? e.message : String(e);
  if (/latest DockIn|Update DockIn/i.test(m)) return "old_app";
  if (/closed|last date|cut-?off|due date/i.test(m)) return "closed";
  if (/locked/i.test(m)) return "locked";
  if (/sign ?in|log ?in|token|session/i.test(m)) return "signed_out";
  if (/network|timeout|reach|offline|connect/i.test(m)) return "network";
  if (/size|too (big|large)|maxbytes/i.test(m)) return "too_big";
  return "other";
}

async function submitInner(
  instance: number,
  blob: Blob,
  name: string,
  hint: { url?: string | null; title?: string | null },
): Promise<{ checked: boolean }> {
  let res: { status?: string } | void;
  const cmid = cmidOf(hint.url);
  try {
    res = await DockIn.lmsSubmit({
      instance,
      ...(cmid ? { cmid } : {}),
      ...(hint.title ? { title: hint.title } : {}),
      name,
      mime: mimeOf(name, blob.type),
      data: await toBase64(blob),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/WEB_ONLY/.test(msg)) throw new WebOnlyLms();
    // Older DockIn builds misread the assignment number and refuse every hand-in.
    if (/Missing the assignment or the file/i.test(msg)) {
      throw new Error("This needs the latest DockIn. Update the app and try again — or Save file and upload it on the LMS.");
    }
    // Only builds older than 2.0.x (23 Nov) send the hand-in to a guessed assignment id.
    if (/database table assign\b/i.test(msg)) {
      throw new Error("This copy of DockIn could not find the assignment on the LMS. Update DockIn and try again — or Save file and upload it on the LMS.");
    }
    throw new Error(lmsWords(msg) || "Could not submit.");
  }
  const status = (res && res.status) || "";
  if (status === "draft" || status === "new" || status === "reopened") throw new DraftOnly();
  return { checked: status === "submitted" };
}

/** ".../mod/assign/view.php?id=1234" → 1234 (the assignment page's course-module id). */
export function cmidOf(url: string | null | undefined): number | null {
  const m = /\/mod\/assign\/view\.php\?(?:[^#]*&)?id=(\d+)/.exec(url ?? "");
  return m ? Number(m[1]) : null;
}

/** Moodle's own error text, without its "[errorcode]" tail and trailing dot noise. */
export function lmsWords(msg: string): string {
  return msg.replace(/\s*\[[a-z_]+\]\s*$/i, "").trim();
}
