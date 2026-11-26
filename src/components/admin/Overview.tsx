"use client";

import { Activity, Bell, Download, Flag, MessageCircle, Smartphone, TriangleAlert, UserPlus, Users, Wifi } from "lucide-react";
import { github, overview, pctOf, type Overview as O } from "@/lib/adminApi";
import { AreaChart, BarList, Donut, Funnel, Sparkline } from "./charts";
import { Card, Failed, Kpi, Loading, RefreshButton, useLoad } from "./parts";

const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function OverviewSection({ go }: { go: (section: string, filter?: string) => void }) {
  const o = useLoad(overview);
  const gh = useLoad(github);
  if (o.loading && !o.data) return <Loading />;
  if (o.error && !o.data) return <Failed error={o.error} retry={o.reload} />;
  const d = o.data as O;
  const s = d.series ?? [];
  const last7 = (k: "signups" | "active" | "messages" | "downloads") => s.slice(-7).reduce((a, x) => a + x[k], 0);
  const prev7 = (k: "signups" | "active" | "messages" | "downloads") => s.slice(-14, -7).reduce((a, x) => a + x[k], 0);
  const trend = (k: "signups" | "messages") => {
    const a = last7(k);
    const b = prev7(k);
    if (!b) return a ? "new this week" : "—";
    const p = Math.round(((a - b) / b) * 100);
    return `${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}% vs last week`;
  };
  const ghTotal = (gh.data?.releases ?? []).filter((r) => r.tag === "apk-latest").reduce((a, r) => a + r.downloads, 0);
  const stick = d.mau ? Math.round((d.dau / d.mau) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">Live numbers · India time</p>
        <RefreshButton
          loading={o.loading}
          onClick={() => {
            void o.reload();
            void gh.reload();
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Users size={15} />} label="Students" value={d.users} hint={`+${d.new_7d} this week · +${d.new_today} today`} tone={d.new_7d ? "good" : undefined} spark={<Sparkline values={s.map((x) => x.signups)} />} />
        <Kpi icon={<Activity size={15} />} label="Active today" value={d.dau} hint={`${d.wau} this week · ${d.mau} this month`} spark={<Sparkline values={s.map((x) => x.active)} />} />
        <Kpi icon={<Wifi size={15} />} label="Online now" value={d.online} hint="opened in the last 5 min" tone={d.online ? "good" : undefined} />
        <Kpi
          icon={<Download size={15} />}
          label="APK downloads"
          value={d.downloads + ghTotal}
          hint={`${ghTotal} of this build · ${d.downloads_7d} via link this week`}
          spark={<Sparkline values={s.map((x) => x.downloads)} />}
        />
      </div>

      <Card title="Growth & activity" sub="Last 30 days">
        <AreaChart
          labels={s.map((x) => day(x.d))}
          series={[
            { name: "Active", values: s.map((x) => x.active), color: "var(--accent)" },
            { name: "New sign-ups", values: s.map((x) => x.signups), color: "var(--safe)" },
          ]}
        />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-accent" /> Active students
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-safe" /> New sign-ups ({trend("signups")})
          </span>
          <span>Stickiness (daily ÷ monthly): <b className="text-[var(--text)]">{stick}%</b></span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Setup funnel" sub="Where students drop off — tap a step to see who missed it">
          <Funnel
            steps={[
              { label: "Signed up", value: d.users },
              { label: "Opened the app since tracking began", value: d.seen },
              { label: "Connected Camu", value: d.camu },
              { label: "Notifications on", value: d.notif_on },
              { label: "Connected the LMS", value: d.lms },
              { label: "Has a friend on DockIn", value: d.with_friends },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => go("users", "no_camu")} className="adm-link">
              {d.seen - d.camu} haven&apos;t connected Camu →
            </button>
            <button type="button" onClick={() => go("users", "no_push")} className="adm-link">
              {Math.max(0, d.users - d.push)} can&apos;t get notifications →
            </button>
            <button type="button" onClick={() => go("users", "inactive")} className="adm-link">
              Inactive 7+ days →
            </button>
          </div>
        </Card>

        <Card title="Phones & versions" sub="Opened in the last 30 days">
          <Donut
            label="students"
            parts={[
              { label: "Android app", value: d.android - d.preview, color: "var(--accent)" },
              { label: "DockIn 3 preview", value: d.preview, color: "var(--orange)" },
              { label: "Website", value: d.web, color: "var(--violet)" },
            ]}
          />
          <div className="mt-5">
            <p className="mb-2 text-[12px] font-bold tracking-[0.06em] text-muted uppercase">App versions</p>
            <BarList items={d.versions.map((v) => ({ label: v.v, value: v.n }))} total={d.versions.reduce((a, v) => a + v.n, 0)} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<MessageCircle size={15} />} label="Messages today" value={d.messages_today} hint={`${d.messages_7d} this week · ${trend("messages")}`} spark={<Sparkline values={s.map((x) => x.messages)} />} />
        <Kpi icon={<Bell size={15} />} label="Can get notifications" value={`${pctOf(d.push, d.users)}%`} hint={`${d.push} phones · ${d.push_instant} with instant ✓✓`} tone={pctOf(d.push, d.users) < 60 ? "warn" : "good"} />
        <button type="button" onClick={() => go("reports")} className="text-left">
          <Kpi icon={<Flag size={15} />} label="Open reports" value={d.reports_open} hint={d.reports_open ? "needs a look →" : "all clear"} tone={d.reports_open ? "bad" : "good"} />
        </button>
        <button type="button" onClick={() => go("health")} className="text-left">
          <Kpi icon={<TriangleAlert size={15} />} label="App errors (24 h)" value={d.errors_24h} hint={d.errors_24h ? "see what broke →" : "nothing broke"} tone={d.errors_24h ? "warn" : "good"} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<UserPlus size={15} />} label="Profiles made" value={d.profiles} hint={`${pctOf(d.profiles, d.users)}% of sign-ups`} />
        <Kpi icon={<Users size={15} />} label="Groups" value={d.groups} />
        <Kpi icon={<Smartphone size={15} />} label="On the Android app" value={d.android} hint={`${pctOf(d.android, d.seen)}% of active`} />
        <Kpi label="Suspended" value={d.banned} hint={d.banned ? "see Users → Suspended" : "none"} />
      </div>
    </div>
  );
}
