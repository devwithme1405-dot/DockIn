"use client";

import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { REACTIONS, SocialError, react } from "@/lib/social";
import type { Reaction } from "@/lib/types";
import { Avatar, cx, useToast } from "./ui";

/**
 * Reactions on a shared assignment.
 *
 * The cheapest possible way to say "seen it", "same", or "thank you" — which
 * is most of what a class group says to each other, and all of it currently
 * happens somewhere else. One tap, one reaction per person, and the faces of
 * whoever reacted rather than a bare number, because a count tells you nothing
 * about whether your own group has seen the thing you posted.
 */
export function Reactions({
  shareId,
  list,
  me,
}: {
  shareId: string;
  list: Reaction[];
  me: string | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const mine = list.find((r) => r.userId === me)?.emoji ?? null;

  // Commonest first, so the group's answer reads at a glance.
  const tally = new Map<string, Reaction[]>();
  for (const r of list) tally.set(r.emoji, [...(tally.get(r.emoji) ?? []), r]);
  const shown = [...tally.entries()].sort((a, b) => b[1].length - a[1].length);

  async function tap(emoji: string) {
    setOpen(false);
    try {
      await react(shareId, mine === emoji ? null : emoji);
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not react.");
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {shown.map(([emoji, who]) => (
        <button
          key={emoji}
          onClick={() => void tap(emoji)}
          aria-pressed={mine === emoji}
          title={who.map((w) => w.name).join(", ")}
          className={cx(
            "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[13px] transition active:scale-95",
            mine === emoji ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
          )}
        >
          <span className="text-[14px] leading-none">{emoji}</span>
          <span className="tabular-nums">{who.length}</span>
        </button>
      ))}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="React"
        aria-expanded={open}
        className="grid size-7 place-items-center rounded-full bg-surface-2 text-muted transition active:scale-95"
      >
        <SmilePlus size={14} />
      </button>

      {open && (
        <div className="flex items-center gap-0.5 rounded-full bg-surface-2 px-1 py-0.5">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => void tap(emoji)}
              aria-label={`React ${emoji}`}
              className={cx(
                "grid size-7 place-items-center rounded-full text-[16px] transition active:scale-90",
                mine === emoji && "bg-accent-soft",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A few overlapping faces: who is in a group, without a list. */
export function Faces({
  people,
  total,
  size = 26,
}: {
  people: { id: string; name: string; avatar?: string }[];
  total: number;
  size?: number;
}) {
  const shown = people.slice(0, 3);
  const rest = Math.max(0, total - shown.length);
  if (shown.length === 0) return null;
  return (
    <span className="flex items-center" aria-label={`${total} in this group`}>
      {shown.map((p, i) => (
        <span
          key={p.id}
          className="rounded-full ring-2 ring-surface"
          style={{ marginLeft: i === 0 ? 0 : -size / 3 }}
        >
          <Avatar name={p.name} avatar={p.avatar} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted ring-2 ring-surface"
          style={{ width: size, height: size, marginLeft: -size / 3 }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
