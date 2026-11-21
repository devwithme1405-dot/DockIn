"use client";

import { useEffect, useState } from "react";
import { Check, Clock, UserPlus, Users } from "lucide-react";
import { SocialError, acceptFriend, friendsOf, pullSocial, requestFriend, type FriendOfFriend } from "@/lib/social";
import { Avatar, cx, useToast } from "./ui";
import { Bone } from "./Skeleton";

/**
 * "Vaibhav's friends" on a friend's profile — Instagram-style: who they're
 * friends with, and an Add button for anyone I'm not friends with yet.
 */
export function FriendsOf({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const toast = useToast();
  const [list, setList] = useState<FriendOfFriend[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const first = name.trim().split(/\s+/)[0] || name;

  useEffect(() => {
    // A different friend remounts this (key={userId}), so it starts empty.
    let alive = true;
    friendsOf(userId)
      .then((l) => alive && setList(l))
      .catch((e) => {
        if (!alive) return;
        setFailed(e instanceof SocialError ? e.message : "Could not load this list.");
        setList([]);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  async function add(p: FriendOfFriend) {
    if (busy) return;
    setBusy(p.userId);
    try {
      if (p.relation === "received") {
        await acceptFriend(p.userId);
        void pullSocial().catch(() => {});
      } else {
        await requestFriend(p.userId);
      }
      const now = p.relation === "received" ? "friend" : "sent";
      setList((l) => (l ?? []).map((x) => (x.userId === p.userId ? { ...x, relation: now } : x)));
      toast.show(now === "friend" ? `You and ${p.name.split(" ")[0]} are friends now` : `Request sent to ${p.name.split(" ")[0]}`);
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not send the request.");
    }
    setBusy(null);
  }

  const others = (list ?? []).filter((p) => p.relation !== "me");
  const mutual = others.filter((p) => p.relation === "friend").length;
  const shown = all ? others : others.slice(0, 8);

  return (
    <section className={cx("glass-card overflow-hidden rounded-3xl", className)} aria-label={`${first}'s friends`}>
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-1.5">
        <Users size={17} className="text-mess" />
        <p className="flex-1 text-[14px] font-extrabold">{first}&apos;s friends</p>
        {list && !failed && (
          <span className="text-[12.5px] font-semibold text-muted">
            {others.length}
            {mutual ? ` · ${mutual} mutual` : ""}
          </span>
        )}
      </div>

      {list === null ? (
        <ul aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Bone className="size-[42px] shrink-0 rounded-full" />
              <span className="flex-1 space-y-1.5">
                <Bone className="h-3.5 w-1/2" />
                <Bone className="h-3 w-1/3" />
              </span>
            </li>
          ))}
        </ul>
      ) : failed ? (
        <p className="px-4 pb-4 text-[13px] text-muted">{failed}</p>
      ) : others.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-muted">No other friends on DockIn yet.</p>
      ) : (
        <>
          <ul>
            {shown.map((p, i) => (
              <li
                key={p.userId}
                className="flex items-center gap-3 px-4 py-2.5 [animation:rise-quick_320ms_ease-out_both]"
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              >
                <Avatar name={p.name} avatar={p.avatar} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {[p.branch, p.year ? `Year ${p.year}` : null].filter(Boolean).join(" · ") || "On DockIn"}
                  </span>
                </span>
                {p.relation === "friend" ? (
                  <span className="flex items-center gap-1 rounded-full bg-safe/12 px-2.5 py-1 text-[12px] font-bold text-safe">
                    <Check size={13} strokeWidth={3} /> Friends
                  </span>
                ) : p.relation === "sent" ? (
                  <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-bold text-muted">
                    <Clock size={13} /> Requested
                  </span>
                ) : (
                  <button
                    onClick={() => void add(p)}
                    disabled={busy === p.userId}
                    aria-label={p.relation === "received" ? `Accept ${p.name}` : `Add ${p.name}`}
                    className="btn-leather flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] disabled:opacity-60 active:scale-95"
                  >
                    {p.relation === "received" ? (
                      <>
                        <Check size={15} /> Accept
                      </>
                    ) : (
                      <>
                        <UserPlus size={15} /> Add
                      </>
                    )}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {others.length > 8 && (
            <button onClick={() => setAll((v) => !v)} className="w-full border-t border-card-edge/50 py-3 text-[13.5px] font-bold text-mess">
              {all ? "Show less" : `See all ${others.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
