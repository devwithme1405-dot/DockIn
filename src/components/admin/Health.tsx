"use client";

import { useState } from "react";
import { Bot, Bug, CheckCircle2, CircleAlert, Copy, Database, Download, ExternalLink, Link2, Smartphone, Wifi } from "lucide-react";
import { ago, change, github, health2, identitySummary, overview2, serverHealth } from "@/lib/adminApi";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "../ui";
import { BarList, Sparkline } from "./charts";
import { Badge, Card, Delta, Empty, Failed, fmt, Loading, RefreshButton, Stat, useLoad } from "./parts";

const SITE = "https://dock-in.vercel.app";

/** Is everything working: errors students hit, versions out there, push health, downloads, services. */
export function HealthSection() {
  const toast = useToast();
  const h = useLoad(health2);
  const gh = useLoad(github);
  const o = useLoad(overview2);
  const checks = useLoad(async () => {
    const t0 = performance.now();
    const sb = getSupabase();
    const db = sb ? !(await sb.from("app_config").select("key").limit(1)).error : false;
    const ms = Math.round(performance.now() - t0);
    const ai = await fetch("/api/assistant", { method: "POST" }).then((r) => r.status).catch(() => 0);
    return { db, ms, ai: ai === 401 ? "ready" : ai === 503 ? "not set" : "unknown" };
  });
  const setup = useLoad(serverHealth);
  const ids = useLoad(identitySummary);
  const [open, setOpen] = useState<string | null>(null);

  const copy = (s: string) => void navigator.clipboard?.writeText(s).then(() => toast.show("Link copied"));

  return (
    <div className="space-y-4">
      {/* top signals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Check icon={<Database size={17} />} label="Database" ok={checks.data?.db} text={checks.data ? (checks.data.db ? `OK · ${checks.data.ms} ms` : "Down") : "Checking…"} />
        <Check icon={<Bot size={17} />} label="DockBot AI" ok={checks.data ? checks.data.ai === "ready" : undefined} warn={checks.data?.ai === "not set"} text={checks.data ? (checks.data.ai === "ready" ? "Connected" : checks.data.ai === "not set" ? "Demo mode" : "Unknown") : "Checking…"} />
        <Check icon={<Bug size={17} />} label="Errors 24h" ok={o.data ? o.data.errors_24h === 0 : undefined} warn={!!o.data?.errors_24h} text={o.data ? `${fmt(o.data.errors_24h)} · ${fmt(o.data.error_users_24h)} students` : "Checking…"} />
        <Check icon={<Wifi size={17} />} label="Presence" ok={h.data ? h.data.presence_failing === 0 : undefined} warn={!!h.data?.presence_failing} text={h.data ? (h.data.presence_failing === 0 ? "Healthy" : `${h.data.presence_failing} failing`) : "Checking…"} />
      </div>

      <Card title="Setup checks" sub="Everything notifications and these numbers need — with the exact reason when something isn't right" action={<RefreshButton loading={setup.loading} onClick={() => void setup.reload()} />}>
        {setup.error ? (
          <p className="text-[13.5px] font-semibold text-danger">{setup.error}</p>
        ) : !setup.data ? (
          <Loading />
        ) : (
          <ul className="space-y-2" aria-label="Setup checks">
            {setup.data.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-3 rounded-xl border border-line px-3.5 py-2.5">
                {c.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-safe" /> : <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">{c.label}</span>
                  <span className="block text-[12.5px] leading-snug text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* errors */}
      <Card
        title="What's breaking"
        sub="Grouped errors students' apps hit, last 7 days"
        action={<RefreshButton loading={h.loading} onClick={() => void h.reload()} />}
      >
        {h.error && !h.data ? (
          <Failed error={h.error} retry={h.reload} />
        ) : !h.data ? (
          <Loading />
        ) : h.data.errors.length === 0 ? (
          <Empty icon={<CheckCircle2 />} title="No errors this week" sub="Nothing crashed — nice." />
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5">
              <Sparkline values={h.data.error_series.map((p) => p.n)} className="h-10 flex-1" />
              <span className="shrink-0 text-right">
                <span className="block text-[11.5px] text-muted">last 48 h</span>
                <span className="block text-[15px] font-extrabold tabular-nums">{fmt(h.data.error_series.reduce((a, p) => a + p.n, 0))}</span>
              </span>
            </div>
            <ul className="space-y-2">
              {h.data.errors.slice(0, 20).map((e) => (
                <li key={e.message} className="rounded-xl border border-line">
                  <button type="button" onClick={() => setOpen(open === e.message ? null : e.message)} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left">
                    <CircleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-mono text-[12.5px] leading-snug">{e.message}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                        <Badge tone="bad">{e.n24}× in 24h</Badge>
                        <Delta pct={change(e.n24, e.nprev)} invert />
                        <Badge>{e.people} students</Badge>
                        <span>{ago(e.last_at)}</span>
                      </span>
                    </span>
                  </button>
                  {open === e.message && (
                    <div className="border-t border-line px-3.5 py-2.5 font-mono text-[12px] text-muted">
                      <p>total 7d: {e.n} · from {e.source || "app"}</p>
                      <p>first seen: {ago(e.first_at)}</p>
                      <p>versions: {e.versions.filter(Boolean).join(", ") || e.version || "—"}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* push health */}
        {h.data && (
          <Card title="Push notifications" sub="Phones registered to receive notifications">
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="Phones" value={fmt(h.data.tokens.total)} sub={`${fmt(h.data.tokens.people)} students`} />
              <Stat label="Instant (data)" value={fmt(h.data.tokens.instant)} sub="deliver even in foreground" tone="good" />
              <Stat label="Stale 30d+" value={fmt(h.data.tokens.stale_30d)} tone={h.data.tokens.stale_30d > 0 ? "warn" : undefined} sub="not refreshed lately" />
              <Stat label="Errors by version" value={`${h.data.by_version.length}`} sub="builds with crashes" />
            </div>
          </Card>
        )}

        {/* errors by version */}
        {h.data && h.data.by_version.length > 0 && (
          <Card title="Which versions crash" sub="Errors in the last 7 days, by app version">
            <BarList color="var(--danger)" items={h.data.by_version.map((v) => ({ label: v.version, value: v.n, hint: `${v.people} students` }))} />
          </Card>
        )}
      </div>

      <Card title="Usernames = enrollment numbers" sub="Confirmed from each student's own MyCamu sign-in" action={<RefreshButton loading={ids.loading} onClick={() => void ids.reload()} />}>
        {ids.error ? (
          <p className="text-[13.5px] text-muted">{/assert_admin|does not exist|function/i.test(ids.error) ? "Run migration 0030_identity.sql to turn this on." : ids.error}</p>
        ) : !ids.data ? (
          <Loading />
        ) : (
          <div className="space-y-3">
            <p className="text-[14px]">
              <b className="text-[20px] tabular-nums">{ids.data.verified}</b> of {ids.data.users} accounts confirmed
              {ids.data.unverified_named > 0 && <span className="text-muted"> · {ids.data.unverified_named} renamed “unverified-…”</span>}
            </p>
            {ids.data.events.length > 0 && (
              <ul className="space-y-1.5" aria-label="Username changes">
                {ids.data.events.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-[12.5px]">
                    <Badge tone={e.kind === "conflict" ? "bad" : e.kind === "renamed_holder" ? "warn" : "plain"}>
                      {e.kind === "conflict" ? "Dispute" : e.kind === "renamed_holder" ? "Taken back" : "Second account"}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <b>{e.enrollment}</b>
                      {e.kind === "renamed_holder"
                        ? ` went to its owner; the other account is now ${String(e.detail?.new_username ?? "unverified")}`
                        : e.kind === "conflict"
                          ? ` — confirmed by one MyCamu, claimed by another (${e.username ?? "new sign-up"})`
                          : ` — a second DockIn account tried to link the same MyCamu`}
                      <span className="text-muted"> · {ago(e.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="APK downloads" sub="GitHub counts each build separately" action={<RefreshButton loading={gh.loading} onClick={() => void gh.reload()} />}>
          {gh.error ? (
            <p className="text-[13px] text-muted">{gh.error}</p>
          ) : !gh.data ? (
            <Loading />
          ) : (
            <ul className="space-y-2">
              {gh.data.releases.map((r) => (
                <li key={r.tag} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
                  <Download size={17} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{r.name}</span>
                    <span className="block text-[11.5px] text-muted">built {ago(r.published)}</span>
                  </span>
                  <b className="text-[18px] tabular-nums">{r.downloads}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {o.data && (
            <Card title="Versions in use" sub="Students active in the last 30 days" action={<Smartphone size={16} className="text-muted" />}>
              <BarList items={o.data.versions.map((v) => ({ label: v.v, value: v.n }))} total={o.data.versions.reduce((a, v) => a + v.n, 0)} />
            </Card>
          )}
          <Card title="Share links" sub="Taps on these are counted">
            {[
              ["DockIn (everyone)", `${SITE}/download`],
              ["Preview (testers)", `${SITE}/download?ch=preview`],
              ["Website", SITE],
            ].map(([label, url]) => (
              <div key={url} className="mb-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2 last:mb-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold">{label}</span>
                  <span className="block truncate font-mono text-[11.5px] text-muted">{url}</span>
                </span>
                <button type="button" onClick={() => copy(url)} aria-label="Copy link" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface">
                  <Copy size={15} />
                </button>
                <a href={url} target="_blank" rel="noreferrer" aria-label="Open" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface">
                  <ExternalLink size={15} />
                </a>
              </div>
            ))}
            {o.data && (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-line px-3.5 py-2.5">
                <Link2 size={17} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 text-[13px] font-bold">/download link taps (7d)</span>
                <b className="text-[17px] tabular-nums">{fmt(o.data.downloads_7d)}</b>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Check({ icon, label, ok, warn, text }: { icon: React.ReactNode; label: string; ok?: boolean; warn?: boolean; text: string }) {
  const tone = ok === undefined ? "text-muted" : ok ? "text-safe" : warn ? "text-warn" : "text-danger";
  return (
    <div className="adm-card flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-muted">{label}</span>
        <span className={`block truncate text-[14px] font-bold ${tone}`}>{text}</span>
      </span>
    </div>
  );
}
