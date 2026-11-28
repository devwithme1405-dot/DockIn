"use client";

import { AlertCircle, Bell, DoorOpen, Flag, LogIn, Smartphone, Sparkles, UserPlus, type LucideIcon } from "lucide-react";
import { ago, clock, eventLabel, live, type FeedItem, type FeedKind } from "@/lib/adminApi";
import { Avatar } from "../ui";
import { Empty, Failed, Freshness, LiveDot, Skeleton, useAuto, useLoad, useTick } from "./parts";

const KIND: Record<FeedKind, { icon: LucideIcon; tone: string; verb: (f: FeedItem) => string }> = {
  signup: { icon: UserPlus, tone: "text-safe bg-safe-soft", verb: () => "signed up" },
  open: { icon: Smartphone, tone: "text-accent bg-accent-soft", verb: (f) => `opened DockIn${f.detail?.version ? ` · ${f.detail.version}` : ""}` },
  event: { icon: Sparkles, tone: "text-accent bg-accent-soft", verb: (f) => eventLabel(String(f.title)) + okTail(f) },
  error: { icon: AlertCircle, tone: "text-danger bg-danger-soft", verb: (f) => `hit an error: ${f.title}` },
  report: { icon: Flag, tone: "text-warn bg-warn-soft", verb: () => "was reported" },
  identity: { icon: LogIn, tone: "text-warn bg-warn-soft", verb: (f) => `verify: ${f.title}` },
  broadcast: { icon: Bell, tone: "text-accent bg-accent-soft", verb: (f) => `sent "${f.title}" to ${Number(f.detail?.people) || 0}` },
};

function okTail(f: FeedItem): string {
  const ok = f.detail?.ok;
  if (ok === "false" || ok === false) return " — failed";
  return "";
}

export function Live({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const { data, error, loading, reload, at } = useLoad(() => live(120));
  useAuto(reload, 12_000);
  useTick(15_000);

  if (error && !data) return <Failed error={error} retry={reload} />;
  if (!data) return <Skeleton rows={5} />;

  return (
    <div className="space-y-4">
      <Freshness at={at} loading={loading} every="12s" />

      <section className="adm-card overflow-hidden rounded-2xl border border-line bg-card">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3">
          <LiveDot on={data.online.length > 0} />
          <h3 className="text-[15px] font-bold">Online right now</h3>
          <span className="ml-auto text-[13px] font-bold tabular-nums text-accent">{data.online.length}</span>
        </header>
        {data.online.length === 0 ? (
          <p className="px-5 py-6 text-center text-[13px] text-muted">Nobody in the app this minute.</p>
        ) : (
          <ul className="flex gap-3 overflow-x-auto px-5 py-4">
            {data.online.map((u) => (
              <li key={u.user_id}>
                <button type="button" onClick={() => onOpenUser(u.user_id)} className="flex w-16 flex-col items-center gap-1.5 text-center">
                  <span className="relative">
                    <Avatar name={u.name || u.username} size={44} />
                    <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-safe ring-2 ring-[var(--card)]" />
                  </span>
                  <span className="w-full truncate text-[11px] font-semibold">{u.name?.split(" ")[0] || u.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="adm-card overflow-hidden rounded-2xl border border-line bg-card">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3">
          <DoorOpen size={16} className="text-accent" />
          <h3 className="text-[15px] font-bold">Everything happening</h3>
        </header>
        {data.feed.length === 0 ? (
          <Empty icon={<Sparkles />} title="Quiet for now" sub="Signups, opens, outpasses, errors and reports show up here as they happen." />
        ) : (
          <ol className="divide-y divide-line/60">
            {data.feed.map((f, i) => {
              const K = KIND[f.kind];
              const Icon = K.icon;
              return (
                <li key={`${f.at}-${i}`}>
                  <button
                    type="button"
                    disabled={!f.user_id}
                    onClick={() => f.user_id && onOpenUser(f.user_id)}
                    className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface disabled:cursor-default"
                  >
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${K.tone}`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px]">
                      <b>{f.name || f.username || "Someone"}</b> <span className="text-muted">{K.verb(f)}</span>
                    </span>
                    <time className="shrink-0 text-[11.5px] text-muted tabular-nums" title={clock(f.at)}>
                      {ago(f.at)}
                    </time>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
