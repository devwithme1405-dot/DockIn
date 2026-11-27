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
export async function connectApprover(note?: string): Promise<ApproverState> {
  if (!isNativeApp()) return OFF;
  try {
    return await DockIn.openApprover({ path: APPROVE_PATH, note });
  } catch {
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
    } catch (e) {
      // "teach" (not learned yet) or "expired" (session ended): fall through to
      // the screen. A real network error we report.
      const code = codeOf(e);
      if (code !== "teach" && code !== "expired") {
        return { ok: false, opened: false, reason: code || "network" };
      }
    }
  }
  const after = await connectApprover(note);
  return { ok: false, opened: true, state: after };
}

function codeOf(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) return String((e as { code?: unknown }).code ?? "");
  return "";
}
