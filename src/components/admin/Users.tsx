"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, ChevronRight, Flag, Search, ShieldAlert, ShieldCheck, Smartphone, UserRound, X } from "lucide-react";
import { useBackClose } from "@/lib/backClose";
import { ago, ban, stillBanned, unban, userDetail, users, within, type AdminUser, type UserDetail } from "@/lib/adminApi";
import { Avatar, cx, useToast } from "../ui";
import { Badge, Empty, Failed, Loading, Pills, RefreshButton, useLoad } from "./parts";

const FILTERS = [
  ["all", "Everyone"],
  ["active", "Active 7d"],
  ["inactive", "Inactive 7d+"],
  ["new", "New this week"],
  ["no_camu", "No Camu"],
  ["no_push", "No notifications"],
  ["android", "Android"],
  ["web", "Website"],
  ["reported", "Reported"],
  ["banned", "Suspended"],
] as const;
type Filter = (typeof FILTERS)[number][0];

const PAGE = 40;

export function UsersSection({ initialFilter, openUser, onNotify }: { initialFilter?: string; openUser?: string; onNotify: (u: { id: string; name: string }) => void }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>((FILTERS.find((f) => f[0] === initialFilter)?.[0] ?? "all") as Filter);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(openUser ?? null);
  const list = useLoad(() => users(query, filter, limit, 0), [query, filter, limit]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setLimit(PAGE);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const rows = list.data?.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="field flex h-11 flex-1 items-center gap-2 px-3.5">
          <Search size={17} className="shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username or friend code" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear" className="text-muted">
              <X size={16} />
            </button>
          )}
        </label>
        <RefreshButton loading={list.loading} onClick={() => void list.reload()} />
      </div>
      <Pills
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setLimit(PAGE);
        }}
        options={FILTERS}
      />
      <p className="text-[12.5px] text-muted">{list.data ? `${list.data.total} ${list.data.total === 1 ? "student" : "students"}` : " "}</p>

      {list.error && !list.data ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty icon={<UserRound />} title="Nobody here" sub="Try another filter or search." />
      ) : (
        <div className="adm-card overflow-hidden rounded-2xl border border-line bg-card">
          {/* desktop table */}
          <table className="hidden w-full text-left text-[13.5px] md:table">
            <thead className="border-b border-line bg-surface text-[12px] text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Student</th>
                <th className="px-3 py-2.5 font-semibold">Last seen</th>
                <th className="px-3 py-2.5 font-semibold">App</th>
                <th className="px-3 py-2.5 font-semibold">Setup</th>
                <th className="px-3 py-2.5 font-semibold">Joined</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} onClick={() => setOpen(u.id)} className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-surface">
                  <td className="px-4 py-2.5">
                    <Who u={u} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Seen iso={u.last_seen} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">{u.platform ? `${u.platform === "android" ? "Android" : "Web"} · ${u.app_version ?? "?"}` : "—"}</td>
                  <td className="px-3 py-2.5">
                    <SetupDots u={u} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">{ago(u.created_at)}</td>
                  <td className="pr-3">
                    <ChevronRight size={16} className="text-muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* phone list */}
          <ul className="divide-y divide-line/70 md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => setOpen(u.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface">
                  <Who u={u} />
                  <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
                    <Seen iso={u.last_seen} />
                    <SetupDots u={u} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {list.data && rows.length < list.data.total && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="btn-paper h-10 w-full rounded-xl text-[13.5px] font-bold">
          Show more
        </button>
      )}
      <UserDrawer
        id={open}
        onClose={() => setOpen(null)}
        onChanged={() => void list.reload()}
        onNotify={(u) => {
          setOpen(null);
          onNotify(u);
        }}
      />
    </div>
  );
}

function Who({ u }: { u: AdminUser }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={u.name || u.username} avatar={u.avatar ?? undefined} size={36} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{u.name || u.username}</span>
          {u.banned && <Badge tone="bad">Suspended</Badge>}
          {u.reports > 0 && !u.banned && (
            <Badge tone="warn">
              <Flag size={10} /> {u.reports}
            </Badge>
          )}
        </span>
        <span className="block truncate text-[12px] text-muted">
          @{u.username}
          {u.branch ? ` · ${u.branch}` : ""}
          {u.year ? ` · Y${u.year}` : ""}
        </span>
      </span>
    </span>
  );
}

function Seen({ iso }: { iso: string | null }) {
  const fresh = within(iso, 5);
  const old = !within(iso, 7 * 24 * 60);
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", old ? "text-muted" : "")}>
      <span className={cx("size-2 rounded-full", fresh ? "bg-safe" : old ? "bg-line" : "bg-warn")} />
      {fresh ? "Online" : ago(iso)}
    </span>
  );
}

/** Camu · Notifications · LMS as three small dots. */
function SetupDots({ u }: { u: Pick<AdminUser, "camu" | "push" | "lms"> }) {
  const dot = (on: boolean | null, label: string) => (
    <span title={`${label}: ${on ? "yes" : "no"}`} className={cx("rounded-md px-1.5 py-0.5 text-[10.5px] font-bold", on ? "bg-safe-soft text-safe" : "bg-surface-2 text-muted line-through")}>
      {label}
    </span>
  );
  return (
    <span className="inline-flex gap-1">
      {dot(u.camu, "Camu")}
      {dot(u.push, "Push")}
      {dot(u.lms, "LMS")}
    </span>
  );
}

// ------------------------------------------------------------------ one student

function UserDrawer({ id, onClose, onChanged, onNotify }: { id: string | null; onClose: () => void; onChanged: () => void; onNotify: (u: { id: string; name: string }) => void }) {
  useBackClose(!!id, onClose);
  useEffect(() => {
    if (!id) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [id, onClose]);
  if (!id || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Student">
      <div className="anim-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="adm-drawer absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-[var(--bg)] shadow-2xl">
        <DrawerBody key={id} id={id} onClose={onClose} onChanged={onChanged} onNotify={onNotify} />
      </aside>
    </div>,
    document.body,
  );
}

function DrawerBody({ id, onClose, onChanged, onNotify }: { id: string; onClose: () => void; onChanged: () => void; onNotify: (u: { id: string; name: string }) => void }) {
  const toast = useToast();
  const d = useLoad(() => userDetail(id), [id]);
  const [banning, setBanning] = useState(false);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<number | null>(7);
  const [busy, setBusy] = useState(false);
  const u = d.data as UserDetail | null;
  const name = u?.profile?.name || u?.user?.username || "Student";
  const active = !!u?.ban && stillBanned(u.ban.until);

  async function doBan() {
    setBusy(true);
    try {
      await ban(id, reason, days);
      toast.show(`${name} suspended`);
      setBanning(false);
      await d.reload();
      onChanged();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doUnban() {
    setBusy(true);
    try {
      await unban(id);
      toast.show(`${name} can use DockIn again`);
      await d.reload();
      onChanged();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-card px-4 pt-[calc(var(--sat,0px)+0.75rem)] pb-3">
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-muted">
          <X size={20} />
        </button>
        <p className="font-display flex-1 truncate text-[17px] font-extrabold">{name}</p>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-[calc(1.5rem+var(--sab))]">
        {!u ? (
          d.error ? <Failed error={d.error} retry={d.reload} /> : <Loading />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <Avatar name={name} avatar={u.profile?.avatar ?? undefined} size={60} />
              <div className="min-w-0">
                <p className="truncate text-[18px] font-extrabold">{name}</p>
                <p className="truncate text-[13px] text-muted">
                  @{u.user?.username}
                  {u.profile?.code ? ` · ${u.profile.code}` : ""}
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {u.profile?.branch && <Badge>{u.profile.branch}</Badge>}
                  {u.profile?.year && <Badge>Year {u.profile.year}</Badge>}
                  {u.profile?.section && <Badge>{u.profile.section}</Badge>}
                  {active && <Badge tone="bad">Suspended</Badge>}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat label="Last seen" value={ago(u.seen?.last_seen)} />
              <Stat label="Opens" value={String(u.seen?.opens ?? 0)} />
              <Stat label="Joined" value={ago(u.user?.created_at)} />
              <Stat label="Messages" value={`${u.messages}`} sub={`${u.messages_7d} this week`} />
              <Stat label="Friends" value={`${u.friends}`} sub={`${u.groups} groups`} />
              <Stat label="Errors 7d" value={`${u.errors}`} />
            </div>

            <Section title="Active days (last 5 weeks)">
              <Heat days={u.days} />
            </Section>

            <Section title="Setup">
              <ul className="space-y-1.5 text-[13.5px]">
                <Check2 on={u.seen?.platform === "android"} label={u.seen?.platform ? `${u.seen.platform === "android" ? "Android app" : "Website"} · ${u.seen.app_version ?? "?"}${u.seen.channel === "preview" ? " (DockIn 3 preview)" : ""}` : "Hasn't opened since tracking began"} />
                <Check2 on={!!u.seen?.camu} label="Camu connected" />
                <Check2 on={u.seen?.notifications === "granted"} label={`Notifications ${u.seen?.notifications ?? "unknown"}`} />
                <Check2 on={u.phones.length > 0} label={u.phones.length ? `${u.phones.length} phone(s) can get pushes${u.phones.some((p) => p.caps?.includes("data1")) ? " · instant ✓✓" : ""}` : "No phone registered for pushes"} />
                <Check2 on={!!u.seen?.lms} label="LMS connected" />
              </ul>
            </Section>

            {u.reports.length > 0 && (
              <Section title={`Reported ${u.reports.length} time${u.reports.length === 1 ? "" : "s"}`}>
                <ul className="space-y-2">
                  {u.reports.map((r) => (
                    <li key={r.id} className="rounded-xl border border-line bg-card p-3 text-[13px]">
                      <p className="flex items-center justify-between gap-2">
                        <b>{r.reason}</b>
                        <Badge tone={r.status === "open" ? "warn" : "plain"}>{r.status}</Badge>
                      </p>
                      {r.excerpt && <p className="mt-1 line-clamp-3 text-muted">“{r.excerpt}”</p>}
                      <p className="mt-1 text-[11.5px] text-muted">{ago(r.created_at)}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {active && u.ban && (
              <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-[13.5px]">
                <p className="flex items-center gap-2 font-bold text-danger">
                  <ShieldAlert size={17} /> Suspended {u.ban.until ? `until ${new Date(u.ban.until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "until you lift it"}
                </p>
                {u.ban.reason && <p className="mt-1">{u.ban.reason}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onNotify({ id, name })} className="btn-paper inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-bold">
                <Bell size={16} /> Send notification
              </button>
              {active ? (
                <button type="button" disabled={busy} onClick={() => void doUnban()} className="btn-leather inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px]">
                  <ShieldCheck size={16} /> Lift suspension
                </button>
              ) : (
                <button type="button" onClick={() => setBanning((b) => !b)} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-danger text-[13.5px] font-bold text-white">
                  <ShieldAlert size={16} /> Suspend
                </button>
              )}
            </div>

            {banning && !active && (
              <div className="anim-fade space-y-3 rounded-2xl border border-danger/30 bg-card p-4">
                <p className="text-[14px] font-bold">Suspend {name}</p>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="Reason (they will see this)" className="field w-full resize-none px-3 py-2 text-[14px]" />
                <div className="flex flex-wrap gap-1.5">
                  {([1, 7, 30, null] as const).map((n) => (
                    <button key={String(n)} type="button" onClick={() => setDays(n)} className={cx("h-8 rounded-full border px-3 text-[12.5px] font-semibold", days === n ? "border-transparent bg-danger text-white" : "border-line text-muted")}>
                      {n === null ? "Until I lift it" : `${n} day${n === 1 ? "" : "s"}`}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-muted">They can still open DockIn and read, but can&apos;t sign in again or post, message or join anything until it ends.</p>
                <button type="button" disabled={busy} onClick={() => void doBan()} className="h-11 w-full rounded-xl bg-danger text-[14px] font-bold text-white disabled:opacity-50">
                  Suspend now
                </button>
              </div>
            )}
            <p className="text-[11.5px] leading-snug text-muted">
              DockIn Admin never shows a student&apos;s attendance, chats or files — only how they use the app, and messages someone reported.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2.5">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="truncate text-[15px] font-bold">{value}</p>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[12px] font-bold tracking-[0.06em] text-muted uppercase">{title}</p>
      {children}
    </section>
  );
}

function Check2({ on, label }: { on: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cx("grid size-5 place-items-center rounded-full", on ? "bg-safe-soft text-safe" : "bg-surface-2 text-muted")}>{on ? <Check size={12} /> : <X size={12} />}</span>
      <span className={on ? "" : "text-muted"}>{label}</span>
    </li>
  );
}

/** 35 days as little squares, darker on days DockIn was opened. */
function Heat({ days }: { days: string[] }) {
  const set = new Set(days);
  const today = new Date();
  const cells = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (34 - i));
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { k, on: set.has(k) };
  });
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c) => (
          <span key={c.k} title={c.k} className={cx("aspect-square rounded-[5px]", c.on ? "bg-accent" : "bg-surface-2")} />
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
        <Smartphone size={12} /> {days.length} of the last 35 days
      </p>
    </div>
  );
}
