"use client";

import { useState } from "react";
import { Check, Flag, MessageSquareX, ShieldAlert, ShieldCheck } from "lucide-react";
import { ago, ban, reports, resolveReport, type Report } from "@/lib/adminApi";
import { cx, useToast } from "../ui";
import { Badge, Empty, Failed, Loading, Pills, RefreshButton, useLoad } from "./parts";

const TABS = [
  ["open", "Open"],
  ["actioned", "Actioned"],
  ["dismissed", "Dismissed"],
  ["all", "All"],
] as const;

/** Reports from students ("Report" on a chat message): review, remove, suspend, or dismiss. */
export function ReportsSection({ onOpenUser, onChanged }: { onOpenUser: (id: string) => void; onChanged: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("open");
  const list = useLoad(() => reports(tab), [tab]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Pills value={tab} onChange={setTab} options={TABS} />
        <RefreshButton loading={list.loading} onClick={() => void list.reload()} />
      </div>
      {list.error && !list.data ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <Empty icon={<ShieldCheck />} title={tab === "open" ? "No open reports" : "Nothing here"} sub={tab === "open" ? "When a student reports a message, it shows up here." : undefined} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.map((r) => (
            <ReportCard
              key={r.id}
              r={r}
              onOpenUser={onOpenUser}
              onDone={() => {
                void list.reload();
                onChanged();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ r, onOpenUser, onDone }: { r: Report; onOpenUser: (id: string) => void; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(7);
  const [banOpen, setBanOpen] = useState(false);
  const open = r.status === "open";

  async function act(what: "dismiss" | "delete_message" | "ban") {
    setBusy(what);
    try {
      if (what === "ban") {
        await ban(r.target, r.reason, days);
        await resolveReport(r.id, "actioned");
        toast.show(`${r.target_name} suspended`);
      } else {
        await resolveReport(r.id, what);
        toast.show(what === "dismiss" ? "Dismissed" : "Message removed for everyone");
      }
      onDone();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="adm-card rounded-2xl border border-line bg-card p-4">
      <header className="flex items-start gap-3">
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", open ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
          <Flag size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold">{r.reason}</p>
          <p className="text-[12.5px] text-muted">
            {ago(r.created_at)} · by {r.reporter_name || "a student"}
          </p>
        </div>
        <Badge tone={open ? "warn" : r.status === "actioned" ? "good" : "plain"}>{r.status}</Badge>
      </header>

      {r.excerpt && (
        <blockquote className="mt-3 rounded-xl border-l-4 border-accent bg-surface px-3.5 py-2.5 text-[14px] leading-snug whitespace-pre-wrap">{r.excerpt}</blockquote>
      )}

      <button type="button" onClick={() => onOpenUser(r.target)} className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-left text-[13px] hover:bg-surface">
        <span className="min-w-0 truncate">
          Sent by <b>{r.target_name}</b> <span className="text-muted">@{r.target_username}</span>
        </span>
        <span className="flex shrink-0 gap-1">
          {r.target_reports > 1 && <Badge tone="warn">{r.target_reports} reports</Badge>}
          {r.target_banned && <Badge tone="bad">Suspended</Badge>}
        </span>
      </button>

      {open && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" disabled={!!busy} onClick={() => void act("dismiss")} className="btn-paper inline-flex h-10 items-center justify-center gap-1 rounded-xl text-[12.5px] font-bold">
              <Check size={14} /> Dismiss
            </button>
            <button type="button" disabled={!!busy || !r.message_id} onClick={() => void act("delete_message")} className="btn-paper inline-flex h-10 items-center justify-center gap-1 rounded-xl text-[12.5px] font-bold text-danger disabled:opacity-40">
              <MessageSquareX size={14} /> Remove
            </button>
            <button type="button" disabled={!!busy || r.target_banned} onClick={() => setBanOpen((b) => !b)} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-danger text-[12.5px] font-bold text-white disabled:opacity-40">
              <ShieldAlert size={14} /> Suspend
            </button>
          </div>
          {banOpen && (
            <div className="anim-fade mt-3 flex flex-wrap items-center gap-1.5">
              {([1, 7, 30, null] as const).map((n) => (
                <button key={String(n)} type="button" onClick={() => setDays(n)} className={cx("h-8 rounded-full border px-3 text-[12.5px] font-semibold", days === n ? "border-transparent bg-danger text-white" : "border-line text-muted")}>
                  {n === null ? "Until lifted" : `${n}d`}
                </button>
              ))}
              <button type="button" disabled={!!busy} onClick={() => void act("ban")} className="ml-auto h-8 rounded-full bg-danger px-3.5 text-[12.5px] font-bold text-white">
                Confirm
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
