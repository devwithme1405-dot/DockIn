"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, Plus, Share2, Users } from "lucide-react";
import { useFriends, useGroups, useShareState, useShares, useSubjects } from "@/lib/hooks";
import {
  SocialError,
  groupPeople,
  leaveGroup,
  pullSocial,
  type GroupPerson,
} from "@/lib/social";
import { useAuth } from "@/lib/auth";
import { Avatar, Button, ConfirmSheet, EmptyState, Sheet, useToast } from "@/components/ui";
import { BackHeader } from "@/components/PageHeader";
import { ShareForm, ShareRow } from "@/components/ShareParts";
import { ListSkeleton } from "@/components/Skeleton";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id ?? null;

  const groups = useGroups();
  const shares = useShares();
  const states = useShareState();
  const subjects = useSubjects();
  const friends = useFriends();

  const [people, setPeople] = useState<GroupPerson[] | null>(null);
  const [sheet, setSheet] = useState<"share" | "members" | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const group = groups?.find((g) => g.id === id);

  const load = useCallback(async () => {
    try {
      await pullSocial();
      setPeople(await groupPeople(id));
    } catch {
      /* offline: the cached group and its posts still show */
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const posts = useMemo(() => {
    const list = (shares ?? []).filter((s) => s.groupId === id && !states?.get(s.id)?.hidden);
    return list.sort((a, b) => {
      const ad = !!states?.get(a.id)?.done;
      const bd = !!states?.get(b.id)?.done;
      if (ad !== bd) return ad ? 1 : -1;
      const ax = a.dueDate ?? "9999-99-99";
      const bx = b.dueDate ?? "9999-99-99";
      return ax.localeCompare(bx) || b.createdAt - a.createdAt;
    });
  }, [shares, states, id]);

  if (!groups || !shares) {
    return (
      <>
        <BackHeader href="/circle?tab=groups" backLabel="Groups" title="Group" hideLargeTitle />
        <ListSkeleton n={3} />
      </>
    );
  }

  if (!group) {
    return (
      <>
        <BackHeader href="/circle?tab=groups" backLabel="Groups" title="Group" hideLargeTitle />
        <EmptyState
          title="You are not in this group"
          body="It may have been deleted, or you left it on another phone."
        />
      </>
    );
  }

  async function copyCode() {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.show("Could not copy. Long-press the code instead.");
    }
  }

  async function invite() {
    if (!group) return;
    const text = `Join "${group.name}" on DockIn with the code ${group.code}`;
    try {
      if (navigator.share) await navigator.share({ title: group.name, text });
      else {
        await navigator.clipboard.writeText(text);
        toast.show("Invite copied");
      }
    } catch {
      /* the person closed the share sheet */
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await leaveGroup(id);
      toast.show("You left the group");
      router.replace("/circle?tab=groups");
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not leave.");
      setBusy(false);
      setLeaving(false);
    }
  }

  const pending = posts.filter((p) => !states?.get(p.id)?.done).length;

  return (
    <>
      <BackHeader href="/circle?tab=groups" backLabel="Groups" title={group.name} hideLargeTitle />

      <div className="px-5">
        <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
          <div className="flex items-center gap-3.5">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[26px]">
              {group.emoji ?? "👥"}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[21px] font-semibold tracking-tight">{group.name}</h1>
              <button
                onClick={() => setSheet("members")}
                className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-muted"
              >
                <Users size={14} /> {group.members} {group.members === 1 ? "person" : "people"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted">Join code</p>
              <p className="font-mono text-[18px] font-semibold tracking-[0.18em]">{group.code}</p>
            </div>
            <button
              onClick={copyCode}
              aria-label="Copy join code"
              className="grid size-10 place-items-center rounded-full bg-surface text-text"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button
              onClick={invite}
              aria-label="Invite someone"
              className="grid size-10 place-items-center rounded-full bg-accent text-on-accent"
            >
              <Share2 size={16} />
            </button>
          </div>
        </section>

        <Button className="mt-4 w-full" onClick={() => setSheet("share")}>
          <Plus size={18} /> Share an assignment
        </Button>

        <h2 className="mt-6 mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
          {pending > 0 ? `${pending} to do` : "Shared here"}
        </h2>

        {posts.length === 0 ? (
          <EmptyState
            flush
            icon={Plus}
            title="Nothing shared yet"
            body="Post an assignment and everyone in this group gets it on their Tasks screen."
          />
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--line)]">
            {posts.map((s) => (
              <ShareRow
                key={s.id}
                share={s}
                state={states?.get(s.id)}
                showGroup={false}
                mine={s.author === me}
                onChanged={load}
              />
            ))}
          </div>
        )}

        <button
          onClick={() => setLeaving(true)}
          className="mx-auto mt-8 mb-4 flex h-10 items-center gap-1.5 text-[14px] font-medium text-danger"
        >
          <LogOut size={15} /> Leave this group
        </button>
      </div>

      <Sheet open={sheet === "share"} onClose={() => setSheet(null)} title="Share an assignment">
        <ShareForm
          groups={groups}
          subjects={subjects ?? []}
          friends={(friends ?? []).filter((f) => f.status === "accepted")}
          defaultGroupId={id}
          onDone={() => {
            setSheet(null);
            void load();
          }}
        />
      </Sheet>

      <Sheet open={sheet === "members"} onClose={() => setSheet(null)} title="In this group">
        {people === null ? (
          <p className="text-[14px] text-muted">Loading…</p>
        ) : (
          <div className="divide-y divide-line">
            {people.map((p) => (
              <div key={p.userId} className="flex items-center gap-3 py-3">
                <Avatar name={p.name} avatar={p.avatar} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.userId === me ? "You" : p.name}
                    {p.role === "owner" && (
                      <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                        made this
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[12.5px] text-muted">
                    {[p.branch, p.year ? `Year ${p.year}` : null].filter(Boolean).join(" · ") ||
                      "Bennett student"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={leaving}
        title="Leave this group?"
        confirmLabel="Leave"
        onConfirm={leave}
        onClose={() => setLeaving(false)}
        busy={busy}
      >
        <p>
          You will stop seeing what is shared in {group.name}. You can join again later with the code{" "}
          <span className="font-mono text-text">{group.code}</span>.
        </p>
      </ConfirmSheet>
    </>
  );
}
