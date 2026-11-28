/**
 * Self-approval: the second MyCamu login the college gives a student to approve
 * their own gate pass. DockIn remembers it so the pass can be approved from
 * inside the app — no second login each time, no second app.
 *
 * Everything real happens natively ({@link DockIn}); on the web these are safe
 * no-ops so the screens still render. The native side learns MyCamu's sign-in
 * and approve from the student doing it once, then replays them.
 */
"use client";

import { useEffect, useState } from "react";
import { DockIn, isNativeApp, onPhone } from "./native";
import { camuWeb, CamuWebError } from "./camu/web";

export interface ApproverState {
  /** A self-approval login is saved (its session may still have ended). */
  saved: boolean;
  /** DockIn has learned the approve and can do it on its own. */
  taught: boolean;
  /** The student has typed a username and password. */
  hasCreds: boolean;
  /** The approver login's name, when MyCamu gave one. */
  user: string;
}

const OFF: ApproverState = { saved: false, taught: false, hasCreds: false, user: "" };

/** Save the typed approval username/password (for pre-fill and silent renewal). */
export async function saveApproverCreds(user: string, pass: string): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await DockIn.saveApproverCreds({ user, pass });
  } catch {
    // best-effort
  }
}

/** The MyCamu page the approver screen lands on: the leave / gate-pass list. */
const APPROVE_PATH = "/v2/#/leave";

export async function approverState(): Promise<ApproverState> {
  if (!isNativeApp()) {
    // On the web the linked MyCamu login is itself the approver: connected means
    // DockIn can approve straight away, no second login.
    try {
      const s = await camuWeb.status();
      return s.linked ? { saved: true, taught: true, hasCreds: true, user: s.name ?? "" } : OFF;
    } catch {
      return OFF;
    }
  }
  try {
    return await DockIn.approverState();
  } catch {
    return OFF;
  }
}

/** Live self-approval state for a screen — refreshes on mount and when the app resumes. */
export function useApproverState(): ApproverState {
  const [st, setSt] = useState<ApproverState>(OFF);
  useEffect(() => {
    let live = true;
    const load = () => void approverState().then((s) => live && setSt(s));
    load();
    const off = onPhone("resume", load);
    return () => {
      live = false;
      off();
    };
  }, []);
  return st;
}

/**
 * Opens the self-approval sign-in. The student signs in with the college's
 * approval username and password, and (when a pass is open) approves it once, so
 * DockIn can do it on its own afterwards. Resolves with the new state.
 */
/** This phone's app is too old for self-approval (the native side isn't there). */
export const OLD_APP = "Update DockIn to the latest app — this version doesn't have self-approval yet.";

export async function connectApprover(note?: string): Promise<ApproverState> {
  if (!isNativeApp()) return approverState();
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
  /** DockIn opened the sign-in instead — why says which case, so the UI can explain it. */
  | { ok: false; opened: true; state: ApproverState; why: "setup" | "teach" | "expired" }
  /** Couldn't do it and didn't open the screen (web, or a passing network error — just retry). */
  | { ok: false; opened: false; reason: string };

/**
 * Approves one pass. Silent once DockIn knows how. It only opens MyCamu when it
 * genuinely has to — the login isn't set up, isn't taught yet, or the session
 * ended — never for a passing network blip (that just asks to try again), so a
 * set-up tap never surprises you by opening MyCamu.
 */
export async function approvePass(id: string, note?: string): Promise<ApproveOutcome> {
  if (!isNativeApp()) {
    // Web / iPhone: approve through the server bridge with the linked login.
    try {
      const r = await camuWeb.approve(id);
      return { ok: true, status: r.code };
    } catch (e) {
      const err = e as CamuWebError;
      if (err?.needsLink) return { ok: false, opened: false, reason: "Connect MyCamu first on the Today screen." };
      return { ok: false, opened: false, reason: err?.message || "Couldn't approve — try again." };
    }
  }
  const st = await approverState();
  if (st.saved && st.taught) {
    try {
      const r = await DockIn.approveSelf({ id });
      return { ok: true, status: r.status };
    } catch (e) {
      const code = codeOf(e);
      if (code === "expired") return openScreen(note, "expired");
      if (code === "teach") return openScreen(note, "teach");
      // A passing network error — don't yank MyCamu open, just let them retry.
      return { ok: false, opened: false, reason: "network" };
    }
  }
  return openScreen(note, st.saved ? "teach" : "setup");
}

async function openScreen(note: string | undefined, why: "setup" | "teach" | "expired"): Promise<ApproveOutcome> {
  try {
    const after = await connectApprover(note);
    return { ok: false, opened: true, state: after, why };
  } catch (e) {
    return { ok: false, opened: false, reason: e instanceof Error && e.message ? e.message : "network" };
  }
}

function codeOf(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) return String((e as { code?: unknown }).code ?? "");
  return "";
}

/** Capacitor's rejection when the installed app doesn't carry a native method. */
function unimplemented(e: unknown): boolean {
  const parts =
    e && typeof e === "object"
      ? `${String((e as { message?: unknown }).message ?? "")} ${String((e as { code?: unknown }).code ?? "")}`
      : String(e);
  return /not implemented|unimplemented/i.test(parts);
}
