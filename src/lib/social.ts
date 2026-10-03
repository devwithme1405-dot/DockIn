/**
 * Friends, groups and shared assignments.
 *
 * Everything here needs the network and a signed-in student. The local tables
 * (`friends`, `groups`, `shares`) are a cache of what the server lets you see,
 * refreshed on demand, so the screens still draw with no signal. Your own
 * reaction to a shared item lives in `shareState`, which syncs like the rest of
 * your data.
 *
 * You are only ever found by your code. Nothing here lets anyone look you up by
 * name or email.
 */

import { db } from "./db";
import { getSupabase } from "./supabase";
import { summarize, withBase } from "./attendance";
import { DOCX_MIME, renameFile, replaceInDocx, type Swap } from "./docx";
import type {
  AttendanceState,
  Friend,
  Group,
  MyProfile,
  Priority,
  Profile,
  Session,
  Share,
  ShareFile,
  TaskKind,
} from "./types";

const now = () => Date.now();

export class SocialError extends Error {}

/** Turns a Postgres error into something a student can act on. */
function readable(message: string): string {
  if (/no_such_code/.test(message)) return "That code did not match anyone.";
  if (/thats_you/.test(message)) return "That is your own code.";
  if (/no_such_group/.test(message)) return "No group has that code.";
  if (/group_full/.test(message)) return "That group is full.";
  if (/too_many_groups/.test(message)) return "You are in too many groups already.";
  if (/cannot use DockIn/.test(message)) return "This account cannot use DockIn.";
  if (/Failed to fetch|NetworkError/i.test(message)) return "No internet right now.";
  if (/relation .* does not exist|function .* does not exist|schema cache/i.test(message)) {
    return "Friends are not set up on the server yet.";
  }
  return message;
}

function client() {
  const sb = getSupabase();
  if (!sb) throw new SocialError("Cloud sync is not set up.");
  return sb;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new SocialError(readable(error.message));
  return data as T;
}

// ---------------------------------------------------------------------------
// Your own row in the directory
// ---------------------------------------------------------------------------

interface ProfileRow {
  user_id: string;
  code: string;
  name: string | null;
  avatar: string | null;
  branch: string | null;
  year: number | null;
  section: string | null;
  bio: string | null;
  attendance_state: AttendanceState | null;
  share_attendance: boolean;
}

/** Creates your directory row the first time, and hands back your code. */
export async function ensureProfile(): Promise<MyProfile> {
  const row = await rpc<ProfileRow | ProfileRow[]>("ensure_profile");
  const r = Array.isArray(row) ? row[0] : row;
  if (!r) throw new SocialError("Could not set up your profile.");
  return { code: r.code, shareAttendance: !!r.share_attendance };
}

/** Works out the one word friends are allowed to see about your attendance. */
export async function myAttendanceState(target: number): Promise<AttendanceState> {
  const [subjects, sessions] = await Promise.all([
    db.subjects.filter((s) => !s.deletedAt).toArray(),
    db.sessions.toArray(),
  ]);
  const live = new Set(subjects.map((s) => s.id));
  let all: Pick<Session, "status" | "weight">[] = sessions.filter((s) => live.has(s.subjectId));
  for (const subject of subjects) all = withBase(all, subject);
  return summarize(all, target).state;
}

/**
 * Publishes the handful of things friends may see. Called after sign-in and
 * whenever you change your details, so nobody has to press a sync button.
 */
export async function publishProfile(profile: Profile, shareAttendance: boolean): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new SocialError("You are not signed in.");
  await ensureProfile();
  const { error } = await sb
    .from("profiles")
    .update({
      name: profile.name ?? "",
      avatar: profile.avatar ?? null,
      branch: profile.branch ?? null,
      year: profile.year ?? null,
      section: profile.section ?? null,
      bio: profile.bio ?? null,
      share_attendance: shareAttendance,
      attendance_state: shareAttendance ? await myAttendanceState(profile.target) : null,
      updated_at: now(),
    })
    .eq("user_id", uid);
  if (error) throw new SocialError(readable(error.message));
}

export async function setShareAttendance(on: boolean, target: number): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new SocialError("You are not signed in.");
  const { error } = await sb
    .from("profiles")
    .update({
      share_attendance: on,
      attendance_state: on ? await myAttendanceState(target) : null,
      updated_at: now(),
    })
    .eq("user_id", uid);
  if (error) throw new SocialError(readable(error.message));
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export interface CodePreview {
  userId: string;
  name: string;
  avatar?: string;
  branch?: string;
  year?: number;
}

export const cleanCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Who a code belongs to, so you can check the name before sending a request. */
export async function peekCode(code: string): Promise<CodePreview | null> {
  const rows = await rpc<
    { user_id: string; name: string; avatar: string | null; branch: string | null; year: number | null }[]
  >("peek_code", { wanted: cleanCode(code) });
  const r = rows?.[0];
  if (!r) return null;
  return {
    userId: r.user_id,
    name: r.name || "A student",
    avatar: r.avatar ?? undefined,
    branch: r.branch ?? undefined,
    year: r.year ?? undefined,
  };
}

/** Sends a request, or accepts theirs if they already sent you one. */
export async function addFriend(code: string): Promise<"pending" | "accepted"> {
  const row = await rpc<{ status: "pending" | "accepted" } | { status: "pending" | "accepted" }[]>(
    "add_friend",
    { wanted: cleanCode(code) },
  );
  const r = Array.isArray(row) ? row[0] : row;
  return r?.status ?? "pending";
}

export async function acceptFriend(userId: string): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new SocialError("You are not signed in.");
  const [a, b] = me < userId ? [me, userId] : [userId, me];
  const { error } = await sb
    .from("friends")
    .update({ status: "accepted", updated_at: now() })
    .eq("a", a)
    .eq("b", b);
  if (error) throw new SocialError(readable(error.message));
  await db.friends.update(userId, { status: "accepted", theyAsked: false });
}

export async function removeFriend(userId: string): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new SocialError("You are not signed in.");
  const [a, b] = me < userId ? [me, userId] : [userId, me];
  const { error } = await sb.from("friends").delete().eq("a", a).eq("b", b);
  if (error) throw new SocialError(readable(error.message));
  await db.friends.delete(userId);
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function createGroup(name: string, emoji: string | null): Promise<Group> {
  const row = await rpc<Record<string, unknown> | Record<string, unknown>[]>("create_group", {
    group_name: name.trim().slice(0, 50),
    group_emoji: emoji,
  });
  const r = (Array.isArray(row) ? row[0] : row) as {
    id: string;
    name: string;
    emoji: string | null;
    code: string;
    owner: string;
  };
  const group: Group = { ...r, members: 1, updatedAt: now() };
  await db.groups.put(group);
  return group;
}

export async function joinGroup(code: string): Promise<Group> {
  const row = await rpc<Record<string, unknown> | Record<string, unknown>[]>("join_group", {
    wanted: cleanCode(code),
  });
  const r = (Array.isArray(row) ? row[0] : row) as {
    id: string;
    name: string;
    emoji: string | null;
    code: string;
    owner: string;
  };
  const group: Group = { ...r, members: 1, updatedAt: now() };
  await db.groups.put(group);
  return group;
}

export async function leaveGroup(groupId: string): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new SocialError("You are not signed in.");
  const { error } = await sb.from("group_members").delete().eq("group_id", groupId).eq("user_id", me);
  if (error) throw new SocialError(readable(error.message));
  await db.groups.delete(groupId);
  await db.shares.where("groupId").equals(groupId).delete();
}

export interface GroupPerson {
  userId: string;
  name: string;
  avatar?: string;
  branch?: string;
  year?: number;
  role: "owner" | "member";
}

export async function groupPeople(groupId: string): Promise<GroupPerson[]> {
  const rows = await rpc<
    {
      user_id: string;
      name: string | null;
      avatar: string | null;
      branch: string | null;
      year: number | null;
      role: "owner" | "member";
    }[]
  >("group_people", { gid: groupId });
  return (rows ?? []).map((r) => ({
    userId: r.user_id,
    name: r.name || "A student",
    avatar: r.avatar ?? undefined,
    branch: r.branch ?? undefined,
    year: r.year ?? undefined,
    role: r.role,
  }));
}

// ---------------------------------------------------------------------------
// Sharing an assignment
// ---------------------------------------------------------------------------

export interface ShareDraft {
  title: string;
  notes: string;
  kind: TaskKind;
  subjectName: string | null;
  dueDate: string | null;
  dueTime: string | null;
  room: string;
  priority: Priority;
  file?: ShareFile | null;
}

// ---------------------------------------------------------------------------
// The file on an assignment
// ---------------------------------------------------------------------------

const BUCKET = "assignments";
/** Ten megabytes, matching the bucket. Beyond that it is a drive link, not an upload. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Keeps a filename to characters that survive every phone, cloud and OS in between. */
function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(-80) || "assignment";
}

export function fileKind(name: string, type?: string): "docx" | "pdf" | null {
  if (/\.docx$/i.test(name) || type === DOCX_MIME) return "docx";
  if (/\.pdf$/i.test(name) || type === "application/pdf") return "pdf";
  return null;
}

/**
 * Puts the author's file in the private bucket.
 *
 * The object goes under the author's own user id, so it can be uploaded before
 * the post exists: an upload that is then abandoned is a stray file in their own
 * folder rather than a post nobody can open.
 */
export async function uploadAssignment(
  file: File,
  who: { name?: string; roll?: string } = {},
): Promise<ShareFile> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new SocialError("You are not signed in.");

  const type = fileKind(file.name, file.type);
  if (!type) throw new SocialError("Attach a Word file (.docx) or a PDF.");
  if (file.size > MAX_FILE_BYTES) throw new SocialError("That file is over 10 MB.");

  const name = safeName(file.name);
  const path = `${me}/${crypto.randomUUID()}/${name}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: type === "docx" ? DOCX_MIME : "application/pdf",
    upsert: false,
  });
  if (error) throw new SocialError(readableStorage(error.message));

  return {
    name,
    path,
    size: file.size,
    type,
    authorName: who.name?.trim() || undefined,
    authorRoll: who.roll?.trim() || undefined,
  };
}

/** Removes a file nobody is going to post after all. */
export async function dropAssignment(path: string): Promise<void> {
  try {
    await client().storage.from(BUCKET).remove([path]);
  } catch {
    /* a stray file in your own folder is not worth interrupting anyone over */
  }
}

/**
 * Downloads a shared file and, when it is a Word document and the reader has
 * said who they are, puts their name and roll in place of the author's — inside
 * the document and in the filename.
 *
 * The swap happens here, on the reader's phone: the author's file in the bucket
 * is never touched, so the same post can serve a whole class and the author can
 * always see exactly what they sent.
 */
export async function copyAssignment(
  file: ShareFile,
  me: { name?: string; roll?: string } = {},
): Promise<{ blob: Blob; name: string; personalised: boolean }> {
  const { data, error } = await client().storage.from(BUCKET).download(file.path);
  if (error || !data) throw new SocialError(readableStorage(error?.message ?? "download failed"));

  const swaps: Swap[] = [];
  if (file.authorName && me.name?.trim()) {
    swaps.push({ find: file.authorName, replace: me.name.trim() });
  }
  if (file.authorRoll && me.roll?.trim()) {
    swaps.push({ find: file.authorRoll, replace: me.roll.trim() });
  }

  const name = renameFile(file.name, swaps);
  if (file.type !== "docx" || swaps.length === 0) {
    return { blob: data, name, personalised: false };
  }

  try {
    return { blob: await replaceInDocx(data, swaps), name, personalised: true };
  } catch {
    // A document we cannot rewrite is still a document they need; hand over the
    // author's file under their own name and let the screen say so.
    return { blob: data, name, personalised: false };
  }
}

function readableStorage(message: string): string {
  if (/exceeded the maximum allowed size|Payload too large/i.test(message)) {
    return "That file is over 10 MB.";
  }
  if (/mime type .* is not supported/i.test(message)) return "Attach a Word file (.docx) or a PDF.";
  if (/Bucket not found/i.test(message)) return "File sharing is not set up on the server yet.";
  if (/Object not found/i.test(message)) return "That file is no longer there.";
  return readable(message);
}

/** Posts an assignment to a group, or sends it to the friends you picked. */
export async function shareTask(
  draft: ShareDraft,
  to: { groupId: string } | { friendIds: string[] },
): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new SocialError("You are not signed in.");

  const groupId = "groupId" in to ? to.groupId : null;
  const { data, error } = await sb
    .from("shares")
    .insert({
      author: me,
      group_id: groupId,
      kind: "task",
      data: draft,
      created_at: now(),
      updated_at: now(),
    })
    .select("id")
    .single();
  if (error) {
    // The file was uploaded before the post; with no post it can never be read,
    // so it goes rather than sitting there forever.
    if (draft.file) await dropAssignment(draft.file.path);
    throw new SocialError(readable(error.message));
  }

  if ("friendIds" in to && to.friendIds.length > 0) {
    const { error: tErr } = await sb
      .from("share_targets")
      .insert(to.friendIds.map((user_id) => ({ share_id: data.id, user_id })));
    if (tErr) {
      // Nobody can see a share with no audience, so take it back rather than
      // leaving a post that reached no one. Deleting the row takes its file with
      // it, through the trigger in migration 7.
      await sb.from("shares").delete().eq("id", data.id);
      if (draft.file) await dropAssignment(draft.file.path);
      throw new SocialError(readable(tErr.message));
    }
  }
  await pullSocial();
}

/** Withdraws something you posted, for everyone. */
export async function unshare(shareId: string): Promise<void> {
  const local = await db.shares.get(shareId);
  const { error } = await client().from("shares").delete().eq("id", shareId);
  if (error) throw new SocialError(readable(error.message));
  // The trigger on `shares` clears the object as well; this is the belt to its
  // braces, and the only path that runs when the trigger is not installed yet.
  if (local?.file) await dropAssignment(local.file.path);
  await db.shares.delete(shareId);
}

// ---------------------------------------------------------------------------
// Your own reaction to a shared item (synced with the rest of your data)
// ---------------------------------------------------------------------------

export async function setShareDone(shareId: string, done: boolean): Promise<void> {
  const t = now();
  const existing = await db.shareState.get(shareId);
  await db.shareState.put({
    ...(existing ?? { createdAt: t, submitted: false, submittedAt: null }),
    id: shareId,
    done,
    doneAt: done ? t : null,
    hidden: existing?.hidden ?? false,
    updatedAt: t,
    deletedAt: null,
  });
}

/**
 * Handed in on the LMS.
 *
 * Marking it submitted also marks it done: nobody submits an assignment they
 * have not finished, and making someone tick two boxes for one fact is how a
 * tracker ends up out of step with the truth.
 */
export async function setShareSubmitted(shareId: string, submitted: boolean): Promise<void> {
  const t = now();
  const existing = await db.shareState.get(shareId);
  await db.shareState.put({
    id: shareId,
    done: submitted ? true : (existing?.done ?? false),
    doneAt: submitted ? (existing?.doneAt ?? t) : (existing?.doneAt ?? null),
    hidden: existing?.hidden ?? false,
    submitted,
    submittedAt: submitted ? t : null,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
    deletedAt: null,
  });
}

export async function hideShare(shareId: string, hidden = true): Promise<void> {
  const t = now();
  const existing = await db.shareState.get(shareId);
  await db.shareState.put({
    id: shareId,
    done: existing?.done ?? false,
    doneAt: existing?.doneAt ?? null,
    submitted: existing?.submitted ?? false,
    submittedAt: existing?.submittedAt ?? null,
    hidden,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
    deletedAt: null,
  });
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

let pulling: Promise<void> | null = null;

/**
 * Pulls everything the server will show you into the local tables. Safe to call
 * from several screens at once; the calls share one request.
 */
export function pullSocial(): Promise<void> {
  if (!pulling) {
    pulling = doPull().finally(() => {
      pulling = null;
    });
  }
  return pulling;
}

async function doPull(): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new SocialError("You are not signed in.");

  const [people, groupRows, memberRows, profileRows, shareRows] = await Promise.all([
    sb.rpc("my_people"),
    sb.from("groups").select("id,name,emoji,code,owner,updated_at").is("deleted_at", null),
    sb.from("group_members").select("group_id,user_id"),
    sb.from("profiles").select("user_id,name,avatar"),
    sb
      .from("shares")
      .select("id,author,group_id,data,created_at,updated_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const firstError =
    people.error || groupRows.error || memberRows.error || profileRows.error || shareRows.error;
  if (firstError) throw new SocialError(readable(firstError.message));

  // --- friends
  const friends: Friend[] = (
    (people.data ?? []) as {
      user_id: string;
      name: string | null;
      avatar: string | null;
      branch: string | null;
      year: number | null;
      section: string | null;
      bio: string | null;
      attendance_state: AttendanceState | null;
      friend_status: "pending" | "accepted";
      requested_by: string;
    }[]
  ).map((r) => ({
    id: r.user_id,
    name: r.name || "A student",
    avatar: r.avatar ?? undefined,
    branch: r.branch ?? undefined,
    year: r.year ?? undefined,
    section: r.section ?? undefined,
    bio: r.bio ?? undefined,
    attendanceState: r.attendance_state ?? null,
    status: r.friend_status,
    theyAsked: r.requested_by !== me,
    updatedAt: now(),
  }));

  // --- groups, with how many people are in each
  const counts = new Map<string, number>();
  for (const m of (memberRows.data ?? []) as { group_id: string }[]) {
    counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
  }
  const groups: Group[] = (
    (groupRows.data ?? []) as {
      id: string;
      name: string;
      emoji: string | null;
      code: string;
      owner: string;
      updated_at: number;
    }[]
  ).map((g) => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    code: g.code,
    owner: g.owner,
    members: counts.get(g.id) ?? 1,
    updatedAt: g.updated_at ?? now(),
  }));

  // --- names for whoever posted something
  const names = new Map<string, { name: string; avatar?: string }>();
  for (const p of (profileRows.data ?? []) as {
    user_id: string;
    name: string | null;
    avatar: string | null;
  }[]) {
    names.set(p.user_id, { name: p.name || "A student", avatar: p.avatar ?? undefined });
  }
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  const shares: Share[] = (
    (shareRows.data ?? []) as {
      id: string;
      author: string;
      group_id: string | null;
      data: Partial<ShareDraft>;
      created_at: number;
      updated_at: number;
    }[]
  ).map((r) => {
    const who = names.get(r.author);
    return {
      id: r.id,
      author: r.author,
      authorName: r.author === me ? "You" : (who?.name ?? "A student"),
      authorAvatar: who?.avatar,
      groupId: r.group_id,
      groupName: r.group_id ? (groupName.get(r.group_id) ?? null) : null,
      title: String(r.data?.title ?? "Untitled"),
      notes: String(r.data?.notes ?? ""),
      kind: (r.data?.kind ?? "assignment") as TaskKind,
      subjectName: r.data?.subjectName ?? null,
      dueDate: r.data?.dueDate ?? null,
      dueTime: r.data?.dueTime ?? null,
      room: String(r.data?.room ?? ""),
      priority: (r.data?.priority ?? "normal") as Priority,
      file: r.data?.file ?? null,
      createdAt: r.created_at ?? now(),
      updatedAt: r.updated_at ?? now(),
    };
  });

  // Replace wholesale: the server is the authority on all three of these, so a
  // row that is gone from the server should disappear here too.
  await db.transaction("rw", [db.friends, db.groups, db.shares], async () => {
    await db.friends.clear();
    await db.groups.clear();
    await db.shares.clear();
    if (friends.length) await db.friends.bulkPut(friends);
    if (groups.length) await db.groups.bulkPut(groups);
    if (shares.length) await db.shares.bulkPut(shares);
  });
}

/** Everything local, for signing out. */
export async function clearSocial(): Promise<void> {
  await db.transaction("rw", [db.friends, db.groups, db.shares], async () => {
    await db.friends.clear();
    await db.groups.clear();
    await db.shares.clear();
  });
}
