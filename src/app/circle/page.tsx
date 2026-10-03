"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Plus, Share2, UserPlus, Users, X } from "lucide-react";
import { useFriends, useGroups } from "@/lib/hooks";
import { getProfile } from "@/lib/repo";
import {
  SocialError,
  acceptFriend,
  addFriend,
  cleanCode,
  createGroup,
  ensureProfile,
  joinGroup,
  peekCode,
  publishProfile,
  pullSocial,
  removeFriend,
  type CodePreview,
} from "@/lib/social";
import { useAuth } from "@/lib/auth";
import { isCloudConfigured } from "@/lib/supabase";
import type { Friend } from "@/lib/types";
import {
  Avatar,
  Button,
  ConfirmSheet,
  EmptyState,
  Field,
  STATE_TEXT,
  Sheet,
  cx,
  inputCls,
  useToast,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { QrCode } from "@/components/QrCode";
import { SignIn } from "@/components/SignIn";
import { ListSkeleton } from "@/components/Skeleton";

const ATTENDANCE_WORD = {
  safe: "Safe",
  warn: "Cutting it close",
  danger: "Below target",
  none: "Not tracking yet",
} as const;

const GROUP_EMOJIS = ["📚", "🧪", "💻", "🏠", "⚽", "🎓", "🎬", "🍜", "🎵", "🧠"];

export default function CirclePage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Friends" subtitle="Your people, groups and shared work" />
          <ListSkeleton />
        </>
      }
    >
      <Circle />
    </Suspense>
  );
}

function Circle() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { session, loading: authLoading } = useAuth();
  const friends = useFriends();
  const groups = useGroups();

  const [tab, setTab] = useState<"friends" | "groups">(params.get("tab") === "groups" ? "groups" : "friends");
  const [code, setCode] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Arriving from someone's QR (/circle?add=ABCD1234) opens the add sheet with
  // their code already in it.
  const incoming = cleanCode(params.get("add") ?? "");
  const [sheet, setSheet] = useState<"add" | "confirm" | "newGroup" | "joinGroup" | null>(
    incoming ? "add" : null,
  );
  const [typed, setTyped] = useState(incoming);
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupEmoji, setGroupEmoji] = useState(GROUP_EMOJIS[0]);
  const [removing, setRemoving] = useState<Friend | null>(null);
  const [copied, setCopied] = useState(false);

  const signedIn = !!session;

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const mine = await ensureProfile();
      setCode(mine.code);
      // Keep what friends see in step with what you have set on this phone.
      const local = await getProfile();
      if (local) await publishProfile(local, mine.shareAttendance);
      await pullSocial();
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not load your friends.");
    }
  }, [signedIn]);

  useEffect(() => {
    // Deferred by a microtask: the work is a network round trip, and starting it
    // inside the effect body would make React re-render before paint.
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    // Drop the code from the address bar so a reload does not re-open the sheet.
    if (incoming) router.replace("/circle");
  }, [incoming, router]);

  if (!isCloudConfigured) {
    return (
      <>
        <PageHeader title="Friends" subtitle="Your people, groups and shared work" />
        <div className="px-5">
          <EmptyState
            flush
            icon={Users}
            title="Not available here"
            body="Friends and groups need the hosted version of DockIn."
          />
        </div>
      </>
    );
  }

  if (authLoading) {
    return (
      <>
        <PageHeader title="Friends" subtitle="Your people, groups and shared work" />
        <ListSkeleton n={3} />
      </>
    );
  }

  if (!signedIn) {
    return (
      <>
        <PageHeader title="Friends" subtitle="Your people, groups and shared work" />
        <div className="px-5">
          <p className="mb-5 text-[15px] text-muted">
            Sign in to share assignments with your class and keep up with friends.
          </p>
          <SignIn />
        </div>
      </>
    );
  }

  const accepted = (friends ?? []).filter((f) => f.status === "accepted");
  const requests = (friends ?? []).filter((f) => f.status === "pending" && f.theyAsked);
  const sent = (friends ?? []).filter((f) => f.status === "pending" && !f.theyAsked);
  const link = code ? `${typeof window === "undefined" ? "" : window.location.origin}/circle?add=${code}` : "";

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.show("Could not copy. Long-press the code instead.");
    }
  }

  async function shareLink() {
    if (!link) return;
    const text = `Add me on DockIn. My code is ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: "DockIn", text, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast.show("Link copied");
      }
    } catch {
      /* the person closed the share sheet */
    }
  }

  async function lookUp() {
    setBusy(true);
    setProblem(null);
    try {
      const found = await peekCode(typed);
      if (!found) setProblem("That code did not match anyone.");
      else {
        setPreview(found);
        setSheet("confirm");
      }
    } catch (e) {
      setProblem(e instanceof SocialError ? e.message : "Could not check that code.");
    }
    setBusy(false);
  }

  async function confirmAdd() {
    setBusy(true);
    try {
      const status = await addFriend(typed);
      await pullSocial();
      setSheet(null);
      setTyped("");
      setPreview(null);
      toast.show(status === "accepted" ? "You are friends now" : "Request sent");
    } catch (e) {
      setProblem(e instanceof SocialError ? e.message : "Could not send that request.");
    }
    setBusy(false);
  }

  async function accept(f: Friend) {
    try {
      await acceptFriend(f.id);
      await pullSocial();
      toast.show(`${f.name} is now a friend`);
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not accept.");
    }
  }

  async function drop() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeFriend(removing.id);
      await pullSocial();
      toast.show("Removed");
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not remove.");
    }
    setRemoving(null);
    setBusy(false);
  }

  async function makeGroup() {
    if (!groupName.trim()) return;
    setBusy(true);
    try {
      const g = await createGroup(groupName, groupEmoji);
      await pullSocial();
      setSheet(null);
      setGroupName("");
      router.push(`/groups/${g.id}`);
    } catch (e) {
      setProblem(e instanceof SocialError ? e.message : "Could not create that group.");
    }
    setBusy(false);
  }

  async function enterGroup() {
    setBusy(true);
    try {
      const g = await joinGroup(typed);
      await pullSocial();
      setSheet(null);
      setTyped("");
      router.push(`/groups/${g.id}`);
    } catch (e) {
      setProblem(e instanceof SocialError ? e.message : "Could not join that group.");
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Friends" subtitle="Your people, groups and shared work" />

      <div className="px-5">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
          {(["friends", "groups"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx(
                "h-9 rounded-lg text-sm font-medium capitalize transition",
                tab === t ? "bg-surface text-text shadow-sm" : "text-muted",
              )}
            >
              {t} {t === "friends" ? accepted.length || "" : (groups?.length ?? 0) || ""}
            </button>
          ))}
        </div>
      </div>

      {problem && (
        <p className="mx-5 mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">{problem}</p>
      )}

      {tab === "friends" ? (
        <div className="space-y-5 px-5 pt-4">
          {/* your code */}
          <section className="rounded-3xl bg-surface p-5 text-center shadow-[0_0_0_1px_var(--line)]">
            <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Your code</h2>
            <p className="mt-2 font-mono text-[28px] font-semibold tracking-[0.2em] tabular-nums">
              {code ?? "········"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Friends add you with this. Nobody can find you any other way.
            </p>
            {code && (
              <div className="mt-4 flex justify-center">
                <QrCode value={link} size={168} />
              </div>
            )}
            <div className="mt-4 flex gap-2.5">
              <Button variant="secondary" className="flex-1" size="sm" onClick={copyCode} disabled={!code}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button className="flex-1" size="sm" onClick={shareLink} disabled={!code}>
                <Share2 size={16} /> Share
              </Button>
            </div>
          </section>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setTyped("");
              setProblem(null);
              setSheet("add");
            }}
          >
            <UserPlus size={18} /> Add by code
          </Button>

          {requests.length > 0 && (
            <section>
              <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
                Wants to be friends
              </h2>
              <div className="overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                {requests.map((f, i) => (
                  <div key={f.id} className={cx("flex items-center gap-3 p-3.5", i > 0 && "border-t border-line")}>
                    <Avatar name={f.name} avatar={f.avatar} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      <p className="truncate text-[12.5px] text-muted">{describe(f)}</p>
                    </div>
                    <Button size="sm" onClick={() => accept(f)}>
                      Accept
                    </Button>
                    <button
                      onClick={() => setRemoving(f)}
                      aria-label={`Ignore ${f.name}`}
                      className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Friends</h2>
            {accepted.length === 0 ? (
              <EmptyState
                flush
                icon={Users}
                title="No friends yet"
                body="Share your code with someone sitting next to you, or scan theirs."
              />
            ) : (
              <div className="overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                {accepted.map((f, i) => (
                  <div key={f.id} className={cx("flex items-center gap-3 p-3.5", i > 0 && "border-t border-line")}>
                    <Avatar name={f.name} avatar={f.avatar} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      <p className="truncate text-[12.5px] text-muted">{describe(f)}</p>
                    </div>
                    {f.attendanceState && (
                      <span
                        className={cx(
                          "shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium",
                          STATE_TEXT[f.attendanceState],
                        )}
                      >
                        {ATTENDANCE_WORD[f.attendanceState]}
                      </span>
                    )}
                    <button
                      onClick={() => setRemoving(f)}
                      aria-label={`Remove ${f.name}`}
                      className="grid size-9 shrink-0 place-items-center rounded-full text-muted"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {sent.length > 0 && (
            <section>
              <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Waiting</h2>
              <div className="overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--line)]">
                {sent.map((f, i) => (
                  <div key={f.id} className={cx("flex items-center gap-3 p-3.5", i > 0 && "border-t border-line")}>
                    <Avatar name={f.name} avatar={f.avatar} size={38} />
                    <p className="min-w-0 flex-1 truncate text-[14.5px]">{f.name}</p>
                    <span className="text-[12.5px] text-muted">Request sent</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-4 px-5 pt-4">
          <div className="flex gap-2.5">
            <Button
              className="flex-1"
              size="sm"
              onClick={() => {
                setGroupName("");
                setProblem(null);
                setSheet("newGroup");
              }}
            >
              <Plus size={16} /> New group
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              size="sm"
              onClick={() => {
                setTyped("");
                setProblem(null);
                setSheet("joinGroup");
              }}
            >
              Join with code
            </Button>
          </div>

          {(groups?.length ?? 0) === 0 ? (
            <EmptyState
              flush
              icon={Users}
              title="No groups yet"
              body="Make one for your section or your project team. Whoever joins sees the assignments you post."
            />
          ) : (
            <div className="overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--line)]">
              {(groups ?? []).map((g, i) => (
                <Link
                  key={g.id}
                  href={`/groups/${g.id}`}
                  className={cx("flex items-center gap-3 p-4", i > 0 && "border-t border-line")}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[20px]">
                    {g.emoji ?? "👥"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="block text-[12.5px] text-muted">
                      {g.members} {g.members === 1 ? "person" : "people"} · code {g.code}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* sheets */}
      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Add a friend">
        <Field label="Their code">
          <input
            className={cx(inputCls, "font-mono tracking-[0.2em] uppercase")}
            value={typed}
            onChange={(e) => setTyped(cleanCode(e.target.value).slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && void lookUp()}
            placeholder="ABCD1234"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
          />
        </Field>
        <p className="-mt-2 mb-4 text-[12.5px] text-muted">
          Ask them to open Friends in DockIn, or point your camera at their QR code.
        </p>
        <Button className="w-full" onClick={lookUp} disabled={typed.length < 8 || busy}>
          Look up
        </Button>
      </Sheet>

      <ConfirmSheet
        open={sheet === "confirm"}
        title="Add this person?"
        confirmLabel="Send request"
        tone="primary"
        onConfirm={confirmAdd}
        onClose={() => setSheet("add")}
        busy={busy}
      >
        {preview && (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
            <Avatar name={preview.name} avatar={preview.avatar} size={46} />
            <div className="min-w-0">
              <p className="truncate font-medium text-text">{preview.name}</p>
              <p className="truncate text-[12.5px]">
                {[preview.branch, preview.year ? `Year ${preview.year}` : null].filter(Boolean).join(" · ") ||
                  "Student"}
              </p>
            </div>
          </div>
        )}
        <p>They see your name, your picture and anything you choose to share.</p>
      </ConfirmSheet>

      <Sheet open={sheet === "newGroup"} onClose={() => setSheet(null)} title="New group">
        <Field label="Name">
          <input
            className={inputCls}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value.slice(0, 50))}
            placeholder="CSE E2"
            autoFocus
          />
        </Field>
        <p className="mb-1.5 text-[13px] font-medium text-muted">Icon</p>
        <div className="mb-5 grid grid-cols-5 gap-2">
          {GROUP_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setGroupEmoji(e)}
              aria-label={`Use ${e}`}
              aria-pressed={groupEmoji === e}
              className={cx(
                "grid h-11 place-items-center rounded-xl text-[20px] transition",
                groupEmoji === e ? "bg-text" : "bg-surface-2",
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <Button className="w-full" onClick={makeGroup} disabled={!groupName.trim() || busy}>
          Create
        </Button>
      </Sheet>

      <Sheet open={sheet === "joinGroup"} onClose={() => setSheet(null)} title="Join a group">
        <Field label="Group code">
          <input
            className={cx(inputCls, "font-mono tracking-[0.2em] uppercase")}
            value={typed}
            onChange={(e) => setTyped(cleanCode(e.target.value).slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && void enterGroup()}
            placeholder="AB12CD"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Button className="w-full" onClick={enterGroup} disabled={typed.length < 6 || busy}>
          Join
        </Button>
      </Sheet>

      <ConfirmSheet
        open={!!removing}
        title={removing?.status === "pending" ? "Ignore this request?" : "Remove this friend?"}
        confirmLabel={removing?.status === "pending" ? "Ignore" : "Remove"}
        onConfirm={drop}
        onClose={() => setRemoving(null)}
        busy={busy}
      >
        <p>
          {removing?.status === "pending"
            ? `${removing?.name} will not be told. They can send another request later.`
            : `${removing?.name} will no longer see anything you share, and you will not see theirs.`}
        </p>
      </ConfirmSheet>
    </>
  );
}

function describe(f: Friend): string {
  return (
    [f.branch, f.year ? `Year ${f.year}` : null, f.section].filter(Boolean).join(" · ") || "Student"
  );
}
