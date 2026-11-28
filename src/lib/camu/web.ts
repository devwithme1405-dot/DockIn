"use client";

/**
 * Browser side of the server MyCamu bridge: thin, typed calls to /api/camu/*.
 * This is what lets iPhone and any browser do everything the Android app does —
 * the request goes to DockIn's server, which talks to MyCamu. No native plugin.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../supabase";

export interface LinkStatus {
  linked: boolean;
  name?: string;
  stuId?: string;
  lastOk?: string | null;
}

export class CamuWebError extends Error {
  constructor(
    message: string,
    readonly kind: string = "camu",
    readonly needsLink = false,
  ) {
    super(message);
    this.name = "CamuWebError";
  }
}

async function token(): Promise<string> {
  const sb = getSupabase();
  const t = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
  if (!t) throw new CamuWebError("Sign in again.", "auth");
  return t;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const t = await token();
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${t}`, "content-type": "application/json" }, cache: "no-store" });
  } catch {
    throw new CamuWebError("No connection — check your internet.", "network");
  }
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: T; error?: string; kind?: string; needsLink?: boolean };
  if (!res.ok || !j.ok) throw new CamuWebError(j.error || `Server said ${res.status}`, j.kind ?? "camu", !!j.needsLink || res.status === 440);
  return j.data as T;
}

const post = <T>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const get = <T>(path: string) => call<T>(path, { method: "GET" });

export const camuWeb = {
  status: () => get<LinkStatus>("/api/camu/status"),
  link: (email: string, password: string) => post<{ name: string; stuId: string; semName: string }>("/api/camu/link", { email, password }),
  unlink: () => post<void>("/api/camu/unlink"),
  passes: () => get<unknown>("/api/camu/passes"),
  attendance: () => get<CamuWebAttendance>("/api/camu/attendance"),
  timetable: (from: string, to: string) => get<unknown>(`/api/camu/timetable?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  history: (subjectId: string) => post<unknown>("/api/camu/history", { subjectId }),
  mess: () => get<{ menu: unknown; qr: unknown }>("/api/camu/mess"),
  dayOut: (day: string, from: string, to: string, reason: string) => post<unknown>("/api/camu/outpass", { kind: "dayout", day, from, to, reason }),
  leave: (i: { fromDay: string; from: string; toDay: string; to: string; reason: string; fileName: string; attId: string; atchId: string }) => post<unknown>("/api/camu/outpass", { kind: "leave", ...i }),
  approve: (passId: string) => post<{ code: string }>("/api/camu/approve", { passId }),
  cancel: (passId: string) => post<unknown>("/api/camu/cancel", { passId }),
};

/** MyCamu's attendance payload, only the fields the card shows. */
export interface CamuWebAttendance {
  OvrAllPrcntg?: number;
  CurMnthPrcntg?: number;
  OvrAllPCnt?: number;
  OvrAllCnt?: number;
  subjectList?: {
    SubNa?: string;
    SubCode?: string;
    Prcntg?: number;
    PCnt?: number;
    TCnt?: number;
  }[];
  [k: string]: unknown;
}

/** Live link status, refreshed on mount and when the tab comes back. */
export function useCamuLink(): { status: LinkStatus | null; loading: boolean; refresh: () => void } {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    setLoading(true);
    camuWeb
      .status()
      .then((s) => setStatus(s))
      .catch(() => setStatus({ linked: false }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    const on = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", on);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", on);
    };
  }, [refresh]);
  return { status, loading, refresh };
}
