"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Camera,
  Check,
  ChevronRight,
  Cloud,
  Download,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Share2,
  Smartphone,
  Sun,
  Trash2,
  Users,
  Upload,
} from "lucide-react";
import {
  TEXT_SCALES,
  TEXT_SCALE_LABELS,
  applyTextScale,
  applyTheme,
  exportAll,
  getProfile,
  importAll,
  resetAll,
  saveProfile,
} from "@/lib/repo";
import { AVATAR_EMOJIS, PALETTES, formatAvatar, gradientOf, parseAvatar } from "@/lib/avatars";
import { useAttendanceStats, useExpenses, useTasks } from "@/lib/hooks";
import { fmtPct } from "@/lib/attendance";
import { fmtMoney, inMonth, monthKey, sum } from "@/lib/money";
import { toDateStr } from "@/lib/dates";
import type { ThemePref } from "@/lib/types";
import {
  Avatar,
  Button,
  Chip,
  ConfirmSheet,
  Field,
  STATE_TEXT,
  Sheet,
  cx,
  inputCls,
  useToast,
} from "@/components/ui";
import Link from "next/link";
import { BackHeader } from "@/components/PageHeader";
import { ProfileSkeleton } from "@/components/Skeleton";
import { SignIn } from "@/components/SignIn";
import { signOutCloud, useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { clearSyncState, flushNow, getSyncStatus, resetSyncStatus, subscribeSync } from "@/lib/sync";
import { SocialError, clearSocial, ensureProfile, publishProfile, setShareAttendance } from "@/lib/social";

type SheetName = "details" | "avatar" | "signin" | "logout" | "delete" | "restore" | "install" | null;
type BackupCheck = "idle" | "checking" | "ok" | "failed";

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

function isInstalled(): boolean {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const profile = useLiveQuery(() => getProfile(), []);
  const { session, configured } = useAuth();
  const sync = useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus);
  const data = useAttendanceStats(profile?.target ?? 75);
  const tasks = useTasks();
  const expenses = useExpenses();

  const [sheet, setSheet] = useState<SheetName>(null);
  const [details, setDetails] = useState<{
    name: string;
    branch: string;
    year: string;
    section: string;
    bio: string;
  } | null>(null);
  const [budgetText, setBudgetText] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupCheck>("idle");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; counts: string } | null>(null);
  const [installed] = useState(isInstalled);
  const [shareAttendance, setShareAttendanceLocal] = useState<boolean | null>(null);

  const signedInNow = !!session;
  useEffect(() => {
    if (!configured || !signedInNow) return;
    // Make sure the directory row exists and find out what it currently shares.
    void Promise.resolve().then(async () => {
      try {
        const mine = await ensureProfile();
        setShareAttendanceLocal(mine.shareAttendance);
      } catch {
        /* offline: the switch stays off until we can ask */
      }
    });
  }, [configured, signedInNow]);
  const fileRef = useRef<HTMLInputElement>(null);

  const monthSpent = useMemo(() => {
    if (!expenses) return null;
    return sum(inMonth(expenses, monthKey(toDateStr())));
  }, [expenses]);
  const tasksDone = tasks ? tasks.filter((t) => t.done).length : null;

  if (!profile)
    return (
      <>
        <BackHeader href="/" backLabel="Today" title="Profile" hideLargeTitle />
        <ProfileSkeleton />
      </>
    );

  const close = () => {
    if (busy) return;
    setSheet(null);
    setProblem(null);
  };

  // ---------- actions ----------

  function pickTheme(t: ThemePref) {
    applyTheme(t);
    void saveProfile({ theme: t });
  }

  function openDetails() {
    setDetails({
      name: profile!.name,
      branch: profile!.branch ?? "",
      year: profile!.year ? String(profile!.year) : "",
      section: profile!.section ?? "",
      bio: profile!.bio ?? "",
    });
    setSheet("details");
  }

  async function saveDetails() {
    if (!details) return;
    const name = details.name.trim();
    if (!name) return;
    const year = Number(details.year);
    await saveProfile({
      name,
      branch: details.branch.trim().slice(0, 40),
      year: year >= 1 && year <= 5 ? year : undefined,
      section: details.section.trim().slice(0, 12),
      bio: details.bio.trim().slice(0, 120),
    });
    setSheet(null);
    setDetails(null);
    if (session) {
      const fresh = await getProfile();
      if (fresh) void publishProfile(fresh, shareAttendance ?? false).catch(() => {});
    }
  }

  function pickAvatar(next: { emoji: string | null; palette: number }) {
    void saveProfile({
      avatar: formatAvatar({ kind: next.emoji ? "emoji" : "initial", emoji: next.emoji, palette: next.palette }),
    });
  }

  function pickTextScale(scale: number) {
    applyTextScale(scale);
    void saveProfile({ textScale: scale });
  }

  async function saveBudget() {
    if (budgetText === null) return;
    const n = Math.round(Number(budgetText.replace(/[^\d.]/g, "")));
    setBudgetText(null);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return;
    await saveProfile({ budget: n });
    toast.show(n > 0 ? "Monthly budget saved" : "Budget cleared");
  }

  async function toggleAttendanceSharing(on: boolean) {
    setShareAttendanceLocal(on);
    try {
      await setShareAttendance(on, profile!.target);
      toast.show(on ? "Friends can see your status" : "Attendance is private again");
    } catch (e) {
      setShareAttendanceLocal(!on);
      toast.show(e instanceof SocialError ? e.message : "Could not change that.");
    }
  }

  async function syncNow() {
    const sb = getSupabase();
    if (sb && session) await flushNow(sb, session.user.id);
  }

  async function download() {
    const blob = new Blob([await exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dockin-backup-${toDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onPickFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.show("That file is too big to be a DockIn backup");
      return;
    }
    const text = await file.text();
    try {
      const j = JSON.parse(text);
      if (j?.app !== "dockin") throw new Error();
      const n = (k: string) => (Array.isArray(j[k]) ? j[k].filter((r: { deletedAt?: number }) => !r?.deletedAt).length : 0);
      setPending({
        text,
        counts: `${n("subjects")} subjects, ${n("tasks")} tasks, ${n("expenses")} expenses and ${n("events")} calendar events`,
      });
      setProblem(null);
      setSheet("restore");
    } catch {
      toast.show("That file is not a DockIn backup");
    }
  }

  async function restore() {
    if (!pending) return;
    setBusy(true);
    try {
      await importAll(pending.text);
      setPending(null);
      setSheet(null);
      toast.show("Backup restored");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not restore that file.");
    }
    setBusy(false);
  }

  function openLogout() {
    setProblem(null);
    setSheet("logout");
    const sb = getSupabase();
    if (sb && session) {
      setBackup("checking");
      void flushNow(sb, session.user.id).then((ok) => setBackup(ok ? "ok" : "failed"));
    } else {
      setBackup("idle");
    }
  }

  async function leave() {
    setBusy(true);
    if (session) await signOutCloud();
    await resetAll();
    await clearSocial();
    clearSyncState();
    resetSyncStatus();
    try {
      localStorage.removeItem("dockin-theme");
    } catch {}
    applyTheme("system");
    router.replace("/onboarding");
  }

  async function wipe() {
    setBusy(true);
    setProblem(null);
    if (session) {
      const sb = getSupabase();
      const { error } = sb ? await sb.from("sync_records").delete().eq("user_id", session.user.id) : { error: null };
      if (error) {
        setProblem("Could not delete your cloud copy. Check your internet and try again.");
        setBusy(false);
        return;
      }
      clearSyncState();
    }
    await resetAll();
    try {
      localStorage.removeItem("dockin-theme");
    } catch {}
    applyTheme("system");
    router.replace("/onboarding");
  }

  // ---------- derived ----------

  const overall = data?.overall;
  const since = new Date(profile.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  const signedIn = !!session;
  const syncLine =
    sync.state === "syncing"
      ? "Syncing…"
      : sync.state === "error"
        ? `Could not sync: ${sync.error}`
        : sync.last
          ? `Backed up at ${new Date(sync.last).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
          : "Waiting to sync";

  return (
    <>
      <BackHeader href="/" backLabel="Today" title="Profile" hideLargeTitle />

      <div className="space-y-5 px-5 pt-3">
        {/* identity */}
        <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSheet("avatar")}
              aria-label="Change profile picture"
              className="relative shrink-0 rounded-full transition active:scale-95"
            >
              <Avatar name={profile.name} avatar={profile.avatar} size={64} />
              <span className="absolute -right-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full bg-surface text-muted shadow-[0_0_0_1px_var(--line)]">
                <Camera size={13} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
                {profile.name || "Your name"}
              </h1>
              <p className="truncate text-[13px] text-muted">
                {[profile.branch, profile.year ? `Year ${profile.year}` : null, profile.section]
                  .filter(Boolean)
                  .join(" · ") || (signedIn ? session.user.email : "Saved on this phone only")}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">Using DockIn since {since}</p>
            </div>
            <button
              onClick={openDetails}
              aria-label="Edit your details"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-text"
            >
              <Pencil size={17} />
            </button>
          </div>
          {profile.bio && <p className="mt-3 text-[14px] text-muted">{profile.bio}</p>}
        </section>

        {/* real numbers */}
        <section className="grid grid-cols-3 gap-2.5" aria-label="Your numbers">
          <Stat
            label="Attendance"
            value={overall ? fmtPct(overall.pct) : "--"}
            ink={overall ? STATE_TEXT[overall.state] : "text-muted"}
          />
          <Stat label="Tasks done" value={tasksDone === null ? "--" : String(tasksDone)} ink="text-safe" />
          <Stat label="Spent this month" value={monthSpent === null ? "--" : fmtMoney(monthSpent)} ink="text-text" />
        </section>

        {/* appearance */}
        <Card title="Appearance">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="radio"
                aria-checked={profile.theme === id}
                onClick={() => pickTheme(id)}
                className={cx(
                  "flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition",
                  profile.theme === id ? "bg-surface text-text shadow-sm" : "text-muted",
                )}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-muted">System follows your phone and switches on its own.</p>

          <p className="mt-5 mb-1.5 text-[13px] font-medium text-muted">Text size</p>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Text size">
            {TEXT_SCALES.map((scale, i) => (
              <button
                key={scale}
                role="radio"
                aria-checked={(profile.textScale ?? 1) === scale}
                onClick={() => pickTextScale(scale)}
                className={cx(
                  "flex h-11 items-center justify-center rounded-lg font-medium transition",
                  (profile.textScale ?? 1) === scale ? "bg-surface text-text shadow-sm" : "text-muted",
                )}
                style={{ fontSize: 11 + i * 1.5 }}
              >
                {TEXT_SCALE_LABELS[i]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-muted">Changes every screen in DockIn, not your other apps.</p>
        </Card>

        {/* preferences */}
        <Card title="Preferences">
          <p className="mb-1.5 text-[13px] font-medium text-muted">Required attendance</p>
          <div className="flex flex-wrap gap-2">
            {[65, 70, 75, 80, 85].map((t) => (
              <Chip key={t} active={profile.target === t} onClick={() => void saveProfile({ target: t })}>
                {t}%
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted">Bunk budget and warnings use this number.</p>

          <div className="mt-5">
            <Field label="Monthly budget (rupees)">
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">₹</span>
                <input
                  className={cx(inputCls, "pl-8")}
                  inputMode="numeric"
                  placeholder="Not set"
                  value={budgetText ?? (profile.budget ? String(profile.budget) : "")}
                  onChange={(e) => setBudgetText(e.target.value)}
                  onBlur={saveBudget}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
              </div>
            </Field>
            <p className="-mt-2 text-[12.5px] text-muted">Shown on the Money screen with a daily pace.</p>
          </div>
        </Card>

        {/* account */}
        {configured && (
          <Card title="Account and backup">
            {signedIn ? (
              <>
                <p className="flex items-center gap-2 text-[14px]" aria-live="polite">
                  <Cloud size={16} className={sync.state === "error" ? "text-danger" : "text-safe"} />
                  <span className={sync.state === "error" ? "text-danger" : "text-muted"}>{syncLine}</span>
                </p>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  Your data syncs to your Bennett account, so a new phone gets everything back when you sign in.
                </p>
                <Button className="mt-3" variant="secondary" size="sm" onClick={syncNow} disabled={sync.state === "syncing"}>
                  Sync now
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Sign in with your Bennett email to back up your data and use DockIn on more than one phone.
                </p>
                <Button className="mt-3" size="sm" onClick={() => setSheet("signin")}>
                  Sign in
                </Button>
              </>
            )}
          </Card>
        )}

        {/* friends */}
        {configured && signedIn && (
          <Card title="Friends and groups">
            <Link
              href="/circle"
              className="flex min-h-14 items-center gap-3 px-1 py-2.5 text-left"
              onClick={() => void ensureProfile().catch(() => {})}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-text">
                <Users size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">Your friends and groups</span>
                <span className="block truncate text-[12.5px] text-muted">
                  Share assignments with your class
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </Link>

            <label className="mt-1 flex items-center gap-3 border-t border-line px-1 pt-3.5 pb-1">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-text">
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
                checked={shareAttendance ?? false}
                onChange={(e) => void toggleAttendanceSharing(e.target.checked)}
              />
            </label>
          </Card>
        )}

        {/* data */}
        <Card title="Your data" flush>
          <Row icon={Download} title="Download backup" hint="A file with everything in DockIn" onClick={download} />
          <Row icon={Upload} title="Restore from backup" hint="Replace this phone's data with a backup file" onClick={() => fileRef.current?.click()} />
          {!installed && (
            <Row icon={Smartphone} title="Add to home screen" hint="Opens like a real app, even offline" onClick={() => setSheet("install")} />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
        </Card>

        <div className="space-y-2.5 pt-1">
          <Button variant="secondary" className="w-full" onClick={openLogout}>
            <LogOut size={18} /> Log out
          </Button>
          <button
            onClick={() => {
              setProblem(null);
              setSheet("delete");
            }}
            className="mx-auto flex h-10 items-center gap-1.5 text-[14px] font-medium text-danger"
          >
            <Trash2 size={15} /> Delete all my data
          </button>
        </div>

        <p className="pb-2 text-center text-[12px] text-muted">DockIn · made for Bennett students</p>
      </div>

      {/* sheets */}
      <Sheet open={sheet === "details"} onClose={close} title="Your details">
        {details && (
          <>
            <Field label="Name">
              <input
                className={inputCls}
                value={details.name}
                onChange={(e) => setDetails({ ...details, name: e.target.value })}
                autoComplete="given-name"
                autoFocus
              />
            </Field>
            <Field label="Course or branch">
              <input
                className={inputCls}
                value={details.branch}
                onChange={(e) => setDetails({ ...details, branch: e.target.value })}
                placeholder="BTech CSE"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Year">
                <select
                  className={inputCls}
                  value={details.year}
                  onChange={(e) => setDetails({ ...details, year: e.target.value })}
                >
                  <option value="">Not set</option>
                  {[1, 2, 3, 4, 5].map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Section">
                <input
                  className={inputCls}
                  value={details.section}
                  onChange={(e) => setDetails({ ...details, section: e.target.value })}
                  placeholder="E1"
                />
              </Field>
            </div>
            <Field label="About you">
              <input
                className={inputCls}
                value={details.bio}
                onChange={(e) => setDetails({ ...details, bio: e.target.value })}
                placeholder="Second year, runs on chai"
                maxLength={120}
              />
            </Field>
            <Button className="w-full" onClick={saveDetails} disabled={!details.name.trim()}>
              Save
            </Button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet === "avatar"} onClose={close} title="Profile picture">
        <AvatarPicker name={profile.name} avatar={profile.avatar} onPick={pickAvatar} />
      </Sheet>

      <Sheet open={sheet === "signin"} onClose={close} title="Sign in">
        <SignIn />
      </Sheet>

      <Sheet open={sheet === "install"} onClose={close} title="Add to home screen">
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-muted">
          <li>
            <span className="text-text">iPhone:</span> open DockIn in Safari, tap Share, then Add to Home Screen.
          </li>
          <li>
            <span className="text-text">Android:</span> open in Chrome, tap the menu, then Install app.
          </li>
        </ol>
      </Sheet>

      <ConfirmSheet
        open={sheet === "restore"}
        title="Restore this backup?"
        confirmLabel="Replace my data"
        onConfirm={restore}
        onClose={close}
        busy={busy}
      >
        <p>
          This backup has {pending?.counts}. Restoring replaces everything currently on this phone.
        </p>
        {problem && <p className="text-danger">{problem}</p>}
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === "logout"}
        title="Log out of DockIn?"
        confirmLabel={backup === "failed" ? "Log out anyway" : signedIn ? "Log out" : "Log out and erase"}
        onConfirm={leave}
        onClose={close}
        busy={busy || backup === "checking"}
        extra={
          !signedIn && (
            <Button variant="secondary" className="w-full" onClick={download}>
              <Download size={17} /> Download backup first
            </Button>
          )
        }
      >
        {signedIn ? (
          <>
            <p>
              You will go back to the welcome screen. Your data stays safe in your account and returns when you sign
              in again.
            </p>
            <p
              className={cx(
                "rounded-xl px-3 py-2 text-[13.5px]",
                backup === "failed" ? "bg-danger-soft text-danger" : "bg-surface-2",
              )}
              aria-live="polite"
            >
              {backup === "checking" && "Backing up your latest changes…"}
              {backup === "ok" && "Everything is backed up."}
              {backup === "failed" && "Your latest changes could not be uploaded (no internet?). Logging out now will lose them."}
            </p>
          </>
        ) : (
          <p>
            You are not signed in, so your data lives only on this phone. Logging out erases it and returns you to the
            welcome screen. Download a backup first if you want to keep it.
          </p>
        )}
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === "delete"}
        title="Delete all your data?"
        confirmLabel="Delete everything"
        onConfirm={wipe}
        onClose={close}
        busy={busy}
      >
        <p>
          {signedIn
            ? "This erases your attendance, money, tasks and calendar from this phone and from your account. It cannot be undone."
            : "This erases your attendance, money, tasks and calendar from this phone. It cannot be undone."}
        </p>
        {problem && <p className="text-danger">{problem}</p>}
      </ConfirmSheet>
    </>
  );
}

function Card({ title, children, flush }: { title: string; children: ReactNode; flush?: boolean }) {
  return (
    <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
      <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <div className={cx(flush && "-mx-1 divide-y divide-line")}>{children}</div>
    </section>
  );
}

function Stat({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface px-3 py-3 shadow-[0_0_0_1px_var(--line)]">
      <p className={cx("truncate text-[20px] font-semibold leading-tight tabular-nums", ink)}>{value}</p>
      <p className="mt-0.5 text-[12px] leading-tight text-muted">{label}</p>
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  icon: typeof Download;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-1 py-2.5 text-left">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-text">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block truncate text-[12.5px] text-muted">{hint}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </button>
  );
}

/** Pick a colour, then either keep your initial or choose an emoji. */
function AvatarPicker({
  name,
  avatar,
  onPick,
}: {
  name: string;
  avatar?: string;
  onPick: (next: { emoji: string | null; palette: number }) => void;
}) {
  const look = parseAvatar(avatar, name);
  const [palette, setPalette] = useState(look.palette);
  const [emoji, setEmoji] = useState<string | null>(look.emoji);

  function choose(next: { emoji?: string | null; palette?: number }) {
    const e = next.emoji === undefined ? emoji : next.emoji;
    const p = next.palette === undefined ? palette : next.palette;
    setEmoji(e);
    setPalette(p);
    onPick({ emoji: e, palette: p });
  }

  return (
    <div>
      <div className="flex justify-center pb-5">
        <Avatar name={name} avatar={formatAvatar({ kind: emoji ? "emoji" : "initial", emoji, palette })} size={88} />
      </div>

      <p className="mb-2 text-[13px] font-medium text-muted">Colour</p>
      <div className="flex flex-wrap gap-2.5">
        {PALETTES.map((_, i) => (
          <button
            key={i}
            onClick={() => choose({ palette: i })}
            aria-label={`Colour ${i + 1}`}
            aria-pressed={palette === i}
            className={cx(
              "grid size-10 place-items-center rounded-full text-white transition",
              palette === i && "ring-2 ring-text ring-offset-2 ring-offset-surface",
            )}
            style={{ background: gradientOf(i) }}
          >
            {palette === i && <Check size={16} />}
          </button>
        ))}
      </div>

      <p className="mt-5 mb-2 text-[13px] font-medium text-muted">Picture</p>
      <div className="grid grid-cols-6 gap-2">
        <button
          onClick={() => choose({ emoji: null })}
          aria-label="Use your initial"
          aria-pressed={emoji === null}
          className={cx(
            "grid h-11 place-items-center rounded-xl text-[15px] font-semibold transition",
            emoji === null ? "bg-text text-bg" : "bg-surface-2 text-text",
          )}
        >
          {(name.trim()[0] ?? "?").toUpperCase()}
        </button>
        {AVATAR_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => choose({ emoji: e })}
            aria-label={`Use ${e}`}
            aria-pressed={emoji === e}
            className={cx(
              "grid h-11 place-items-center rounded-xl text-[20px] transition",
              emoji === e ? "bg-text" : "bg-surface-2",
            )}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
