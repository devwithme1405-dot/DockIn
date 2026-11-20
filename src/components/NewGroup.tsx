"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Search, X } from "lucide-react";
import type { Friend } from "@/lib/types";
import { Avatar, cx, useToast } from "./ui";
import { useBackClose } from "@/lib/backClose";
import { addGroupMembers, createGroup, pullSocial, updateGroup, SocialError } from "@/lib/social";
import { uploadAvatarPhoto } from "@/lib/avatars";

const EMOJIS = ["📚", "🧪", "💻", "🏠", "⚽", "🎓", "🎬", "🍜", "🎵", "🧠", "🚀", "🔥", "🏏", "🎮", "☕", "📝"];

/**
 * Making a group, WhatsApp-style: first what it is (name, photo or emoji,
 * description), then who is in it — or skip and add people later.
 */
export function NewGroup({ friends, onDone, onClose }: { friends: Friend[]; onDone: (groupId: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  useBackClose(true, onClose);
  // Back on "Add people" returns to step 1 rather than throwing the group away.
  useBackClose(step === 2, () => setStep(1));
  const toast = useToast();
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return [...friends].filter((f) => !k || f.name.toLowerCase().includes(k)).sort((a, b) => a.name.localeCompare(b.name));
  }, [friends, q]);
  const chosen = friends.filter((f) => picked.has(f.id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create(withPeople: boolean) {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const g = await createGroup(name, emoji);
      // The extras never block the group itself: it exists now, whatever happens next.
      const extras: string[] = [];
      if (photo) {
        try {
          const key = await uploadAvatarPhoto(photo.file);
          await updateGroup(g.id, { photo: key });
        } catch {
          extras.push("photo");
        }
      }
      if (about.trim()) {
        try {
          await updateGroup(g.id, { about: about.trim().slice(0, 300) });
        } catch {
          extras.push("description");
        }
      }
      if (withPeople && picked.size) {
        try {
          await addGroupMembers(g.id, [...picked]);
        } catch (e) {
          toast.show(e instanceof SocialError ? e.message : "Could not add people — share the group code instead.");
        }
      }
      await pullSocial().catch(() => {});
      if (extras.length) toast.show(`Group made. The ${extras.join(" and ")} didn't save — set it in group info.`);
      onDone(g.id);
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not create the group.");
      setBusy(false);
    }
  }

  return (
    <div className="paper-page fixed inset-0 z-[55] flex flex-col" role="dialog" aria-label="New group">
      <header className="solid-bar flex items-center gap-1.5 rounded-none border-x-0 border-t-0 px-1.5 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5">
        <button
          onClick={() => (step === 2 ? setStep(1) : onClose())}
          aria-label="Back"
          className="grid size-11 place-items-center rounded-full active:bg-surface-2"
        >
          <ArrowLeft size={23} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] leading-tight font-extrabold">{step === 1 ? "New group" : "Add people"}</p>
          <p className="text-[12px] text-muted">{step === 1 ? "Step 1 of 2 · About the group" : `Step 2 of 2 · ${picked.size} picked`}</p>
        </div>
      </header>
      {/* progress */}
      <div className="h-1 bg-surface-2">
        <div className="h-full origin-left bg-gradient-to-r from-orange to-[#d24f1e] transition-transform duration-300" style={{ transform: `scaleX(${step / 2})` }} />
      </div>

      {step === 1 ? (
        <div key="s1" className="anim-pop flex-1 overflow-y-auto px-5 pt-5 pb-28">
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#fff1de] to-[#f3c996] text-[44px] ring-4 ring-surface shadow-[0_10px_24px_-12px_rgb(var(--shadow-ink)/0.7)] dark:from-[#3a2a1c] dark:to-[#5a3a22]"
              aria-label="Choose a group photo"
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.url} alt="" className="size-full object-cover" />
              ) : (
                emoji
              )}
              <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-gradient-to-br from-orange to-[#d24f1e] text-white ring-2 ring-surface">
                <Camera size={15} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold">Group photo</p>
              <p className="text-[12.5px] text-muted">Tap the circle for a photo, or pick an emoji below.</p>
              {photo && (
                <button
                  onClick={() => {
                    URL.revokeObjectURL(photo.url);
                    setPhoto(null);
                  }}
                  className="mt-1 text-[12.5px] font-bold text-danger"
                >
                  Remove photo
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (photo) URL.revokeObjectURL(photo.url);
                setPhoto({ file: f, url: URL.createObjectURL(f) });
              }}
            />
          </div>

          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  setEmoji(e);
                  if (photo) {
                    URL.revokeObjectURL(photo.url);
                    setPhoto(null);
                  }
                }}
                aria-label={`Use ${e}`}
                aria-pressed={!photo && emoji === e}
                className={cx(
                  "grid size-12 shrink-0 place-items-center rounded-2xl text-[22px] transition-transform active:scale-90",
                  !photo && emoji === e ? "bg-gradient-to-br from-orange to-[#d24f1e] shadow-md" : "bg-surface-2",
                )}
              >
                {e}
              </button>
            ))}
          </div>

          <label className="mt-5 block">
            <span className="mb-1.5 flex justify-between text-[13px] font-bold">
              Group name <span className="font-semibold text-muted tabular-nums">{name.length}/50</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 50))}
              placeholder="e.g. CSE E2 · DBMS gang"
              autoFocus
              className="h-12 w-full rounded-2xl border-[1.5px] border-card-edge bg-card px-4 text-[16px] font-semibold outline-none focus:border-orange"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 flex justify-between text-[13px] font-bold">
              Description <span className="font-semibold text-muted">optional</span>
            </span>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, 300))}
              rows={3}
              placeholder="What's this group for? Notes, deadlines, lab partners…"
              className="w-full resize-none rounded-2xl border-[1.5px] border-card-edge bg-card px-4 py-3 text-[15px] outline-none focus:border-orange"
            />
          </label>
        </div>
      ) : (
        <div key="s2" className="anim-pop flex min-h-0 flex-1 flex-col">
          {chosen.length > 0 && (
            <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none]">
              {chosen.map((f) => (
                <button key={f.id} onClick={() => toggle(f.id)} className="anim-pop relative flex w-14 shrink-0 flex-col items-center gap-1">
                  <Avatar name={f.name} avatar={f.avatar} size={48} />
                  <span className="absolute top-0 right-0 grid size-5 place-items-center rounded-full bg-text text-bg ring-2 ring-bg">
                    <X size={11} strokeWidth={3} />
                  </span>
                  <span className="w-full truncate text-center text-[11px]">{f.name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          )}
          <div className="px-4 pt-3">
            <label className="solid-bar flex h-11 items-center gap-2.5 rounded-2xl px-3.5">
              <Search size={17} className="shrink-0 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search friends"
                aria-label="Search friends"
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
              />
            </label>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto px-3 pt-2 pb-36">
            {list.map((f, i) => {
              const on = picked.has(f.id);
              return (
                <li key={f.id} className="anim-pop" style={{ "--d": `${Math.min(i, 8) * 30}ms` } as CSSProperties}>
                  <button
                    onClick={() => toggle(f.id)}
                    aria-pressed={on}
                    className={cx("flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors", on ? "bg-mess-soft" : "active:bg-surface-2")}
                  >
                    <Avatar name={f.name} avatar={f.avatar} size={46} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{f.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">{[f.branch, f.year ? `Year ${f.year}` : null].filter(Boolean).join(" · ") || "Friend"}</span>
                    </span>
                    <span
                      className={cx(
                        "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                        on ? "border-transparent bg-gradient-to-br from-orange to-[#d24f1e] text-white" : "border-card-edge",
                      )}
                    >
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
            {friends.length === 0 && (
              <li className="px-4 py-10 text-center text-[13.5px] text-muted">No friends to add yet. Make the group now and share its code or QR.</li>
            )}
          </ul>
        </div>
      )}

      <footer className="solid-bar absolute inset-x-0 bottom-0 rounded-none border-x-0 border-b-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {step === 1 ? (
          <button
            onClick={() => setStep(2)}
            disabled={!name.trim()}
            className="btn-leather flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] disabled:opacity-50"
          >
            Next: add people <ArrowRight size={18} />
          </button>
        ) : (
          <div className="flex gap-2.5">
            <button onClick={() => void create(false)} disabled={busy} className="btn-paper h-12 flex-1 rounded-2xl text-[14.5px] font-bold disabled:opacity-50">
              Skip, add later
            </button>
            <button
              onClick={() => void create(true)}
              disabled={busy || picked.size === 0}
              className="btn-leather h-12 flex-[1.4] rounded-2xl text-[15px] disabled:opacity-50"
            >
              {busy ? "Creating…" : `Create with ${picked.size}`}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
