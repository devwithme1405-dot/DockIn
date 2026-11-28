"use client";

import { useState } from "react";
import { ChevronRight, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { risk, SIGNAL_LABEL, type SignalId } from "@/lib/adminApi";
import { Avatar, cx } from "../ui";
import { Card, Empty, Failed, Freshness, Pills, Skeleton, useAuto, useLoad } from "./parts";

/** Trust & Safety: accounts that look fake or off, scored from plain database facts. */
export function Trust({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [sig, setSig] = useState<"all" | SignalId>("all");
  const { data, error, loading, reload, at } = useLoad(() => risk(1, 300));
  useAuto(reload, 60_000);

  if (error && !data) return <Failed error={error} retry={reload} />;
  if (!data) return <Skeleton rows={4} />;

  const rows = sig === "all" ? data.rows : data.rows.filter((r) => r.signals.some((s) => s.id === sig));
  const sigOptions: (readonly [("all" | SignalId), string, number | undefined])[] = [
    ["all", "All flagged", data.flagged] as const,
    ...(Object.keys(data.by_signal) as SignalId[])
      .sort((a, b) => (data.by_signal[b] ?? 0) - (data.by_signal[a] ?? 0))
      .map((s) => [s, SIGNAL_LABEL[s], data.by_signal[s]] as const),
  ];

  return (
    <div className="space-y-4">
      <Freshness at={at} loading={loading} every="60s" />

      <div className="grid grid-cols-3 gap-3">
        <RiskTile icon={<ShieldX size={16} />} tone="bad" label="High risk" value={data.high} sub="score 50+" />
        <RiskTile icon={<ShieldAlert size={16} />} tone="warn" label="Worth a look" value={data.medium} sub="score 25–49" />
        <RiskTile icon={<ShieldCheck size={16} />} tone="good" label="Checked" value={data.checked} sub={`${data.flagged} flagged`} />
      </div>

      <Card title="How scoring works" pad={false}>
        <div className="px-5 py-3 text-[12.5px] leading-relaxed text-muted">
          Every signal below is a plain fact from the database — not a guess. Scores add up; 50+ is high. Tap a student to see each reason and, if it&apos;s a verify mix-up, reset their MyCamu link.
        </div>
      </Card>

      <Pills value={sig} onChange={setSig} options={sigOptions} />

      {rows.length === 0 ? (
        <Empty icon={<ShieldCheck />} title={sig === "all" ? "Nothing flagged" : "None with this signal"} sub="No accounts match — that's a good thing." />
      ) : (
        <div className="adm-card overflow-hidden rounded-2xl border border-line bg-card">
          <ul className="divide-y divide-line/70">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpenUser(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface">
                  <ScoreRing score={r.score} />
                  <Avatar name={r.name || r.username} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-semibold">{r.name || r.username}</span>
                      {r.banned && <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-bold text-danger">Suspended</span>}
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      @{r.username}
                      {r.enrollment ? ` · ${r.enrollment}` : " · not verified"}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {r.signals.map((s) => (
                        <span key={s.id} title={s.text} className={cx("rounded-md px-1.5 py-0.5 text-[10.5px] font-bold", s.w >= 35 ? "bg-danger-soft text-danger" : s.w >= 15 ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted")}>
                          {SIGNAL_LABEL[s.id]}
                        </span>
                      ))}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="px-1 text-[11.5px] text-muted">Last seen is shown inside each student. A high score isn&apos;t proof — it&apos;s a reason to look.</p>
    </div>
  );
}

function RiskTile({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: "bad" | "warn" | "good"; label: string; value: number; sub: string }) {
  return (
    <div className={cx("adm-card rounded-2xl border px-4 py-3.5", tone === "bad" ? "border-danger/30 bg-danger-soft" : tone === "warn" ? "border-warn/30 bg-warn-soft" : "border-line bg-card")}>
      <p className={cx("flex items-center gap-1.5 text-[11.5px] font-semibold", tone === "bad" ? "text-danger" : tone === "warn" ? "text-warn" : "text-muted")}>
        {icon} {label}
      </p>
      <p className="font-display mt-1 text-[26px] font-extrabold tabular-nums">{value}</p>
      <p className="text-[11.5px] text-muted">{sub}</p>
    </div>
  );
}

/** A little dial showing the risk score 0–100. */
function ScoreRing({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const r = 15;
  const c = 2 * Math.PI * r;
  const color = score >= 50 ? "var(--danger)" : score >= 25 ? "var(--warn)" : "var(--muted)";
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
      </svg>
      <span className="absolute text-[11px] font-extrabold tabular-nums" style={{ color }}>
        {score}
      </span>
    </span>
  );
}
