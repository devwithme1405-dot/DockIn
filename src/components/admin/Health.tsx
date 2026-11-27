"use client";

import { useState } from "react";
import { Bot, Bug, CheckCircle2, CircleAlert, Copy, Database, Download, ExternalLink, Link2 } from "lucide-react";
import { ago, errors, github, identitySummary, overview, serverHealth } from "@/lib/adminApi";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "../ui";
import { BarList } from "./charts";
import { Badge, Card, Empty, Loading, RefreshButton, useLoad } from "./parts";

const SITE = "https://dock-in.vercel.app";

/** Is everything working: errors students hit, versions out there, downloads, and the services DockIn needs. */
export function HealthSection() {
  const toast = useToast();
  const errs = useLoad(errors);
  const gh = useLoad(github);
  const o = useLoad(overview);
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

  const copy = (s: string) => {
    void navigator.clipboard?.writeText(s).then(() => toast.show("Link copied"));
  };

  return (
    <div className="space-y-4">
      <Card
        title="Setup checks"
        sub="Everything notifications and these numbers need — with the exact reason when something isn't right"
        action={<RefreshButton loading={setup.loading} onClick={() => void setup.reload()} />}
      >
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

      <Card
        title="Usernames = enrollment numbers"
        sub="Confirmed from each student's own MyCamu sign-in"
        action={<RefreshButton loading={ids.loading} onClick={() => void ids.reload()} />}
      >
        {ids.error ? (
          <p className="text-[13.5px] text-muted">{/assert_admin|does not exist|function/i.test(ids.error) ? "Run migration 0030_identity.sql to turn this on." : ids.error}</p>
        ) : !ids.data ? (
          <Loading />
        ) : (
          <div className="space-y-3">
            <p className="text-[14px]">
              <b className="text-[20px] tabular-nums">{ids.data.verified}</b> of {ids.data.users} accounts confirmed
              {ids.data.unverified_named > 0 && <span className="text-muted"> · {ids.data.unverified_named} renamed “unverified-…” (were on someone else&apos;s enrollment)</span>}
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
                        ? ` went to its owner; the account that had it is now ${String(e.detail?.new_username ?? "unverified")}`
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Check
          icon={<Database size={17} />}
          label="Database"
          ok={checks.data?.db}
          text={checks.data ? (checks.data.db ? `Answering · ${checks.data.ms} ms` : "Not reachable") : "Checking…"}
        />
        <Check icon={<Bot size={17} />} label="DockBot AI" ok={checks.data ? checks.data.ai === "ready" : undefined} warn={checks.data?.ai === "not set"} text={checks.data ? (checks.data.ai === "ready" ? "Connected" : checks.data.ai === "not set" ? "Demo mode (no API key yet)" : "Unknown") : "Checking…"} />
        <Check icon={<Bug size={17} />} label="App errors (24 h)" ok={o.data ? o.data.errors_24h === 0 : undefined} warn={!!o.data?.errors_24h} text={o.data ? `${o.data.errors_24h} reported` : "Checking…"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What broke" sub="Errors students' apps ran into, last 7 days" action={<RefreshButton loading={errs.loading} onClick={() => void errs.reload()} />}>
          {!errs.data ? (
            <Loading />
          ) : errs.data.length === 0 ? (
            <Empty icon={<CheckCircle2 />} title="No errors this week" />
          ) : (
            <ul className="space-y-2">
              {errs.data.map((e) => (
                <li key={e.message} className="rounded-xl border border-line">
                  <button type="button" onClick={() => setOpen(open === e.message ? null : e.message)} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left">
                    <CircleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-mono text-[12.5px] leading-snug">{e.message}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5 text-[11.5px] text-muted">
                        <Badge tone="bad">{e.n}×</Badge>
                        <Badge>{e.people} people</Badge>
                        <span>{ago(e.last_at)}</span>
                      </span>
                    </span>
                  </button>
                  {open === e.message && (
                    <div className="border-t border-line px-3.5 py-2.5 font-mono text-[12px] text-muted">
                      <p>where: {e.source || "—"}</p>
                      <p>version: {e.version || "—"}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="APK downloads" sub="GitHub counts each build separately" action={<RefreshButton loading={gh.loading} onClick={() => void gh.reload()} />}>
            {!gh.data ? (
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
                {o.data && (
                  <li className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3.5 py-2.5">
                    <Link2 size={17} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 text-[13.5px] font-bold">Via the /download link (all time)</span>
                    <b className="text-[18px] tabular-nums">{o.data.downloads}</b>
                  </li>
                )}
              </ul>
            )}
          </Card>

          <Card title="Share links" sub="Taps on these are counted">
            {[
              ["DockIn (everyone)", `${SITE}/download`],
              ["DockIn 3 preview (testers)", `${SITE}/download?ch=preview`],
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
          </Card>

          {o.data && (
            <Card title="Versions in use" sub="Students active in the last 30 days">
              <BarList items={o.data.versions.map((v) => ({ label: v.v, value: v.n }))} total={o.data.versions.reduce((a, v) => a + v.n, 0)} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Check({ icon, label, ok, warn, text }: { icon: React.ReactNode; label: string; ok?: boolean; warn?: boolean; text: string }) {
  const tone = ok === undefined ? "text-muted" : ok ? "text-safe" : warn ? "text-warn" : "text-danger";
  return (
    <div className="adm-card flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5">
      <span className={`grid size-10 place-items-center rounded-xl bg-surface-2 ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-muted">{label}</span>
        <span className={`block truncate text-[14px] font-bold ${tone}`}>{text}</span>
      </span>
    </div>
  );
}
