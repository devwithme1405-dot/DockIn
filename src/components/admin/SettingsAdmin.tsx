"use client";

import { useState } from "react";
import { History, Megaphone, PartyPopper, ShieldCheck, TriangleAlert, UserPlus, X } from "lucide-react";
import { ago, announcement, auditLog, setAnnouncement, setMember, team } from "@/lib/adminApi";
import { cx, useToast } from "../ui";
import { Badge, Card, Empty, Loading, RefreshButton, useLoad } from "./parts";

const TONES = [
  ["info", "News", Megaphone],
  ["warn", "Heads-up", TriangleAlert],
  ["good", "Good news", PartyPopper],
] as const;

/** The in-app announcement, the admin team, and who did what. */
export function SettingsSection({ owner }: { owner: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <AnnouncementCard owner={owner} />
        <TeamCard owner={owner} />
      </div>
      <AuditCard />
    </div>
  );
}

function AnnouncementCard({ owner }: { owner: boolean }) {
  const toast = useToast();
  const cur = useLoad(announcement);
  const [text, setText] = useState<string | null>(null);
  const [tone, setTone] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = text ?? cur.data?.text ?? "";
  const tn = tone ?? cur.data?.tone ?? "info";
  const ln = link ?? cur.data?.link ?? "";
  const live = !!cur.data?.text;

  async function save(clear = false) {
    setBusy(true);
    try {
      await setAnnouncement(clear ? {} : { id: `a${Date.now()}`, text: t.trim(), tone: tn, ...(ln.trim() ? { link: ln.trim() } : {}) });
      toast.show(clear ? "Announcement removed" : "Announcement is live");
      setText(null);
      setTone(null);
      setLink(null);
      await cur.reload();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Announcement banner" sub="Shows at the top of Today for everyone until they close it" action={live ? <Badge tone="good">Live</Badge> : <Badge>Off</Badge>}>
      {!cur.data && cur.loading ? (
        <Loading />
      ) : (
        <>
          <textarea value={t} onChange={(e) => setText(e.target.value.slice(0, 200))} rows={2} disabled={!owner} placeholder="e.g. Mid-sem timetable is in — check Timetable 📅" className="field w-full resize-none px-3.5 py-2.5 text-[15px]" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TONES.map(([k, label, Icon]) => (
              <button key={k} type="button" disabled={!owner} onClick={() => setTone(k)} className={cx("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold", tn === k ? "border-transparent bg-[var(--ink)] text-[var(--on-ink)]" : "border-line text-muted")}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <input value={ln} onChange={(e) => setLink(e.target.value)} disabled={!owner} placeholder="Link (optional) https://…" className="field mt-2 h-10 w-full px-3 text-[14px]" />
          {owner ? (
            <div className="mt-3 flex gap-2">
              {live && (
                <button type="button" disabled={busy} onClick={() => void save(true)} className="btn-paper inline-flex h-10 items-center gap-1 rounded-xl px-3 text-[13px] font-bold">
                  <X size={14} /> Take down
                </button>
              )}
              <button type="button" disabled={busy || !t.trim()} onClick={() => void save()} className="btn-leather h-10 flex-1 rounded-xl text-[13.5px] disabled:opacity-50">
                {live ? "Update & show again" : "Publish"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-muted">Only the owner can change this.</p>
          )}
        </>
      )}
    </Card>
  );
}

function TeamCard({ owner }: { owner: boolean }) {
  const toast = useToast();
  const list = useLoad(team);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function set(u: string, role: "owner" | "moderator" | "none") {
    setBusy(true);
    try {
      await setMember(u, role);
      toast.show(role === "none" ? `${u} removed` : `${u} is now ${role}`);
      setName("");
      await list.reload();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Admin team" sub="Moderators can review reports, suspend students and send targeted notifications">
      {!list.data ? (
        <Loading />
      ) : (
        <ul className="space-y-2">
          {list.data.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
              <ShieldCheck size={17} className={m.role === "owner" ? "text-accent" : "text-muted"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold">{m.name || m.username}</span>
                <span className="block text-[11.5px] text-muted">
                  @{m.username} · added {ago(m.added_at)}
                </span>
              </span>
              <Badge tone={m.role === "owner" ? "accent" : "plain"}>{m.role}</Badge>
              {owner && m.role !== "owner" && (
                <button type="button" disabled={busy} onClick={() => void set(m.username, "none")} aria-label={`Remove ${m.username}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface">
                  <X size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {owner && (
        <div className="mt-3 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value.trim())} placeholder="DockIn username" className="field h-10 min-w-0 flex-1 px-3 text-[14px]" />
          <button type="button" disabled={busy || !name} onClick={() => void set(name, "moderator")} className="btn-leather inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] disabled:opacity-50">
            <UserPlus size={15} /> Add moderator
          </button>
        </div>
      )}
    </Card>
  );
}

const ACTIONS: Record<string, string> = {
  notify: "Sent a notification",
  ban: "Suspended a student",
  unban: "Lifted a suspension",
  "announcement.set": "Changed the announcement",
  "report.dismiss": "Dismissed a report",
  "report.delete_message": "Removed a reported message",
  "report.actioned": "Acted on a report",
  "team.moderator": "Added a moderator",
  "team.owner": "Made someone owner",
  "team.none": "Removed an admin",
};

function AuditCard() {
  const log = useLoad(auditLog);
  return (
    <Card title="Activity log" sub="Every admin action, newest first" action={<RefreshButton loading={log.loading} onClick={() => void log.reload()} />}>
      {!log.data ? (
        <Loading />
      ) : log.data.length === 0 ? (
        <Empty icon={<History />} title="Nothing yet" />
      ) : (
        <ol className="relative space-y-3 border-l-2 border-line pl-4">
          {log.data.map((a, i) => (
            <li key={i} className="relative">
              <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-accent ring-4 ring-[var(--card)]" />
              <p className="text-[13.5px] font-semibold">{ACTIONS[a.action] ?? a.action}</p>
              <p className="text-[12px] text-muted">
                {a.admin_name} · {ago(a.at)}
                {a.action === "notify" && typeof a.detail === "object" && a.detail ? ` · “${(a.detail as { title?: string }).title ?? ""}” to ${(a.detail as { people?: number }).people ?? 0}` : ""}
                {a.action === "ban" && typeof a.detail === "object" && a.detail ? ` · ${(a.detail as { reason?: string }).reason ?? ""}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
