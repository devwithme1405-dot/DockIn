"use client";

import { useState } from "react";
import { BellRing, CheckCircle2, DoorOpen, FileUp, Mic, Send, Stamp, XCircle } from "lucide-react";
import { eventLabel, features, pctOf } from "@/lib/adminApi";
import { BarList, MiniBars } from "./charts";
import { Card, Failed, Pills, RefreshButton, Skeleton, Stat, useLoad } from "./parts";

const RANGE = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
] as const;

/** Readable names for outpass failure codes the app reports. */
const FAIL_CODE: Record<string, string> = {
  refused: "MyCamu refused",
  "not-sendable": "Missing details",
  "not-ready": "MyCamu not connected",
  "web": "On website (no app)",
  "old-app": "Old app version",
  "signed-out": "Signed out of MyCamu",
  network: "Network / timeout",
  "?": "Unknown",
};
const LMS_REASON: Record<string, string> = {
  web_only: "On website (no app)",
  draft_only: "Saved as draft only",
  old_app: "Old app version",
  closed: "Submission closed",
  locked: "Assignment locked",
  signed_out: "Signed out",
  network: "Network / timeout",
  too_big: "File too big",
  paused: "Turned off by admin",
  other: "Other",
  "?": "Unknown",
};

export function Features() {
  const [days, setDays] = useState<(typeof RANGE)[number][0]>("30");
  const { data, error, loading, reload } = useLoad(() => features(Number(days)), [days]);

  if (error && !data) return <Failed error={error} retry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Pills value={days} onChange={setDays} options={RANGE} />
        <RefreshButton loading={loading} onClick={() => void reload()} />
      </div>

      {!data ? (
        <Skeleton rows={4} />
      ) : data.total === 0 ? (
        <Card title="Nothing recorded yet">
          <p className="py-4 text-center text-[13px] text-muted">
            DockIn starts counting feature use once students are on the version with tracking. Numbers fill in as they open the app.
          </p>
        </Card>
      ) : (
        <>
          {/* Outpass — the headline feature, with success/fail */}
          <Card title="Outpass" sub={`${data.outpass.users} students · last ${days} days`}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Passes made" value={data.outpass.made} sub={`${data.outpass.dayout} day-out · ${data.outpass.leave} leave`} />
              <SuccessStat label="Sent to MyCamu" ok={data.outpass.sent_ok} fail={data.outpass.sent_fail} />
              <SuccessStat label="Self-approved" ok={data.outpass.approved_ok} fail={data.outpass.approved_fail} />
              <Stat label="Cancelled" value={data.outpass.cancelled} sub={`${data.outpass.voice} by voice · ${data.outpass.mail} warden mail`} />
            </div>
            {(data.outpass.sent_fail > 0 || Object.keys(data.outpass.fail_codes).length > 0) && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-danger uppercase tracking-[0.05em]">
                  <XCircle size={13} /> Why sends failed
                </p>
                <BarList
                  color="var(--danger)"
                  items={Object.entries(data.outpass.fail_codes)
                    .sort((a, b) => b[1] - a[1])
                    .map(([c, n]) => ({ label: FAIL_CODE[c] ?? c, value: n }))}
                />
              </div>
            )}
            <SuccessBar ok={data.outpass.sent_ok} total={data.outpass.sent_ok + data.outpass.sent_fail} label="of outpasses reached MyCamu" />
          </Card>

          {/* LMS */}
          <Card title="LMS hand-in" sub={`${data.lms.users} students · last ${days} days`}>
            <div className="grid grid-cols-2 gap-2.5">
              <SuccessStat label="Handed in" ok={data.lms.ok} fail={data.lms.fail} />
              <Stat label="Attempts" value={data.lms.ok + data.lms.fail} />
            </div>
            {Object.keys(data.lms.reasons).length > 0 && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-danger uppercase tracking-[0.05em]">
                  <XCircle size={13} /> Why hand-ins failed
                </p>
                <BarList color="var(--danger)" items={Object.entries(data.lms.reasons).sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ label: LMS_REASON[c] ?? c, value: n }))} />
              </div>
            )}
            <SuccessBar ok={data.lms.ok} total={data.lms.ok + data.lms.fail} label="of hand-ins went through" />
          </Card>

          {/* Notifications effectiveness */}
          <Card title="Notifications" sub={`${data.notifications.sent} sent · last ${days} days`}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Targeted" value={data.notifications.targeted} sub="students aimed at" />
              <Stat label="Arrived" value={data.notifications.delivered} sub={`${pctOf(data.notifications.delivered, data.notifications.targeted)}% of targeted`} tone="good" />
              <Stat label="Opened" value={data.notifications.opened} sub={`${pctOf(data.notifications.opened, Math.max(1, data.notifications.delivered))}% of arrived`} />
              <Stat label="Open rate" value={`${pctOf(data.notifications.opened, Math.max(1, data.notifications.targeted))}%`} sub="of everyone targeted" />
            </div>
          </Card>

          {/* Everything, with trend */}
          <Card title="Every feature used" sub="Most-used first, with the last 14 days">
            <ul className="space-y-1">
              {data.names.map((n) => {
                const pts = data.series.find((s) => s.name === n.name)?.points ?? [];
                return (
                  <li key={n.name} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">{iconFor(n.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{eventLabel(n.name)}</span>
                      <span className="block text-[11.5px] text-muted">
                        {n.n.toLocaleString("en-IN")} times · {n.users} students
                      </span>
                    </span>
                    {pts.length > 0 && <MiniBars values={pts} />}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function iconFor(name: string) {
  if (name.startsWith("outpass.voice")) return <Mic size={15} />;
  if (name.startsWith("outpass.approve")) return <Stamp size={15} />;
  if (name.startsWith("outpass")) return <DoorOpen size={15} />;
  if (name.startsWith("lms")) return <FileUp size={15} />;
  if (name.startsWith("notif")) return <BellRing size={15} />;
  return <Send size={15} />;
}

function SuccessStat({ label, ok, fail }: { label: string; ok: number; fail: number }) {
  const total = ok + fail;
  const tone = total === 0 ? undefined : ok / total >= 0.9 ? "good" : ok / total >= 0.7 ? "warn" : "bad";
  return <Stat label={label} value={ok} tone={tone} sub={total === 0 ? "none yet" : `${pctOf(ok, total)}% ok · ${fail} failed`} />;
}

function SuccessBar({ ok, total, label }: { ok: number; total: number; label: string }) {
  if (total === 0) return null;
  const pct = pctOf(ok, total);
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-danger-soft">
        <div className="h-full rounded-full bg-safe transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-bold">
        {pct >= 90 ? <CheckCircle2 size={14} className="text-safe" /> : <XCircle size={14} className="text-warn" />}
        {pct}% <span className="font-normal text-muted">{label}</span>
      </span>
    </div>
  );
}
