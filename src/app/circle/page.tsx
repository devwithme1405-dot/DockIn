"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  BellOff,
  Ban,
  MessageCircle,
  Pin,
  ScanLine,
  Copy,
  ExternalLink,
  Inbox,
  Plus,
  QrCode as QrIcon,
  Search,
  Share2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useFriends, useGroups, useReactions, useShareState, useShares, useSubjects } from "@/lib/hooks";
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
  blockUser,
  unblockUser,
  setShareAttendance,
  setShareSubmitted,
  type CodePreview,
} from "@/lib/social";
import { useAuth } from "@/lib/auth";
import { isCloudConfigured } from "@/lib/supabase";
import { toDateStr } from "@/lib/dates";
import { dueLabel } from "@/lib/tasks";
import type { Friend, Reaction, Share, ShareState } from "@/lib/types";
import {
  Avatar,
  Button,
  Chip,
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
import { ShareForm, ShareRow } from "@/components/ShareParts";
import { Faces } from "@/components/Reactions";
import { LMS_URL } from "@/components/AssignmentFile";
import { Segmented } from "@/components/Paper";
import { ChatView } from "@/components/ChatView";
import { QrScanner, type Scanned } from "@/components/QrScanner";
import { directThread, groupThread, otherIn, usePeople, useThreads, type ThreadId } from "@/lib/chat";

const ATTENDANCE_WORD = {
  safe: "Safe",
  warn: "Cutting it close",
  danger: "Below target",
  none: "Not tracking yet",
} as const;

const GROUP_EMOJIS = ["📚", "🧪", "💻", "🏠", "⚽", "🎓", "🎬", "🍜", "🎵", "🧠"];

type Tab = "chats" | "friends" | "groups" | "work";
const TABS = [
  ["chats", "Chats"],
  ["friends", "Friends"],
  ["groups", "Groups"],
  ["work", "Work"],
] as const;
type SheetName = "add" | "confirm" | "newGroup" | "joinGroup" | "me" | "share" | null;

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
  const shares = useShares();
  const states = useShareState();
  const reactions = useReactions();
  const subjects = useSubjects();
  const today = toDateStr();

  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get("tab");
    return t === "groups" || t === "work" || t === "friends" ? t : "chats";
  });
  // An open conversation lives in the address (?chat=…), so a notification can
  // open it and the phone's back button closes it.
  const chat = params.get("chat");
  const threads = useThreads();
  const people = usePeople();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Arriving from someone's QR (/circle?add=ABCD1234) opens the add sheet with
  // their code already in it.
  const incoming = cleanCode(params.get("add") ?? "");
  const joining = (params.get("join") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const [sheet, setSheet] = useState<SheetName>(incoming ? "add" : joining ? "joinGroup" : null);
  const [typed, setTyped] = useState(incoming || joining);
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupEmoji, setGroupEmoji] = useState(GROUP_EMOJIS[0]);
  const [removing, setRemoving] = useState<Friend | null>(null);
  const [blocking, setBlocking] = useState<Friend | null>(null);
  const blocked = useLiveQuery(() => db.blocks.toArray(), []);
  const [showing, setShowing] = useState<Friend | null>(null);
  const [find, setFind] = useState("");
  const [workFilter, setWorkFilter] = useState<"all" | "groups" | "direct" | "mine">("all");
  const [copied, setCopied] = useState(false);
  const [sharesAttendance, setSharesAttendance] = useState(false);

  const signedIn = !!session;
  const me = session?.user.id ?? null;

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const mine = await ensureProfile();
      setCode(mine.code);
      setSharesAttendance(mine.shareAttendance);
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

  const accepted = useMemo(() => (friends ?? []).filter((f) => f.status === "accepted"), [friends]);
  const requests = useMemo(
    () => (friends ?? []).filter((f) => f.status === "pending" && f.theyAsked),
    [friends],
  );
  const sent = useMemo(
    () => (friends ?? []).filter((f) => f.status === "pending" && !f.theyAsked),
    [friends],
  );

  /** Everything shared with you, soonest deadline first, finished ones last. */
  const work = useMemo(() => {
    const list = (shares ?? []).filter((s) => !states?.get(s.id)?.hidden);
    return list.sort((a, b) => {
      const as = states?.get(a.id)?.submitted ? 1 : 0;
      const bs = states?.get(b.id)?.submitted ? 1 : 0;
      if (as !== bs) return as - bs;
      return (
        (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") ||
        b.createdAt - a.createdAt
      );
    });
  }, [shares, states]);

  const toHandIn = work.filter((s) => !states?.get(s.id)?.submitted).length;
  const shownFriends = find.trim()
    ? accepted.filter((f) => f.name.toLowerCase().includes(find.trim().toLowerCase()))
    : accepted;
  const shownWork = work.filter((s) =>
    workFilter === "groups"
      ? !!s.groupId
      : workFilter === "direct"
        ? !s.groupId && s.author !== me
        : workFilter === "mine"
          ? s.author === me
          : true,
  );

  if (!isCloudConfigured) {
    return (
      <div className="page-wash">
        <PageHeader title="Friends" subtitle="Your people, groups and shared work" />
        <div className="px-5">
          <EmptyState
            flush
            icon={Users}
            title="Not available here"
            body="Friends and groups need the hosted version of DockIn."
          />
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="page-wash">
        <PageHeader title="Friends" subtitle="Your people, groups and shared work" />
        <ListSkeleton n={3} />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="page-wash">
        <PageHeader title="Friends" subtitle="Your people, groups and shared work" />
        <div className="px-5">
          {/* Signing in is a cost, so the screen says what it buys before it
              asks. Three lines, each one a thing you cannot do without it. */}
          <ul className="mb-5 space-y-3">
            {[
              [Share2, "Share an assignment once", "Everyone in your group gets it, with the file."],
              [Inbox, "Get your own copy", "Your name and roll swapped in, ready for the LMS."],
              [Users, "See how your friends are doing", "Only the word Safe or Below target, never the number."],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof Users;
              return (
                <li key={title as string} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-accent shadow-[0_0_0_1px_var(--line)]">
                    <I size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-medium">{title as string}</span>
                    <span className="block text-[12.5px] text-muted">{body as string}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <SignIn />
        </div>
      </div>
    );
  }

  const link = code
    ? `${typeof window === "undefined" ? "" : window.location.origin}/circle?add=${code}`
    : "";

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

  function openChat(thread: ThreadId) {
    const url = `/circle?chat=${encodeURIComponent(thread)}`;
    // A fresh state object: Next only treats a push as a navigation (and
    // updates useSearchParams) when the state is not its own.
    window.history.pushState({ dockinChat: true }, "", url);
  }

  function closeChat() {
    if ((window.history.state as { dockinChat?: boolean } | null)?.dockinChat) window.history.back();
    else window.history.replaceState({ dockinChat: false }, "", "/circle");
  }

  function onScanned(hit: Scanned) {
    setScanning(false);
    setProblem(null);
    setTyped(hit.code);
    if (hit.kind === "group") {
      setSheet("joinGroup");
      return;
    }
    void peekCode(hit.code)
      .then((found) => {
        if (!found) setProblem("That QR did not match anyone.");
        else {
          setPreview(found);
          setSheet("confirm");
        }
      })
      .catch((e) => setProblem(e instanceof SocialError ? e.message : "Could not check that code."));
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

  async function reject(f: Friend) {
    try {
      await removeFriend(f.id);
      await pullSocial();
      toast.show("Request rejected");
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not reject.");
    }
  }

  async function cancelRequest(f: Friend) {
    try {
      await removeFriend(f.id);
      await pullSocial();
      toast.show("Request cancelled");
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not cancel.");
    }
  }

  async function block() {
    if (!blocking) return;
    const f = blocking;
    setBlocking(null);
    try {
      await blockUser(f.id, f.name);
      await pullSocial();
      toast.show(`${f.name} is blocked`);
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not block.");
    }
  }

  async function unblock(id: string, name: string) {
    try {
      await unblockUser(id);
      toast.show(`${name} is unblocked`);
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not unblock.");
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

  async function toggleAttendance(on: boolean) {
    setSharesAttendance(on);
    try {
      const local = await getProfile();
      await setShareAttendance(on, local?.target ?? 75);
      toast.show(on ? "Friends can see your status" : "Attendance is private again");
    } catch (e) {
      setSharesAttendance(!on);
      toast.show(e instanceof SocialError ? e.message : "Could not change that.");
    }
  }

  return (
    <div className="page-wash">
      <PageHeader
        title="Friends"
        subtitle="Your people, groups and shared work"
        right={
          <div className="flex gap-2">
            <button
              onClick={() => setScanning(true)}
              aria-label="Scan a QR"
              className="btn-paper grid size-11 place-items-center rounded-full text-mess"
            >
              <ScanLine size={20} />
            </button>
            <button
              onClick={() => setSheet("me")}
              aria-label="Your code and adding friends"
              className="btn-leather grid size-11 place-items-center rounded-full"
            >
              <UserPlus size={20} />
            </button>
          </div>
        }
      />
      <div className="h-4" />

      {/* Three numbers, one surface. The counts are the reason to open a tab,
          so they belong above the tabs rather than inside them. */}
      <section
        className="mx-5 grid grid-cols-3 divide-x divide-line overflow-hidden lift rounded-3xl bg-surface"
        aria-label="Summary"
      >
        <Tally label="Friends" value={accepted.length} onClick={() => setTab("friends")} />
        <Tally label="Groups" value={groups?.length ?? 0} onClick={() => setTab("groups")} />
        <Tally
          label="To hand in"
          value={toHandIn}
          ink={toHandIn > 0 ? "text-accent" : undefined}
          onClick={() => setTab("work")}
        />
      </section>

      <Segmented value={tab} onChange={setTab} options={TABS} label="Friends sections" className="mx-5 mt-4" small />

      {requests.length > 0 && (
        <section className="mx-5 mt-4" aria-label="Friend requests">
          <p className="mb-2 text-[13px] font-bold tracking-wide text-mess uppercase">
            {requests.length} friend {requests.length === 1 ? "request" : "requests"}
          </p>
          <ul className="overflow-hidden rounded-3xl border-[1.5px] border-orange/50 bg-card">
            {requests.map((f, i) => (
              <li key={f.id} className={cx("flex items-center gap-3 p-3.5", i > 0 && "border-t border-line")}>
                <Avatar name={f.name} avatar={f.avatar} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{f.name}</p>
                  <p className="truncate text-[12.5px] text-muted">{describe(f)}</p>
                </div>
                <button onClick={() => void accept(f)} className="btn-leather h-9 rounded-full px-3.5 text-[13.5px]">
                  Accept
                </button>
                <button
                  onClick={() => void reject(f)}
                  aria-label={`Reject ${f.name}`}
                  className="btn-paper grid size-9 place-items-center rounded-full"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={() => setBlocking(f)}
                  aria-label={`Block ${f.name}`}
                  className="grid size-9 place-items-center rounded-full text-muted"
                >
                  <Ban size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {problem && (
        <p className="mx-5 mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">
          {problem}
        </p>
      )}

      {tab === "chats" && (
        <ChatList
          threads={threads ?? []}
          friends={accepted}
          groups={groups ?? []}
          people={people}
          me={me}
          onOpen={openChat}
          onAdd={() => setSheet("me")}
        />
      )}

      {tab === "friends" && (
        <div className="space-y-5 px-5 pt-4">
          <section>
            <SectionTitle>Friends</SectionTitle>
            {accepted.length > 6 && (
              <label className="mb-2 flex h-11 items-center gap-2.5 rounded-2xl bg-surface px-3.5 shadow-[0_0_0_1px_var(--line)] focus-within:shadow-[0_0_0_2px_var(--accent)]">
                <Search size={17} className="shrink-0 text-muted" />
                <input
                  className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
                  placeholder="Find a friend"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  aria-label="Find a friend"
                />
              </label>
            )}
            {accepted.length === 0 ? (
              <EmptyState
                flush
                icon={Users}
                title="Nobody yet"
                body="Tap the button at the top to show your code, or scan a friend's."
                action={
                  <Button size="sm" onClick={() => setSheet("me")}>
                    <QrIcon size={16} /> Show my code
                  </Button>
                }
              />
            ) : (
              <ul className="overflow-hidden lift rounded-3xl bg-surface">
                {shownFriends.map((f, i) => (
                  <li
                    key={f.id}
                    className={cx("flex items-center gap-3 p-3.5", i > 0 && "border-t border-line")}
                  >
                    <button
                      onClick={() => setShowing(f)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <Avatar name={f.name} avatar={f.avatar} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{f.name}</span>
                        <span className="block truncate text-[12.5px] text-muted">{describe(f)}</span>
                      </span>
                    </button>
                    {f.attendanceState && f.attendanceState !== "none" && (
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
                  </li>
                ))}
              </ul>
            )}
          </section>

          {sent.length > 0 && (
            <section>
              <SectionTitle>Waiting</SectionTitle>
              <ul className="overflow-hidden lift rounded-3xl bg-surface">
                {sent.map((f, i) => (
                  <li
                    key={f.id}
                    className={cx("flex items-center gap-3 p-3.5", i > 0 && "border-t border-line")}
                  >
                    <Avatar name={f.name} avatar={f.avatar} size={38} />
                    <p className="min-w-0 flex-1 truncate text-[14.5px]">{f.name}</p>
                    <span className="text-[12.5px] text-muted">Sent</span>
                    <button
                      onClick={() => void cancelRequest(f)}
                      className="btn-paper h-9 rounded-full px-3 text-[13px] font-semibold"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(blocked?.length ?? 0) > 0 && (
            <section>
              <SectionTitle>Blocked</SectionTitle>
              <ul className="overflow-hidden rounded-3xl border-[1.5px] border-card-edge bg-card">
                {(blocked ?? []).map((b, i) => (
                  <li key={b.id} className={cx("flex items-center gap-3 p-3.5", i > 0 && "border-t border-line")}>
                    <Ban size={18} className="shrink-0 text-muted" />
                    <p className="min-w-0 flex-1 truncate text-[14.5px]">{b.name}</p>
                    <button onClick={() => void unblock(b.id, b.name)} className="btn-paper h-9 rounded-full px-3 text-[13px] font-semibold">
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* This belongs with the people who would see it, not in a settings
              screen three taps away. */}
          <label className="flex items-center gap-3 lift rounded-3xl bg-surface p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2">
              <Share2 size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">Show friends my attendance</span>
              <span className="block text-[12.5px] text-muted">
                Only the word Safe, Cutting it close or Below target. Never the number.
              </span>
            </span>
            <input
              type="checkbox"
              className="size-6 shrink-0 accent-accent"
              checked={sharesAttendance}
              onChange={(e) => void toggleAttendance(e.target.checked)}
            />
          </label>
        </div>
      )}

      {tab === "groups" && (
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
            <ul className="space-y-3">
              {(groups ?? []).map((g) => {
                const open = (shares ?? []).filter(
                  (s) =>
                    s.groupId === g.id &&
                    !states?.get(s.id)?.submitted &&
                    !states?.get(s.id)?.hidden,
                ).length;
                return (
                  <li key={g.id}>
                    <button
                      onClick={() => openChat(groupThread(g.id))}
                      className="flex w-full items-center gap-3.5 lift rounded-3xl bg-surface p-4 text-left transition active:scale-[0.99]"
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[22px]">
                        {g.emoji ?? "👥"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-medium">{g.name}</span>
                        <span className="mt-1 flex items-center gap-2">
                          <Faces people={g.faces ?? []} total={g.members} />
                          <span className="truncate text-[12.5px] text-muted">
                            {g.members} {g.members === 1 ? "person" : "people"} · {g.code}
                          </span>
                        </span>
                      </span>
                      {open > 0 && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent tabular-nums">
                          {open} open
                        </span>
                      )}
                      <MessageCircle size={18} className="shrink-0 text-mess" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "work" && (
        <div className="space-y-4 px-5 pt-4">
          {work.length > 3 && (
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
              {(
                [
                  ["all", "Everything"],
                  ["groups", "From groups"],
                  ["direct", "Sent to me"],
                  ["mine", "Mine"],
                ] as const
              ).map(([id, label]) => (
                <Chip key={id} active={workFilter === id} onClick={() => setWorkFilter(id)}>
                  {label}
                </Chip>
              ))}
            </div>
          )}
          {shownWork.length === 0 ? (
            <EmptyState
              flush
              icon={Inbox}
              title="Nothing shared yet"
              body="Assignments you or your friends post land here, with the file and a place to tick off the LMS."
              action={
                <Button size="sm" onClick={() => setSheet("share")}>
                  <Plus size={16} /> Share one
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {shownWork.map((s) => (
                <SubmissionCard
                  key={s.id}
                  share={s}
                  state={states?.get(s.id)}
                  mine={s.author === me}
                  me={me}
                  reactions={reactions?.get(s.id) ?? []}
                  today={today}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {(tab === "work" || tab === "groups") && (
        <button
          onClick={() => setSheet("share")}
          aria-label="Share an assignment"
          className="fixed right-[max(1.25rem,calc((100vw-28rem)/2+1.25rem))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-[0_10px_28px_-6px_rgba(31,95,214,0.65)] transition active:scale-95"
        >
          <Share2 size={23} />
        </button>
      )}

      {/* sheets */}
      <Sheet open={sheet === "me"} onClose={() => setSheet(null)} title="Add a friend">
        <div className="rounded-3xl bg-surface-2 p-5 text-center">
          <p className="font-mono text-[26px] font-semibold tracking-[0.2em] tabular-nums">
            {code ?? "········"}
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
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
        </div>

        <p className="mt-5 mb-1.5 text-[13px] font-medium text-muted">Or add someone by their code</p>
        <div className="flex gap-2.5">
          <input
            className={cx(inputCls, "font-mono tracking-[0.2em] uppercase")}
            value={typed}
            onChange={(e) => setTyped(cleanCode(e.target.value).slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && void lookUp()}
            placeholder="ABCD1234"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <Button onClick={lookUp} disabled={typed.length < 8 || busy}>
            Find
          </Button>
        </div>
      </Sheet>

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
        <Button className="w-full" onClick={lookUp} disabled={typed.length < 8 || busy}>
          Look up
        </Button>
      </Sheet>

      <Sheet open={sheet === "share"} onClose={() => setSheet(null)} title="Share an assignment">
        <ShareForm
          groups={groups ?? []}
          subjects={subjects ?? []}
          friends={accepted}
          onDone={() => {
            setSheet(null);
            setTab("work");
            void refresh();
          }}
        />
      </Sheet>

      <ConfirmSheet
        open={sheet === "confirm"}
        title="Add this person?"
        confirmLabel="Send request"
        tone="primary"
        onConfirm={confirmAdd}
        onClose={() => setSheet("me")}
        busy={busy}
      >
        {preview && (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
            <Avatar name={preview.name} avatar={preview.avatar} size={46} />
            <div className="min-w-0">
              <p className="truncate font-medium text-text">{preview.name}</p>
              <p className="truncate text-[12.5px]">
                {[preview.branch, preview.year ? `Year ${preview.year}` : null]
                  .filter(Boolean)
                  .join(" · ") || "Student"}
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

      <Sheet open={!!showing} onClose={() => setShowing(null)} title={showing?.name ?? "Friend"}>
        {showing && (
          <>
            <div className="flex items-center gap-4">
              <Avatar name={showing.name} avatar={showing.avatar} size={64} />
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold">{showing.name}</p>
                <p className="truncate text-[13px] text-muted">{describe(showing)}</p>
                {showing.attendanceState && showing.attendanceState !== "none" && (
                  <p className={cx("mt-1 text-[13px] font-medium", STATE_TEXT[showing.attendanceState])}>
                    {ATTENDANCE_WORD[showing.attendanceState]}
                  </p>
                )}
              </div>
            </div>
            {showing.bio && <p className="mt-4 text-[14px] text-muted">{showing.bio}</p>}

            <dl className="mt-5 grid grid-cols-2 gap-2.5">
              <Fact
                label="Shared with you"
                value={String((shares ?? []).filter((s) => s.author === showing.id).length)}
              />
              <Fact
                label="Groups together"
                value={String(
                  (groups ?? []).filter((g) => (g.faces ?? []).some((p) => p.id === showing.id))
                    .length,
                )}
              />
            </dl>

            <Button
              className="mt-5 w-full"
              onClick={() => {
                const f = showing;
                setShowing(null);
                if (me) openChat(directThread(me, f.id));
              }}
            >
              <MessageCircle size={17} /> Message
            </Button>
            <Button
              variant="secondary"
              className="mt-2.5 w-full"
              onClick={() => {
                setShowing(null);
                setTab("work");
              }}
            >
              See what they shared
            </Button>
            <button
              onClick={() => {
                setRemoving(showing);
                setShowing(null);
              }}
              className="mx-auto mt-3 flex h-10 items-center gap-1.5 text-[14px] font-medium text-danger"
            >
              <X size={15} /> Remove friend
            </button>
            <button
              onClick={() => {
                setBlocking(showing);
                setShowing(null);
              }}
              className="mx-auto flex h-10 items-center gap-1.5 text-[14px] font-medium text-muted"
            >
              <Ban size={15} /> Block
            </button>
          </>
        )}
      </Sheet>

      <ConfirmSheet
        open={!!blocking}
        title={`Block ${blocking?.name ?? ""}?`}
        confirmLabel="Block"
        onConfirm={() => void block()}
        onClose={() => setBlocking(null)}
      >
        They won&apos;t be able to send you requests or message you, and your friendship ends. They are not told.
        You can unblock them later from Friends.
      </ConfirmSheet>

      {chat && me && (() => {
        const gid = chat.startsWith("g:") ? chat.slice(2) : null;
        const g = gid ? (groups ?? []).find((x) => x.id === gid) : null;
        const fid = otherIn(chat, me);
        const f = fid ? people.get(fid) : null;
        return (
          <ChatView
            key={chat}
            thread={chat}
            title={g ? g.name : (f?.name ?? "Chat")}
            subtitle={g ? `${g.members} ${g.members === 1 ? "person" : "people"} · code ${g.code}` : "Friend"}
            emoji={g ? (g.emoji ?? "👥") : null}
            people={people}
            groupId={gid}
            friendId={fid}
            onClose={closeChat}
            onInfo={gid ? () => router.push(`/groups/${gid}`) : undefined}
          />
        );
      })()}

      {scanning && (
        <QrScanner onResult={onScanned} onClose={() => setScanning(false)} myLink={link} myCode={code} />
      )}

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
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
      <dd className="text-[20px] font-semibold leading-none tabular-nums">{value}</dd>
      <dt className="mt-1 text-[12px] text-muted">{label}</dt>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">{children}</h2>
  );
}

function Tally({
  label,
  value,
  ink,
  onClick,
}: {
  label: string;
  value: number;
  ink?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="px-3 py-3.5 text-center transition active:scale-[0.97]">
      <p className={cx("text-[22px] font-semibold leading-none tabular-nums", ink)}>{value}</p>
      <p className="mt-1.5 text-[12px] text-muted">{label}</p>
    </button>
  );
}

/**
 * One shared assignment, all the way to handed in.
 *
 * Getting the file and submitting it are two different days' work, and the one
 * that gets forgotten is the second — so the card tracks both, and the LMS is a
 * tap away rather than a thing you remember to go and do.
 */
function SubmissionCard({
  share,
  state,
  mine,
  me,
  reactions,
  today,
  onChanged,
}: {
  share: Share;
  state?: ShareState;
  mine: boolean;
  me: string | null;
  reactions: Reaction[];
  today: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const submitted = !!state?.submitted;

  async function toggle() {
    await setShareSubmitted(share.id, !submitted);
    if (!submitted) toast.show("Marked as handed in");
    onChanged();
  }

  return (
    <li
      className={cx(
        "overflow-hidden rounded-3xl shadow-[0_0_0_1px_var(--line)]",
        submitted ? "bg-surface-2" : "bg-surface",
      )}
    >
      <ShareRow
        share={share}
        state={state}
        mine={mine}
        reactions={reactions}
        me={me}
        onChanged={onChanged}
      />

      <div className="flex items-center gap-2 border-t border-line px-3.5 py-2.5">
        <span className="min-w-0 flex-1 text-[12.5px] text-muted">
          {submitted
            ? "Handed in on the LMS"
            : share.dueDate
              ? dueLabel(
                  { dueDate: share.dueDate, dueTime: share.dueTime } as never,
                  today,
                )
              : "No deadline"}
        </span>
        {!submitted && (
          <a
            href={LMS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12.5px] font-medium"
          >
            Open LMS <ExternalLink size={13} />
          </a>
        )}
        <button
          onClick={toggle}
          className={cx(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium",
            submitted ? "bg-surface text-muted" : "bg-safe text-white",
          )}
        >
          <Check size={13} /> {submitted ? "Undo" : "Handed in"}
        </button>
      </div>
    </li>
  );
}

function describe(f: Friend): string {
  return (
    [f.branch, f.year ? `Year ${f.year}` : null, f.section].filter(Boolean).join(" · ") || "Student"
  );
}

function ago(ms: number): string {
  const d = new Date(ms);
  if (toDateStr(d) === toDateStr()) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Conversations, newest first; friends and groups you have not talked to yet sit below. */
function ChatList({
  threads,
  friends,
  groups,
  people,
  me,
  onOpen,
  onAdd,
}: {
  threads: import("@/lib/chat").ThreadSummary[];
  friends: Friend[];
  groups: import("@/lib/types").Group[];
  people: Map<string, import("@/lib/chat").ChatPerson>;
  me: string | null;
  onOpen: (t: ThreadId) => void;
  onAdd: () => void;
}) {
  if (!me) return null;
  const seen = new Set(threads.map((t) => t.thread));
  const groupBy = new Map(groups.map((g) => [g.id, g]));
  const rows = [
    ...threads
      .map((t) => {
        const gid = t.thread.startsWith("g:") ? t.thread.slice(2) : null;
        const g = gid ? groupBy.get(gid) : null;
        if (gid && !g) return null; // left that group
        const fid = otherIn(t.thread, me);
        const name = g ? g.name : (people.get(fid ?? "")?.name ?? "Friend");
        const who = t.last.author === me ? "You: " : g ? `${people.get(t.last.author)?.name?.split(" ")[0] ?? "Someone"}: ` : "";
        const d = t.last.data;
        const text = t.last.deleted
          ? "Message deleted"
          : t.last.kind === "task"
            ? `📌 ${d?.title ?? "Task"}`
            : t.last.kind === "poll"
              ? `📊 ${d?.question ?? "Poll"}`
              : t.last.kind === "file"
                ? `📄 ${d?.name ?? "Document"}`
                : t.last.body;
        const empty = !t.last.id;
        return {
          thread: t.thread,
          name,
          emoji: g ? (g.emoji ?? "👥") : null,
          preview: empty ? (g ? "Start the group chat" : "Say hi 👋") : who + text,
          when: empty ? "" : ago(t.last.createdAt),
          unread: t.unread,
          pinned: t.pinned,
          muted: t.muted,
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r),
    ...groups
      .filter((g) => !seen.has(groupThread(g.id)))
      .map((g) => ({ thread: groupThread(g.id), name: g.name, emoji: g.emoji ?? "👥", preview: "Start the group chat", when: "", unread: 0, pinned: false, muted: false })),
    ...friends
      .filter((f) => !seen.has(directThread(me, f.id)))
      .map((f) => ({ thread: directThread(me, f.id), name: f.name, emoji: null, preview: "Say hi 👋", when: "", unread: 0, pinned: false, muted: false })),
  ];

  if (rows.length === 0)
    return (
      <div className="px-5 pt-4">
        <EmptyState
          flush
          icon={MessageCircle}
          title="No chats yet"
          body="Add friends with your QR or code, or make a group for your section."
          action={
            <Button size="sm" onClick={onAdd}>
              <UserPlus size={16} /> Add a friend
            </Button>
          }
        />
      </div>
    );

  return (
    <ul className="mx-5 mt-4 divide-y divide-line/70 overflow-hidden rounded-3xl border-[1.5px] border-card-edge bg-card">
      {rows.map((r) => (
        <li key={r.thread}>
          <button onClick={() => onOpen(r.thread)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-mess-soft text-[20px] font-bold text-mess">
              {r.emoji ?? r.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[15.5px] font-bold">{r.name}</span>
                {r.pinned && <Pin size={13} className="shrink-0 text-mess" aria-label="Pinned" />}
                {r.muted && <BellOff size={13} className="shrink-0 text-muted" aria-label="Muted" />}
                <span className={cx("shrink-0 text-[11.5px]", r.unread ? "font-bold text-orange" : "text-muted")}>{r.when}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className={cx("min-w-0 flex-1 truncate text-[13.5px]", r.unread ? "font-semibold text-text" : "text-muted")}>
                  {r.preview}
                </span>
                {r.unread > 0 && (
                  <span
                    className={cx(
                      "grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white",
                      r.muted ? "bg-muted" : "bg-orange",
                    )}
                  >
                    {r.unread > 99 ? "99+" : r.unread}
                  </span>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
