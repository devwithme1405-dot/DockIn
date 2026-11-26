"use client";

import { useState } from "react";
import { Flag, Info, Megaphone, PartyPopper, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { useAnnouncement, type Ban } from "@/lib/presence";
import { getSupabase } from "@/lib/supabase";
import { cx, useToast } from "./ui";

/** Over everything when this account is suspended: why, until when, and a way out. */
export function BannedScreen({ ban, onSignOut }: { ban: Ban; onSignOut: () => void }) {
  const until = ban.until ? new Date(ban.until).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div className="paper-page fixed inset-0 z-[90] mx-auto flex w-full max-w-md flex-col items-center justify-center px-8 text-center" role="alertdialog" aria-label="Account suspended">
      <span className="grid size-20 place-items-center rounded-3xl bg-danger-soft text-danger">
        <ShieldAlert size={40} />
      </span>
      <h1 className="font-display mt-5 text-[25px] font-extrabold">Account suspended</h1>
      <p className="mt-2 text-[15px] leading-snug text-muted">
        {until ? `Your DockIn account is suspended until ${until}.` : "Your DockIn account has been suspended."}
      </p>
      {ban.reason && (
        <p className="mt-4 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left text-[14px]">
          <span className="block text-[12px] font-bold tracking-[0.06em] text-muted uppercase">Reason</span>
          {ban.reason}
        </p>
      )}
      <p className="mt-4 text-[13px] text-muted">Think this is a mistake? Write to the DockIn team.</p>
      <button type="button" onClick={onSignOut} className="btn-paper mt-6 h-12 w-full rounded-2xl text-[15px] font-bold">
        Sign out
      </button>
    </div>
  );
}

const TONES = {
  info: { cls: "border-accent/30 bg-accent-soft", icon: Megaphone, color: "text-accent" },
  warn: { cls: "border-warn/40 bg-warn-soft", icon: TriangleAlert, color: "text-warn" },
  good: { cls: "border-safe/40 bg-safe-soft", icon: PartyPopper, color: "text-safe" },
} as const;

/** The founder's announcement (set in DockIn Admin), until this student closes it. */
export function AnnouncementBar({ className }: { className?: string }) {
  const a = useAnnouncement();
  const [closed, setClosed] = useState<string | null>(() => {
    try {
      return localStorage.getItem("dockin-announce-closed");
    } catch {
      return null;
    }
  });
  if (!a || closed === a.id) return null;
  const t = TONES[a.tone ?? "info"] ?? TONES.info;
  const Icon = t.icon;
  return (
    <div className={cx("anim-fade flex items-start gap-3 rounded-2xl border px-4 py-3", t.cls, className)} role="status">
      <Icon size={19} className={cx("mt-px shrink-0", t.color)} />
      <p className="min-w-0 flex-1 text-[14px] leading-snug font-medium">
        {a.text}
        {a.link && (
          <a href={a.link} target="_blank" rel="noreferrer" className={cx("ml-1 font-bold underline", t.color)}>
            Open
          </a>
        )}
      </p>
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          setClosed(a.id);
          try {
            localStorage.setItem("dockin-announce-closed", a.id);
          } catch {}
        }}
        className="-mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-full text-muted"
      >
        <X size={16} />
      </button>
    </div>
  );
}

const REASONS = ["Abusive or bullying", "Spam or scam", "Cheating / exam leaks", "Sexual or violent content", "Fake account", "Something else"];

/** Report a message to the DockIn team: it keeps the message's words for review. */
export function ReportMessage({
  message,
  onDone,
}: {
  message: { id: string; author: string; thread: string; body: string; kind?: string };
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!reason) return;
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    const { data } = await sb.auth.getSession();
    const me = data.session?.user.id;
    const { error } = await sb.from("reports").insert({
      reporter: me,
      target: message.author,
      message_id: message.id,
      thread: message.thread,
      reason: (note.trim() ? `${reason}: ${note.trim()}` : reason).slice(0, 300),
      excerpt: (message.body || `[${message.kind ?? "message"}]`).slice(0, 600),
    });
    setBusy(false);
    if (error && !/duplicate|unique/i.test(error.message)) {
      toast.show("Couldn't send the report — try again.");
      return;
    }
    toast.show("Reported. The DockIn team will look at it.");
    onDone();
  }
  return (
    <div className="space-y-3 pb-2">
      <p className="flex gap-2 rounded-xl bg-surface px-3 py-2.5 text-[13px] leading-snug text-muted">
        <Info size={15} className="mt-px shrink-0 text-accent" />
        Only this message is shared with the DockIn team, with your report. They won&apos;t know anything else from this chat.
      </p>
      <div className="grid gap-2">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={cx("lip-sm flex h-11 items-center gap-2 rounded-xl px-3.5 text-left text-[14px]", reason === r ? "btn-leather" : "btn-paper")}
          >
            <Flag size={15} /> {r}
          </button>
        ))}
      </div>
      {reason && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Anything to add? (optional)"
          className="field w-full resize-none px-3.5 py-2.5 text-[15px]"
        />
      )}
      <button
        type="button"
        disabled={!reason || busy}
        onClick={() => void send()}
        className="h-12 w-full rounded-2xl bg-danger text-[15px] font-bold text-white disabled:opacity-50"
      >
        Report
      </button>
    </div>
  );
}
