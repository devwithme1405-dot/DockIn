"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Check,
  Cloud,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Sun,
} from "lucide-react";
import {
  TEXT_SCALES,
  TEXT_SCALE_LABELS,
  applyTextScale,
  applyTheme,
  exportAll,
  getProfile,
  resetAll,
  saveProfile,
} from "@/lib/repo";
import { AVATAR_EMOJIS, PALETTES, formatAvatar, gradientOf, parseAvatar } from "@/lib/avatars";
import { useExpenses, useTasks } from "@/lib/hooks";
import { fmtPct } from "@/lib/attendance";
import { fmtMoney, inMonth, monthKey, sum } from "@/lib/money";
import { toDateStr } from "@/lib/dates";
import type { ThemePref } from "@/lib/types";
import {
  Avatar,
  Button,
  ConfirmSheet,
  Field,
  STATE_TEXT,
  Sheet,
  cx,
  inputCls,
} from "@/components/ui";
import { BackHeader } from "@/components/PageHeader";
import { PhoneSetup } from "@/components/PhoneSetup";
import { ConnectCamu, ConnectLms } from "@/components/College";
import { useAttendanceData, useCollege } from "@/lib/college";
import { ProfileSkeleton } from "@/components/Skeleton";
import { SignIn } from "@/components/SignIn";
import { signOutCloud, updatePassword, useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { clearSyncState, flushNow, getSyncStatus, resetSyncStatus, subscribeSync } from "@/lib/sync";
import { clearSocial, ensureProfile, publishProfile } from "@/lib/social";
import { FRIENDS } from "@/lib/features";

type SheetName = "details" | "avatar" | "signin" | "password" | "logout" | null;
type BackupCheck = "idle" | "checking" | "ok" | "failed";

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

export default function ProfilePage() {
  const router = useRouter();
  const profile = useLiveQuery(() => getProfile(), []);
  const { session, configured } = useAuth();
  const sync = useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus);
  const { data } = useAttendanceData(profile?.target ?? 75);
  const tasks = useTasks();
  const expenses = useExpenses();

  const [sheet, setSheet] = useState<SheetName>(null);
  const [details, setDetails] = useState<{
    name: string;
    branch: string;
    year: string;
    section: string;
    roll: string;
    bio: string;
  } | null>(null);
  const [backup, setBackup] = useState<BackupCheck>("idle");
  const [busy, setBusy] = useState(false);
  const [shareAttendance, setShareAttendanceLocal] = useState<boolean | null>(null);

  const signedInNow = !!session;
  useEffect(() => {
    if (!FRIENDS || !configured || !signedInNow) return;
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
      roll: profile!.roll ?? "",
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
      roll: details.roll.trim().slice(0, 30) || undefined,
      bio: details.bio.trim().slice(0, 120),
    });
    setSheet(null);
    setDetails(null);
    if (FRIENDS && session) {
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

  async function download() {
    const blob = new Blob([await exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dockin-backup-${toDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openLogout() {
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
        <section className="notebook rings px-4 pb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSheet("avatar")}
              aria-label="Change profile picture"
              className="relative shrink-0 rounded-full transition active:scale-95"
            >
              <Avatar name={profile.name} avatar={profile.avatar} size={66} />
              <span className="absolute -right-0.5 -bottom-0.5 grid size-[22px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_0_0_2px_var(--card)]">
                <Pencil size={12} strokeWidth={2.6} />
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
              className="btn-paper lip-sm grid size-10 shrink-0 place-items-center rounded-full text-text"
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
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="radio"
                aria-checked={profile.theme === id}
                onClick={() => pickTheme(id)}
                className={cx(
                  "lip-sm flex h-11 items-center justify-center gap-1.5 rounded-full text-sm",
                  profile.theme === id ? "btn-leather" : "btn-paper",
                )}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-muted">System follows your phone and switches on its own.</p>

          <p className="mt-5 mb-1.5 text-[13px] font-medium text-muted">Text size</p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Text size">
            {TEXT_SCALES.map((scale, i) => (
              <button
                key={scale}
                role="radio"
                aria-checked={(profile.textScale ?? 1) === scale}
                onClick={() => pickTextScale(scale)}
                className={cx(
                  "lip-sm flex h-11 items-center justify-center rounded-full",
                  (profile.textScale ?? 1) === scale ? "btn-leather" : "btn-paper",
                )}
                style={{ fontSize: 11 + i * 1.5 }}
              >
                {TEXT_SCALE_LABELS[i]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-muted">Changes every screen in DockIn, not your other apps.</p>
        </Card>

        {/* account, as one line rather than a card: there is nothing to decide
            here, only something to know */}
        {configured && (
          <section className="lift rounded-3xl bg-surface p-4">
            {signedIn ? (
              <>
                <p className="flex items-center gap-2.5 text-[14px]" aria-live="polite">
                  <Cloud size={17} className={sync.state === "error" ? "text-danger" : "text-accent"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{session.user.email}</span>
                    <span className={cx("block text-[12.5px]", sync.state === "error" ? "text-danger" : "text-muted")}>
                      {syncLine}
                    </span>
                  </span>
                </p>
                <button
                  onClick={() => setSheet("password")}
                  className="mt-3 flex w-full items-center gap-2.5 border-t border-line pt-3 text-[14px] text-accent"
                >
                  <KeyRound size={16} /> Set or change password
                </button>
              </>
            ) : (
              <>
                <p className="text-[14px] text-muted">
                  Sign in to back your data up and use DockIn on more than one phone.
                </p>
                <Button className="mt-3" size="sm" onClick={() => setSheet("signin")}>
                  Sign in
                </Button>
              </>
            )}
          </section>
        )}

        {/* Camu and the LMS: only the app can read them */}
        <CollegeCard />

        {/* the phone's switches: payment reading and notifications */}
        <PhoneSetup />

        <Button variant="secondary" className="w-full" onClick={openLogout}>
          <LogOut size={18} /> Log out
        </Button>

        <p className="pb-2 text-center text-[12px] text-muted">DockIn · made for students</p>
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
            <Field label="Enrolment number">
              <input
                className={inputCls}
                value={details.roll}
                onChange={(e) => setDetails({ ...details, roll: e.target.value })}
                placeholder="E23CSEU0155"
                maxLength={30}
              />
              <span className="mt-1.5 block text-[12.5px] text-muted">
                Used to put your own name and roll on assignment files.
              </span>
            </Field>
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

      <Sheet open={sheet === "password"} onClose={close} title="Password">
        <SetPassword onDone={close} />
      </Sheet>

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

    </>
  );
}

/**
 * Set a password without leaving the app — the easy path for an account that
 * only ever signed in with a code before. He is already signed in here, so this
 * just writes the new password onto the same account; nothing by email.
 */
function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
    setTimeout(onDone, 1100);
  }

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-safe-soft px-3.5 py-3 text-[14px] font-medium text-safe">
        <Check size={18} strokeWidth={3} /> Password saved. Use it to sign in next time.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-[13.5px] text-muted">
        Set a password so you can sign in with just your email and password — no code to wait for.
      </p>
      <div className="relative">
        <input
          className={cx(inputCls, "pr-11")}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && password.length >= 6 && void save()}
          autoFocus
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <Button className="mt-4 w-full" onClick={save} disabled={busy || password.length < 6}>
        <KeyRound size={17} /> Save password
      </Button>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Card({ title, children, flush }: { title: string; children: ReactNode; flush?: boolean }) {
  return (
    <section className="lift rounded-3xl bg-surface p-4">
      <h2 className="mb-3 text-[12px] font-extrabold tracking-[0.08em] text-muted uppercase">{title}</h2>
      <div className={cx(flush && "-mx-1 divide-y divide-line")}>{children}</div>
    </section>
  );
}

function Stat({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <div className="lift min-w-0 rounded-2xl px-3 py-3">
      <p className={cx("font-display truncate text-[20px] font-extrabold leading-tight tabular-nums", ink)}>{value}</p>
      <p className="mt-0.5 text-[12px] leading-tight font-semibold text-muted">{label}</p>
    </div>
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

function CollegeCard() {
  const { native } = useCollege();
  if (!native) return null;
  return (
    <section className="lift rounded-3xl bg-surface px-4 pt-3.5 pb-1" aria-label="College accounts">
      <h2 className="text-[12px] font-extrabold tracking-[0.08em] text-muted uppercase">College</h2>
      <div className="border-b border-line">
        <ConnectCamu compact />
      </div>
      <ConnectLms compact />
    </section>
  );
}
