"use client";

import { Activity, BellRing, Bug, CheckCircle2, Download, Flag, Megaphone, Radio, ShieldAlert, Smartphone, UserPlus, Users, Wifi } from "lucide-react";
import { change, overview2, pctOf, type Overview2 } from "@/lib/adminApi";
import { AreaChart, Donut, Sparkline } from "./charts";
import { Card, Delta, Failed, fmt, Freshness, Kpi, LiveDot, Skeleton, useAuto, useLoad } from "./parts";

export function CommandCenter({ go }: { go: (s: string, f?: string) => void }) {
  const { data, error, loading, reload, at } = useLoad(overview2);
  useAuto(reload, 30_000);

  if (error && !data) return <Failed error={error} retry={reload} />;
  if (!data) return <Skeleton rows={4} />;
  const o = data;

  const alerts = buildAlerts(o);
  const series = o.series;
  const spark = (k: keyof (typeof series)[number]) => series.map((d) => Number(d[k]) || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Freshness at={at} loading={loading} every="30s" />
        {o.tracking_since && <span className="hidden text-[12px] text-muted sm:inline">tracking opens since {new Date(o.tracking_since).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
      </div>

      {alerts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {alerts.map((a) => (
            <button key={a.key} type="button" onClick={a.go ? () => go(a.go![0], a.go![1]) : undefined} className={`adm-card flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${a.tone === "bad" ? "border-danger/30 bg-danger-soft" : "border-warn/30 bg-warn-soft"}`}>
              <span className={a.tone === "bad" ? "text-danger" : "text-warn"}>{a.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold">{a.title}</span>
                <span className="block text-[12px] text-muted">{a.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Online now"
          value={fmt(o.online_5m)}
          icon={<LiveDot />}
          hint={`${fmt(o.online_1h)} in the last hour`}
        />
        <Kpi
          label="Active today"
          value={fmt(o.dau)}
          icon={<Activity size={15} />}
          tone={(change(o.dau, o.dau_yday) ?? 0) >= 0 ? "good" : "bad"}
          hint={<Delta pct={change(o.dau, o.dau_yday)} suffix=" vs yesterday" />}
          onClick={() => go("growth")}
        />
        <Kpi
          label="Signed up today"
          value={fmt(o.signups_today)}
          icon={<UserPlus size={15} />}
          hint={<span>yesterday by now: {fmt(o.signups_yday_sofar)}</span>}
          tone={o.signups_today >= o.signups_yday_sofar ? "good" : undefined}
          onClick={() => go("students", "new")}
        />
        <Kpi
          label="Total students"
          value={fmt(o.users)}
          icon={<Users size={15} />}
          hint={`${pctOf(o.verified, o.users)}% verified with MyCamu`}
          onClick={() => go("students")}
        />
      </div>

      {/* main chart */}
      <Card title="Last 30 days" sub="Signups, students active that day, and messages">
        <AreaChart
          labels={series.map((d) => new Date(`${d.d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))}
          series={[
            { name: "Active", values: spark("active"), color: "var(--accent)" },
            { name: "Signups", values: spark("signups"), color: "#3b82f6" },
            { name: "Messages", values: spark("messages"), color: "#f59e0b" },
          ]}
        />
      </Card>

      {/* reach + engagement */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="WAU" value={fmt(o.wau)} hint={<Delta pct={change(o.wau, o.wau_prev)} suffix=" wk/wk" />} tone={(change(o.wau, o.wau_prev) ?? 0) >= 0 ? "good" : "bad"} />
        <Kpi label="MAU" value={fmt(o.mau)} hint={`avg ${o.avg_dau_30} active/day`} />
        <Kpi label="Signups 7d" value={fmt(o.signups_7d)} hint={<Delta pct={change(o.signups_7d, o.signups_prev7d)} suffix=" vs prev 7d" />} tone={(change(o.signups_7d, o.signups_prev7d) ?? 0) >= 0 ? "good" : "bad"} />
        <Kpi label="Stickiness" value={`${pctOf(o.dau, o.mau)}%`} hint="DAU ÷ MAU" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Where students are" sub="of everyone who's opened DockIn">
          <Donut
            label="opened"
            parts={[
              { label: "Android app", value: o.android, color: "var(--accent)" },
              { label: "Website", value: o.web, color: "#3b82f6" },
            ]}
          />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Mini icon={<Smartphone size={14} />} label="MyCamu" value={`${pctOf(o.camu, o.seen)}%`} />
            <Mini icon={<BellRing size={14} />} label="Notifs on" value={`${pctOf(o.notif_on, o.seen)}%`} />
            <Mini icon={<Wifi size={14} />} label="Instant push" value={`${pctOf(o.push_instant, Math.max(1, o.push))}%`} />
          </div>
        </Card>

        <Card title="Health at a glance" sub="last 24 hours" action={<Sparkline values={spark("errors")} className="w-24" />}>
          <div className="grid grid-cols-2 gap-2.5">
            <Health2Tile icon={<Bug size={15} />} label="Errors 24h" value={fmt(o.errors_24h)} delta={change(o.errors_24h, o.errors_prev24h)} invert sub={`${fmt(o.error_users_24h)} students`} badTone />
            <Health2Tile icon={<Flag size={15} />} label="Open reports" value={fmt(o.reports_open)} sub="tap to review" onClick={() => go("reports")} badTone={o.reports_open > 0} />
            <Health2Tile icon={<ShieldAlert size={15} />} label="Verify conflicts 7d" value={fmt(o.identity_issues_7d)} sub="someone else's MyCamu" onClick={() => go("trust")} badTone={o.identity_issues_7d > 0} />
            <Health2Tile icon={<Download size={15} />} label="Downloads 7d" value={fmt(o.downloads_7d)} sub={o.latest_version ? `on ${o.latest_version}: ${pctOf(o.on_latest, Math.max(1, o.android_30d))}%` : undefined} />
          </div>
        </Card>
      </div>

      {o.preview > 0 && (
        <Card title="Rollout" sub="App version spread, students active in the last 30 days">
          <ul className="space-y-2">
            {o.versions.slice(0, 6).map((v) => (
              <li key={v.v} className="flex items-center gap-3 text-[13px]">
                <span className="w-24 shrink-0 font-semibold tabular-nums">{v.v}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${pctOf(v.n, Math.max(1, o.versions[0]?.n ?? 1))}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums text-muted">{v.n}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-2 py-2.5">
      <p className="flex items-center justify-center gap-1 text-[11px] text-muted">
        {icon} {label}
      </p>
      <p className="text-[15px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function Health2Tile({ icon, label, value, sub, delta, invert, badTone, onClick }: { icon: React.ReactNode; label: string; value: string; sub?: string; delta?: number | null; invert?: boolean; badTone?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag {...(onClick ? { type: "button" as const, onClick } : {})} className={`rounded-xl border px-3 py-2.5 text-left ${badTone ? "border-danger/25 bg-danger-soft" : "border-line bg-surface"} ${onClick ? "transition active:translate-y-px" : ""}`}>
      <p className={`flex items-center gap-1.5 text-[11.5px] font-semibold ${badTone ? "text-danger" : "text-muted"}`}>
        {icon} {label}
      </p>
      <p className="mt-0.5 flex items-baseline gap-2 text-[18px] font-extrabold tabular-nums">
        {value}
        {delta !== undefined && <Delta pct={delta} invert={invert} />}
      </p>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </Tag>
  );
}

function buildAlerts(o: Overview2) {
  const a: { key: string; tone: "bad" | "warn"; icon: React.ReactNode; title: string; sub: string; go?: [string, string?] }[] = [];
  const errDelta = change(o.errors_24h, o.errors_prev24h);
  if (o.errors_24h >= 20 && (errDelta ?? 0) > 40)
    a.push({ key: "err", tone: "bad", icon: <Bug size={18} />, title: `Errors up ${errDelta}%`, sub: `${fmt(o.errors_24h)} in 24h, ${fmt(o.error_users_24h)} students hit`, go: ["health"] });
  if (o.reports_open > 0)
    a.push({ key: "rep", tone: "warn", icon: <Flag size={18} />, title: `${o.reports_open} report${o.reports_open === 1 ? "" : "s"} to review`, sub: "students flagged messages", go: ["reports"] });
  if (o.identity_issues_7d > 0)
    a.push({ key: "idn", tone: "warn", icon: <ShieldAlert size={18} />, title: `${o.identity_issues_7d} verify conflict${o.identity_issues_7d === 1 ? "" : "s"} this week`, sub: "accounts using someone else's MyCamu", go: ["trust"] });
  if (o.online_5m === 0 && o.active_24h > 20)
    a.push({ key: "ghost", tone: "warn", icon: <Radio size={18} />, title: "Nobody online right now", sub: `${fmt(o.active_24h)} were active in the last day` });
  return a.slice(0, 2);
}

/** A nothing-wrong reassurance used elsewhere. */
export function AllClear({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-safe/30 bg-safe-soft px-3.5 py-2.5 text-[13px] font-semibold text-safe">
      <CheckCircle2 size={16} /> {label}
    </div>
  );
}

/** A compact "sent a notification" marker reused by the activity feed. */
export const FEED_ICON = Megaphone;
