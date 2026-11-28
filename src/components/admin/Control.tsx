"use client";

import { useState } from "react";
import { DoorOpen, FileUp, History, Megaphone, Mic, PartyPopper, Power, ShieldCheck, Stamp, TriangleAlert, UserPlus, X } from "lucide-react";
import { ago, announcement, auditLog, flags, setAnnouncement, setFlags, setMember, team, type FlagName, type Flags } from "@/lib/adminApi";
import { cx, useToast } from "../ui";
import { Badge, Card, Empty, Loading, RefreshButton, Toggle, useConfirm, useLoad } from "./parts";

/** Kill-switches, the announcement banner, the admin team, and the activity log. */
export function Control({ owner }: { owner: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <FlagsCard owner={owner} />
        <AnnouncementCard owner={owner} />
        <TeamCard owner={owner} />
      </div>
      <AuditCard />
    </div>
  );
}

const FLAG_META: { key: FlagName; label: string; sub: string; icon: typeof DoorOpen }[] = [
  { key: "outpass", label: "Outpass in DockIn", sub: "Make & send passes from the app. Off → students use MyCamu directly.", icon: DoorOpen },
  { key: "self_approval", label: "Parents approval login", sub: "Approve your own pass from DockIn. Off → the button hides.", icon: Stamp },
  { key: "lms_submit", label: "LMS hand-in", sub: "Submit assignments from DockIn. Off → save & upload on the LMS.", icon: FileUp },
  { key: "voice", label: "Voice outpass", sub: "Make a pass by speaking. Off → the mic hides.", icon: Mic },
];

function FlagsCard({ owner }: { owner: boolean }) {
  const toast = useToast();
  const { confirm, node } = useConfirm();
  const cur = useLoad(flags);
  const [busy, setBusy] = useState<FlagName | null>(null);

  async function toggle(f: FlagName, to: boolean) {
    if (!cur.data) return;
    if (!to && !(await confirm(`Turn off ${FLAG_META.find((m) => m.key === f)!.label}?`, "Every student loses this feature until you turn it back on. Use it while something is broken.", "Turn off"))) return;
    setBusy(f);
    const next: Flags = { ...cur.data, [f]: to };
    cur.setData(next);
    try {
      await setFlags(next);
      toast.show(`${FLAG_META.find((m) => m.key === f)!.label} ${to ? "on" : "off"} for everyone`);
    } catch (e) {
      cur.setData({ ...cur.data });
      await cur.reload();
      toast.show((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const anyOff = cur.data && FLAG_META.some((m) => !cur.data![m.key]);
  return (
    <Card title="Feature switches" sub="Turn a feature off for everyone the moment it misbehaves — no app update needed" action={anyOff ? <Badge tone="warn">Something is off</Badge> : <Badge tone="good">All on</Badge>}>
      {node}
      {!cur.data ? (
        <Loading />
      ) : (
        <ul className="space-y-2">
          {FLAG_META.map((m) => {
            const on = cur.data![m.key];
            return (
              <li key={m.key} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
                <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", on ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>
                  <m.icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold">{m.label}</span>
                  <span className="block text-[11.5px] leading-tight text-muted">{m.sub}</span>
                </span>
                <Toggle on={on} disabled={!owner || busy === m.key} onChange={(v) => void toggle(m.key, v)} label={m.label} />
              </li>
            );
          })}
        </ul>
      )}
      {!owner && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted"><Power size={12} /> Only the owner can flip these.</p>}
    </Card>
  );
}

const TONES = [
  ["info", "News", Megaphone],
  ["warn", "Heads-up", TriangleAlert],
  ["good", "Good news", PartyPopper],
] as const;

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
  "flags.set": "Changed feature switches",
  "report.dismiss": "Dismissed a report",
  "report.delete_message": "Removed a reported message",
  "report.actioned": "Acted on a report",
  "team.moderator": "Added a moderator",
  "team.owner": "Made someone owner",
  "team.none": "Removed an admin",
  "user.signout": "Signed a student out",
  "identity.reset": "Reset a MyCamu link",
  "export.users": "Exported the student list",
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
