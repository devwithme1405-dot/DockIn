"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, BellOff, Camera, Check, Copy, FileText, LogOut, Pencil, Pin, Trash2, UserMinus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { clearThreadForMe, setThreadPref, type ThreadId } from "@/lib/chat";
import { SocialError, blockUser, groupPeople, leaveGroup, removeFriend, updateGroup, type GroupPerson } from "@/lib/social";
import { uploadAvatarPhoto } from "@/lib/avatars";
import type { Group } from "@/lib/types";
import { Avatar, ConfirmSheet, cx, useToast } from "./ui";
import { QrCode } from "./QrCode";

/** A photo, full screen — tap anywhere to close (like WhatsApp's profile view). */
export function PhotoViewer({ name, avatar, emoji, onClose }: { name: string; avatar?: string | null; emoji?: string | null; onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm [animation:fade-in_160ms_ease-out]"
      aria-label="Close photo"
    >
      {avatar || !emoji ? (
        <Avatar name={name} avatar={avatar ?? undefined} size={Math.min(320, typeof window === "undefined" ? 320 : window.innerWidth - 48)} />
      ) : (
        <span className="grid size-64 place-items-center rounded-full bg-mess-soft text-[110px]">{emoji ?? name.charAt(0)}</span>
      )}
      <span className="text-[17px] font-bold text-white">{name}</span>
    </button>
  );
}

/**
 * The info page behind a chat's name: for a group — photo, name, description,
 * members, invite QR, files, mute, leave; for a friend — photo, details, mute,
 * clear, remove, block. Full screen, slides over the chat.
 */
export function ChatInfo({
  thread,
  me,
  group,
  friendId,
  title,
  avatar,
  onClose,
  onShowFiles,
  onLeft,
}: {
  thread: ThreadId;
  me: string | null;
  group?: Group | null;
  friendId?: string | null;
  title: string;
  avatar?: string | null;
  onClose: () => void;
  onShowFiles: () => void;
  onLeft: () => void;
}) {
  const toast = useToast();
  const pref = useLiveQuery(() => db.chatReads.get(thread), [thread]);
  const friend = useLiveQuery(() => (friendId ? db.friends.get(friendId) : undefined), [friendId]);
  const files = useLiveQuery(
    () => db.messages.where("thread").equals(thread).filter((m) => m.kind === "file" && !m.deleted && !m.hidden).count(),
    [thread],
  );
  const [members, setMembers] = useState<GroupPerson[] | null>(null);
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group?.name ?? "");
  const [about, setAbout] = useState(group?.about ?? "");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "leave" | "clear" | "block" | "remove">(null);
  const photo = useRef<HTMLInputElement>(null);
  const isOwner = !!group && group.owner === me;

  useEffect(() => {
    if (!group) return;
    let alive = true;
    void groupPeople(group.id)
      .then((p) => alive && setMembers(p))
      .catch(() => alive && setMembers([]));
    return () => {
      alive = false;
    };
  }, [group]);

  async function savePhoto(f: File | undefined) {
    if (!f || !group) return;
    setBusy(true);
    try {
      const key = await uploadAvatarPhoto(f, group.photo ?? undefined);
      await updateGroup(group.id, { photo: key });
      toast.show("Group photo updated");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not update the photo.");
    }
    setBusy(false);
  }

  async function saveDetails() {
    if (!group || !name.trim()) return;
    setBusy(true);
    try {
      await updateGroup(group.id, { name: name.trim().slice(0, 50), about: about.trim().slice(0, 300) });
      setEditing(false);
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not save.");
    }
    setBusy(false);
  }

  async function act() {
    const what = confirm;
    setConfirm(null);
    try {
      if (what === "clear") {
        await clearThreadForMe(thread);
        toast.show("Chat cleared on this phone");
      } else if (what === "leave" && group) {
        await leaveGroup(group.id);
        onLeft();
      } else if (what === "block" && friendId) {
        await blockUser(friendId, title);
        onLeft();
      } else if (what === "remove" && friendId) {
        await removeFriend(friendId);
        onLeft();
      }
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not do that.");
    }
  }

  const row = "flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[15px] font-semibold active:bg-surface-2/70";

  return (
    <div className="paper-page fixed inset-0 z-[60] flex flex-col [animation:sheet-in_220ms_cubic-bezier(.2,.9,.3,1)]" role="dialog" aria-label={`${title} info`}>
      <header className="glass-bar flex items-center gap-1.5 px-1.5 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5">
        <button onClick={onClose} aria-label="Back" className="grid size-11 place-items-center rounded-full active:bg-surface-2">
          <ArrowLeft size={23} />
        </button>
        <p className="flex-1 text-[17px] font-extrabold">{group ? "Group info" : "Contact info"}</p>
        {isOwner && !editing && (
          <button onClick={() => setEditing(true)} aria-label="Edit group" className="grid size-11 place-items-center rounded-full active:bg-surface-2">
            <Pencil size={19} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-10">
        <div className="flex flex-col items-center px-4 pt-5 pb-4">
          <div className="relative">
            <button onClick={() => setViewing(true)} aria-label="View photo" className="rounded-full">
              {avatar || !group ? (
                <Avatar name={title} avatar={avatar ?? undefined} size={116} />
              ) : (
                <span className="grid size-[116px] place-items-center rounded-full bg-mess-soft text-[54px]">{group?.emoji ?? title.charAt(0)}</span>
              )}
            </button>
            {isOwner && (
              <>
                <input ref={photo} type="file" accept="image/*" className="hidden" onChange={(e) => { void savePhoto(e.target.files?.[0]); e.target.value = ""; }} />
                <button
                  onClick={() => photo.current?.click()}
                  disabled={busy}
                  aria-label="Change group photo"
                  className="absolute right-0 bottom-0 grid size-10 place-items-center rounded-full bg-gradient-to-br from-orange to-[#c4532a] text-white ring-4 ring-bg disabled:opacity-60"
                >
                  <Camera size={18} />
                </button>
              </>
            )}
          </div>

          {editing ? (
            <div className="mt-4 w-full space-y-2.5">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} aria-label="Group name" className="h-12 w-full rounded-2xl border-[1.5px] border-card-edge bg-card px-4 text-[16px] font-bold outline-none focus:border-orange" />
              <textarea value={about} onChange={(e) => setAbout(e.target.value)} maxLength={300} rows={3} placeholder="Group description" aria-label="Group description" className="w-full resize-none rounded-2xl border-[1.5px] border-card-edge bg-card px-4 py-3 text-[14.5px] outline-none focus:border-orange" />
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="btn-paper h-11 flex-1 rounded-2xl font-bold">Cancel</button>
                <button onClick={() => void saveDetails()} disabled={busy || !name.trim()} className="btn-leather flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl disabled:opacity-60">
                  <Check size={17} /> Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-3.5 text-center text-[23px] leading-tight font-extrabold">{title}</p>
              <p className="mt-1 text-[13.5px] text-muted">
                {group
                  ? `Group · ${group.members} ${group.members === 1 ? "member" : "members"}`
                  : [friend?.branch, friend?.year ? `Year ${friend.year}` : null, friend?.section].filter(Boolean).join(" · ") || "Friend"}
              </p>
              {group?.about && <p className="mt-3 max-w-sm text-center text-[14.5px] whitespace-pre-wrap">{group.about}</p>}
            </>
          )}
        </div>

        <section className="glass-card mx-4 overflow-hidden rounded-3xl">
          <button onClick={onShowFiles} className={row}>
            <FileText size={19} className="text-mess" />
            <span className="flex-1">Files & documents</span>
            <span className="text-[13.5px] text-muted">{files ?? 0}</span>
          </button>
          <button onClick={() => void setThreadPref(thread, { muted: !pref?.muted })} className={cx(row, "border-t border-card-edge/50")}>
            <BellOff size={19} className="text-mess" />
            <span className="flex-1">Mute notifications</span>
            <Toggle on={!!pref?.muted} />
          </button>
          <button onClick={() => void setThreadPref(thread, { pinned: !pref?.pinned })} className={cx(row, "border-t border-card-edge/50")}>
            <Pin size={19} className="text-mess" />
            <span className="flex-1">Pin chat</span>
            <Toggle on={!!pref?.pinned} />
          </button>
        </section>

        {group && (
          <section className="glass-card mx-4 mt-4 overflow-hidden rounded-3xl">
            <p className="px-4 pt-3.5 pb-1 text-[13px] font-bold text-muted">{group.members} members</p>
            <ul>
              {(members ?? []).map((p) => (
                <li key={p.userId} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={p.name} avatar={p.avatar} size={42} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{p.userId === me ? "You" : p.name}</span>
                    {p.branch && <span className="block truncate text-[12.5px] text-muted">{[p.branch, p.year ? `Year ${p.year}` : null].filter(Boolean).join(" · ")}</span>}
                  </span>
                  {p.role === "owner" && <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[11.5px] font-bold text-mess">Admin</span>}
                </li>
              ))}
              {members === null && <li className="px-4 py-3 text-[13.5px] text-muted">Loading members…</li>}
            </ul>
            <div className="border-t border-card-edge/50 px-4 py-4">
              <p className="mb-2 text-[13px] font-bold text-muted">Invite with the code or QR</p>
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-white p-2">
                  <QrCode value={`https://dock-in.vercel.app/circle?join=${group.code}`} size={96} />
                </div>
                <div>
                  <p className="font-mono text-[22px] font-bold tracking-[0.2em]">{group.code}</p>
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(group.code).catch(() => {});
                      toast.show("Code copied");
                    }}
                    className="mt-1 flex items-center gap-1.5 text-[13.5px] font-bold text-mess"
                  >
                    <Copy size={14} /> Copy code
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="glass-card mx-4 mt-4 overflow-hidden rounded-3xl text-danger">
          <button onClick={() => setConfirm("clear")} className={row}>
            <Trash2 size={19} /> Clear chat
          </button>
          {group ? (
            <button onClick={() => setConfirm("leave")} className={cx(row, "border-t border-card-edge/50")}>
              <LogOut size={19} /> Exit group
            </button>
          ) : (
            <>
              <button onClick={() => setConfirm("remove")} className={cx(row, "border-t border-card-edge/50")}>
                <UserMinus size={19} /> Remove friend
              </button>
              <button onClick={() => setConfirm("block")} className={cx(row, "border-t border-card-edge/50")}>
                <Ban size={19} /> Block {title}
              </button>
            </>
          )}
        </section>
      </div>

      {viewing && <PhotoViewer name={title} avatar={avatar} emoji={group?.emoji} onClose={() => setViewing(false)} />}

      <ConfirmSheet
        open={!!confirm}
        title={
          confirm === "clear" ? "Clear this chat?" : confirm === "leave" ? `Exit ${title}?` : confirm === "block" ? `Block ${title}?` : `Remove ${title}?`
        }
        confirmLabel={confirm === "clear" ? "Clear" : confirm === "leave" ? "Exit" : confirm === "block" ? "Block" : "Remove"}
        onConfirm={() => void act()}
        onClose={() => setConfirm(null)}
      >
        {confirm === "clear"
          ? "Messages disappear from this phone. Everyone else keeps them."
          : confirm === "leave"
            ? "You stop getting this group's messages and tasks. You can join again with the code."
            : confirm === "block"
              ? "They can't message you or send requests, and the friendship ends. They are not told."
              : "You stop seeing each other's shared work. You can add each other again later."}
      </ConfirmSheet>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-orange" : "bg-surface-2")}>
      <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-[left]", on ? "left-6" : "left-1")} />
    </span>
  );
}

