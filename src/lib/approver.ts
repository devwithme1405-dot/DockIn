/**
 * Self-approval: the second MyCamu login the college gives a student to approve
 * their own gate pass. DockIn remembers it so the pass can be approved from
 * inside the app — no second login each time, no second app.
 *
 * Everything real happens natively ({@link DockIn}); on the web these are safe
 * no-ops so the screens still render. The native side learns MyCamu's sign-in
 * and approve from the student doing it once, then replays them.
 */
import { DockIn, isNativeApp } from "./native";

export interface ApproverState {
  /** A self-approval login is saved (its session may still have ended). */
  saved: boolean;
  /** DockIn has learned the approve and can do it on its own. */
  taught: boolean;
  /** The approver login's name, when MyCamu gave one. */
  user: string;
}

const OFF: ApproverState = { saved: false, taught: false, user: "" };

/** The MyCamu page the approver screen lands on: the leave / gate-pass list. */
const APPROVE_PATH = "/v2/#/leave";

export async function approverState(): Promise<ApproverState> {
  if (!isNativeApp()) return OFF;
  try {
    return await DockIn.approverState();
  } catch {
    return OFF;
  }
}

/**
 * Opens the self-approval sign-in. The student signs in with the college's
 * approval username and password, and (when a pass is open) approves it once, so
 * DockIn can do it on its own afterwards. Resolves with the new state.
 */
/** This phone's app is too old for self-approval (the native side isn't there). */
export const OLD_APP = "Update DockIn to the latest app — this version doesn't have self-approval yet.";

export async function connectApprover(note?: string): Promise<ApproverState> {
  if (!isNativeApp()) throw new Error("Open DockIn on your phone to connect self-approval.");
  try {
    return await DockIn.openApprover({ path: APPROVE_PATH, note });
  } catch (e) {
    // The sign-in screen opening and later closing is a success; the only quick
    // rejection is an app that doesn't have this method yet.
    if (unimplemented(e)) throw new Error(OLD_APP);
    return approverState();
  }
}

export async function forgetApprover(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await DockIn.forgetApprover();
  } catch {
    // Nothing to undo.
  }
}

export type ApproveOutcome =
  /** Done — MyCamu approved it. */
  | { ok: true; status?: string }
  /** DockIn opened the sign-in instead: not saved yet, not taught, or the session ended. */
  | { ok: false; opened: true; state: ApproverState }
  /** Couldn't do it and couldn't open the screen (web, or an odd failure). */
  | { ok: false; opened: false; reason: string };

/**
 * Approves one pass. Does it silently when DockIn already knows how; otherwise
 * opens the self-approval screen so the student does it once (and teaches it).
 */
export async function approvePass(id: string, note?: string): Promise<ApproveOutcome> {
  if (!isNativeApp()) return { ok: false, opened: false, reason: "web" };
  const st = await approverState();
  if (st.saved && st.taught) {
    try {
      const r = await DockIn.approveSelf({ id });
      return { ok: true, status: r.status };
    } catch {
      // Not learned yet, session ended, or a hiccup — never a dead end: open the
      // sign-in / approval screen so it always works (and re-learns if needed).
    }
  }
  try {
    const after = await connectApprover(note);
    return { ok: false, opened: true, state: after };
  } catch (e) {
    return { ok: false, opened: false, reason: e instanceof Error && e.message ? e.message : "network" };
  }
}

/** Capacitor's rejection when the installed app doesn't carry a native method. */
function unimplemented(e: unknown): boolean {
  const parts =
    e && typeof e === "object"
      ? `${String((e as { message?: unknown }).message ?? "")} ${String((e as { code?: unknown }).code ?? "")}`
      : String(e);
  return /not implemented|unimplemented/i.test(parts);
}
