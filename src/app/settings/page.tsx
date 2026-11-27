"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Check,
  ChevronRight,
  Cloud,
  Download,
  Eye,
  EyeOff,
  GraduationCap,
  IdCard,
  Info,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Pencil,
  School,
  ShieldCheck,
  Sparkles,
  DoorOpen,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  TEXT_SCALES,
  TEXT_SCALE_LABELS,
  normTextScale,
  applyTextScale,
  applyTheme,
  exportAll,
  getProfile,
  resetAll,
  saveProfile,
} from "@/lib/repo";
import { cropPhoto } from "@/components/PhotoCropper";
import { AVATAR_EMOJIS, PALETTES, formatAvatar, gradientOf, parseAvatar, uploadAvatarPhoto } from "@/lib/avatars";
import { toDateStr } from "@/lib/dates";
import type { ThemePref } from "@/lib/types";
import {
  Avatar,
  Button,
  ConfirmSheet,
  Field,
  Sheet,
  cx,
  inputCls,
} from "@/components/ui";
import { BackHeader } from "@/components/PageHeader";
import { PhoneSetup, phoneChecklist, usePhoneStatus } from "@/components/PhoneSetup";
import { ConnectApprover, ConnectCamu, ConnectLms } from "@/components/College";
import { disconnect, useCollege } from "@/lib/college";
import { isNativeApp } from "@/lib/native";
import { ProfileSkeleton } from "@/components/Skeleton";
import { SignIn } from "@/components/SignIn";
import { accountName, deleteAccount, signOutCloud, updatePassword, useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { clearSyncState, flushNow, getSyncStatus, resetSyncStatus, subscribeSync } from "@/lib/sync";
import { clearSocial, ensureProfile, publishProfile } from "@/lib/social";
import { FRIENDS } from "@/lib/features";
import { clearChat } from "@/lib/chat";
import { forgetPushToken } from "@/lib/push";
import { UpdatesSheet } from "@/components/UpdatesSheet";
import { usePreview } from "@/lib/v3/flags";
import { openOutpass } from "@/lib/v3/ui";
import { LATEST, RELEASES } from "@/lib/changelog";

type SheetName =
  | "details"
  | "avatar"
  | "signin"
  | "password"
  | "logout"
  | "delete"
  | "appearance"
  | "phone"
  | "college"
  | "backup"
  | "about"
  | "updates"
  | null;
type BackupCheck = "idle" | "checking" | "ok" | "failed";

// Which release the Updates row last showed as read ("New: …" until opened).
const SEEN_KEY = "dockin-updates-seen";
const seenListeners = new Set<() => void>();
function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return LATEST;
  }
}
function markUpdatesSeen() {
  try {
    localStorage.setItem(SEEN_KEY, LATEST);
  } catch {
    /* private mode */
  }
  seenListeners.forEach((f) => f());
}
function subscribeSeen(f: () => void) {
  seenListeners.add(f);
  return () => seenListeners.delete(f);
}

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
  const seenUpdates = useSyncExternalStore(subscribeSeen, readSeen, () => LATEST);
  const preview = usePreview();

  const [sheet, setSheet] = useState<SheetName>(null);
  const phone = usePhoneStatus();
  const checks = phone.status ? phoneChecklist(phone.status) : [];
  const phoneOff = checks.filter((c) => !c.on).length;
  const phoneLine = !phone.status
    ? "Checking…"
    : phoneOff === 0
      ? "Everything is on"
      : `${phoneOff} of ${checks.length} still off — reminders may not reach you`;

  // /settings#phone opens the permissions straight away.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#phone") void Promise.resolve().then(() => setSheet("phone"));
  }, []);
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
  const [delPass, setDelPass] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);

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

  if (!profile)
    return (
      <>
        <BackHeader href="/" backLabel="Today" title="Profile" hideLargeTitle />
        <ProfileSkeleton />
      </>
    );

  const closePhone = () => {
    setSheet(null);
    phone.reload();
    if (typeof window !== "undefined" && window.location.hash === "#phone") history.replaceState(null, "", window.location.pathname);
  };
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

  async function setAvatar(avatar: string) {
    await saveProfile({ avatar });
    // Friends see it everywhere (chats, requests, groups) from their next pull.
    if (FRIENDS && session) {
      const fresh = await getProfile();
      if (fresh) void publishProfile(fresh, shareAttendance ?? false).catch(() => {});
    }
  }

  function pickAvatar(next: { emoji: string | null; palette: number }) {
    void setAvatar(formatAvatar({ kind: next.emoji ? "emoji" : "initial", emoji: next.emoji, palette: next.palette }));
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

  // Everything that returns this phone to a blank slate: the college sign-ins
  // (so the next person to use this phone inherits nothing), the local data, and
  // the theme. Shared by logging out and by deleting the account.
  async function wipeDevice() {
    if (isNativeApp()) {
      await disconnect("camu").catch(() => {});
      await disconnect("lms").catch(() => {});
    }
    await resetAll();
    await clearSocial();
    await clearChat();
    clearSyncState();
    resetSyncStatus();
    try {
      localStorage.removeItem("dockin-theme");
      localStorage.removeItem("dockin-camu-periods");
    } catch {}
    applyTheme("light", false);
    router.replace("/onboarding");
  }

  async function leave() {
    setBusy(true);
    // Before signing out: this phone must stop getting this account's pushes.
    await forgetPushToken().catch(() => {});
    if (session) await signOutCloud();
    await wipeDevice();
  }

  async function removeAccount() {
    setDelErr(null);
    setBusy(true);
    const err = await deleteAccount(delPass);
    if (err) {
      setDelErr(err);
      setBusy(false);
      return;
    }
    setDelPass("");
    await wipeDevice();
  }

  // ---------- derived ----------

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

      <div className="stagger space-y-4 px-5 pt-1">
        {/* identity: the picture large, on a soft lavender wash */}
        <section className="relative -mx-5 px-5 pt-2 pb-3">
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-accent opacity-[0.16]"
            viewBox="0 0 400 100"
            preserveAspectRatio="none"
          >
            <path d="M0 70 C 90 40, 170 100, 260 62 S 380 30, 400 18 L400 100 L0 100 Z" fill="currentColor" />
          </svg>
          <div className="relative flex items-center gap-4">
            <button
              onClick={() => setSheet("avatar")}
              aria-label="Change profile picture"
              className="pop-in relative shrink-0 rounded-full p-[5px] shadow-[0_6px_18px_rgba(110,50,15,0.28)] transition active:scale-95"
              style={{ background: "linear-gradient(145deg, var(--card), color-mix(in oklab, var(--accent) 22%, var(--card)))" }}
            >
              <Avatar name={profile.name} avatar={profile.avatar} size={96} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display truncate text-[26px] leading-tight font-extrabold tracking-tight">
                {profile.name || "Your name"}
              </h1>
              {(profile.branch || profile.year) && (
                <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent">
                  <GraduationCap size={15} className="shrink-0" />
                  <span className="truncate">
                    {[profile.branch, profile.year ? `(${ordinal(profile.year)} Year)` : null].filter(Boolean).join(" ")}
                  </span>
                </p>
              )}
              <p className="mt-1.5 text-[13px] font-medium text-muted">Using DockIn since {since}</p>
            </div>
            <button
              onClick={openDetails}
              aria-label="Edit your details"
              className="btn-leather lip-sm grid size-11 shrink-0 place-items-center self-start rounded-full"
            >
              <Pencil size={18} />
            </button>
          </div>
        </section>

        {/* details, on the spiral pad */}
        <section className="notebook rings px-4 pb-1">
          <ul>
            <DetailRow icon={IdCard} label="Roll No." value={profile.roll} onAdd={openDetails} />
            <DetailRow icon={GraduationCap} label="Year" value={profile.year ? `${ordinal(profile.year)} year` : undefined} onAdd={openDetails} />
          </ul>
          {profile.bio && <p className="border-t border-line py-3 text-[14px] text-muted">{profile.bio}</p>}
        </section>

        {/* DockIn 3 preview build only: the outpass */}
        {preview && (
          <section className="space-y-2.5" aria-label="DockIn 3 preview">
            <p className="px-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">DockIn 3 · test build</p>
            <MenuRow icon={DoorOpen} title="Outpass" sub="Day out & leave, and your history" onClick={() => openOutpass("new")} />
          </section>
        )}

        {/* everything else, one row per kind, each opening its own sheet */}
        <nav className="space-y-2.5" aria-label="Settings">
          <MenuRow
            icon={Palette}
            title="Appearance"
            sub={`${THEMES.find((t) => t.id === profile.theme)?.label ?? "System"} theme · ${TEXT_SCALE_LABELS[(TEXT_SCALES as readonly number[]).indexOf(normTextScale(profile.textScale))] ?? "Normal"} text`}
            onClick={() => setSheet("appearance")}
          />
          {phone.native && (
            <MenuRow
              icon={ShieldCheck}
              title="Phone permissions"
              sub={phoneLine}
              alert={phoneOff > 0}
              onClick={() => setSheet("phone")}
            />
          )}
          {phone.native && (
            <MenuRow icon={School} title="College accounts" sub="Camu and the LMS" onClick={() => setSheet("college")} />
          )}
          {configured && (
            <MenuRow
              icon={Cloud}
              title="Backup & Sync"
              sub={signedIn ? syncLine : "Not signed in — data is on this phone only"}
              alert={sync.state === "error"}
              onClick={() => setSheet("backup")}
            />
          )}
          <MenuRow
            icon={Sparkles}
            title="Updates"
            sub={seenUpdates === LATEST ? "What's new and what's coming" : `New: ${RELEASES[0].title}`}
            onClick={() => {
              markUpdatesSeen();
              setSheet("updates");
            }}
          />
          <MenuRow
            icon={Info}
            title="About DockIn"
            sub={phone.status?.version ? `Version ${phone.status.version}` : "Made for students"}
            onClick={() => setSheet("about")}
          />
        </nav>

        <button
          onClick={openLogout}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-danger text-[16px] font-semibold text-danger active:bg-danger-soft"
        >
          <LogOut size={19} /> Log out
        </button>

        {signedIn && (
          <button
            onClick={() => {
              setDelPass("");
              setDelErr(null);
              setSheet("delete");
            }}
            className="mt-1 flex h-11 w-full items-center justify-center gap-2 text-[14px] font-semibold text-muted active:text-danger"
          >
            <Trash2 size={17} /> Delete account permanently
          </button>
        )}

        <p className="pb-2 text-center text-[12px] text-muted">DockIn · made for students</p>
      </div>

      <Sheet open={sheet === "appearance"} onClose={close} title="Appearance">
        <p className="mb-1.5 text-[13px] font-medium text-muted">Theme</p>
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

        {isNativeApp() && (
          <>
            <p className="mt-5 mb-1.5 text-[13px] font-medium text-muted">Home-screen widgets</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Widget theme">
              {THEMES.map(({ id, label, icon: Icon }) => {
                const on = (profile.widgetTheme ?? "light") === id;
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => void saveProfile({ widgetTheme: id })}
                    className={cx("lip-sm flex h-11 items-center justify-center gap-1.5 rounded-full text-sm", on ? "btn-leather" : "btn-paper")}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">Light by default. System makes them dark when your phone is in dark mode.</p>
          </>
        )}

        <p className="mt-5 mb-1.5 text-[13px] font-medium text-muted">Text size</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Text size">
          {TEXT_SCALES.map((scale, i) => (
            <button
              key={scale}
              role="radio"
              aria-checked={normTextScale(profile.textScale) === scale}
              onClick={() => pickTextScale(scale)}
              className={cx(
                "lip-sm flex h-11 items-center justify-center rounded-full",
                normTextScale(profile.textScale) === scale ? "btn-leather" : "btn-paper",
              )}
              style={{ fontSize: 11 + i * 1.5 }}
            >
              {TEXT_SCALE_LABELS[i]}
            </button>
          ))}
        </div>
        <p className="mt-2 mb-2 text-[12.5px] text-muted">Changes every screen in DockIn, not your other apps.</p>
      </Sheet>

      <Sheet open={sheet === "phone"} onClose={closePhone} title="Phone permissions">
        <PhoneSetup bare />
      </Sheet>

      <Sheet open={sheet === "college"} onClose={close} title="College accounts">
        <CollegeCard />
      </Sheet>

      <Sheet open={sheet === "backup"} onClose={close} title="Backup & Sync">
        {signedIn ? (
          <>
            <p className="flex items-center gap-2.5 text-[14px]" aria-live="polite">
              <Cloud size={17} className={sync.state === "error" ? "text-danger" : "text-accent"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{accountName(session.user.email)}</span>
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
            <p className="text-[14px] text-muted">Sign in to back your data up and use DockIn on more than one phone.</p>
            <Button className="mt-3" size="sm" onClick={() => setSheet("signin")}>
              Sign in
            </Button>
          </>
        )}
        <Button variant="secondary" className="mt-4 mb-2 w-full" onClick={download}>
          <Download size={17} /> Download a copy of my data
        </Button>
      </Sheet>

      <Sheet open={sheet === "updates"} onClose={close} title="Updates">
        <UpdatesSheet
          version={phone.status?.version}
          onUpdate={() => {
            close();
            // AppUpdate listens for this and opens its Update popup at once.
            window.dispatchEvent(new CustomEvent("dockin-open", { detail: "/?update=1" }));
          }}
        />
      </Sheet>

      <Sheet open={sheet === "about"} onClose={close} title="About DockIn">
        <p className="text-[14px] leading-relaxed text-muted">
          Attendance and assignments for college, in one place. Camu and the LMS are read on
          this phone and stay on it.
        </p>
        <p className="mt-3 mb-2 text-[13px] text-muted">
          {phone.status ? `App ${phone.status.version || "?"} · Android build ${phone.status.sdk}` : "Web version"}
        </p>
      </Sheet>

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
            <div>
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
        <AvatarPicker
          name={profile.name}
          avatar={profile.avatar}
          onPick={pickAvatar}
          canUpload={!!session}
          onPhoto={async (file) => {
            const key = await uploadAvatarPhoto(file, profile.avatar);
            await setAvatar(key);
          }}
          onRemovePhoto={() => pickAvatar({ emoji: null, palette: parseAvatar(undefined, profile.name).palette })}
        />
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

      <Sheet open={sheet === "delete"} onClose={close} title="Delete account permanently">
        <p className="text-[14px] leading-relaxed text-muted">
          This erases your account and everything in it from the server — attendance, tasks and settings — and cannot
          be undone. Camu and the LMS are disconnected on this phone, and your username frees up to be used again.
        </p>
        <label className="mt-4 block text-[13px] font-semibold text-muted">Enter your password to confirm</label>
        <input
          type="password"
          value={delPass}
          onChange={(e) => setDelPass(e.target.value)}
          placeholder="Your password"
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-2xl border-[1.5px] border-card-edge bg-card px-4 py-3 text-[15px] outline-none focus:border-danger"
        />
        {delErr && (
          <p className="mt-2 text-[13px] font-medium text-danger" aria-live="polite">
            {delErr}
          </p>
        )}
        <div className="mt-4 flex gap-2.5">
          <button onClick={close} disabled={busy} className="btn-paper h-12 flex-1 rounded-2xl text-[15px] font-bold">
            Cancel
          </button>
          <button
            onClick={removeAccount}
            disabled={busy || !delPass}
            className="h-12 flex-1 rounded-2xl bg-danger text-[15px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </Sheet>
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

/** Pick a colour, then either keep your initial or choose an emoji. */
function AvatarPicker({
  name,
  avatar,
  onPick,
  canUpload,
  onPhoto,
  onRemovePhoto,
}: {
  name: string;
  avatar?: string;
  onPick: (next: { emoji: string | null; palette: number }) => void;
  canUpload: boolean;
  onPhoto: (file: File) => Promise<void>;
  onRemovePhoto: () => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const hasPhoto = avatar?.startsWith("p:") ?? false;
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
      <div className="flex flex-col items-center pb-5">
        <Avatar name={name} avatar={hasPhoto ? avatar : formatAvatar({ kind: emoji ? "emoji" : "initial", emoji, palette })} size={96} />
        {canUpload ? (
          <div className="mt-3 flex gap-2">
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const picked = e.target.files?.[0];
                e.target.value = "";
                if (!picked) return;
                const f = await cropPhoto(picked);
                if (!f) return;
                setUploading(true);
                setPhotoErr(null);
                try {
                  await onPhoto(f);
                } catch (err) {
                  setPhotoErr(err instanceof Error ? err.message : "Could not upload the photo.");
                }
                setUploading(false);
              }}
            />
            <button
              onClick={() => photoInput.current?.click()}
              disabled={uploading}
              className="btn-leather h-10 rounded-full px-4 text-[14px] disabled:opacity-60"
            >
              {uploading ? "Uploading…" : hasPhoto ? "Change photo" : "Upload photo"}
            </button>
            {hasPhoto && (
              <button onClick={onRemovePhoto} className="btn-paper h-10 rounded-full px-4 text-[14px] font-bold">
                Remove
              </button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-muted">Sign in to add a photo.</p>
        )}
        {photoErr && <p className="mt-2 text-[12.5px] text-danger">{photoErr}</p>}
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
    <section className="space-y-2.5 pb-2" aria-label="College accounts">
      <ConnectCamu compact />
      <ConnectApprover compact />
      <ConnectLms compact />
    </section>
  );
}

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

function DetailRow({
  icon: Icon,
  label,
  value,
  onAdd,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onAdd?: () => void;
}) {
  return (
    <li className="flex items-center gap-3.5 border-b border-line py-3 last:border-b-0">
      <Icon size={22} className="shrink-0 text-accent" strokeWidth={1.9} />
      <span className="w-[76px] shrink-0 text-[15px] font-semibold">{label}</span>
      {value ? (
        <span className="min-w-0 flex-1 truncate text-right text-[15px]">{value}</span>
      ) : (
        <button onClick={onAdd} className="min-w-0 flex-1 text-right text-[14px] text-muted">
          Add
        </button>
      )}
    </li>
  );
}

function MenuRow({
  icon: Icon,
  title,
  sub,
  alert,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="lift flex w-full items-center gap-4 rounded-2xl bg-surface px-4 py-3.5 text-left active:scale-[0.99]">
      <span className="relative shrink-0 text-accent">
        <Icon size={26} strokeWidth={1.8} />
        {alert && <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-danger ring-2 ring-[var(--surface)]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16.5px] font-bold">{title}</span>
        <span className={cx("block truncate text-[13px]", alert ? "text-danger" : "text-muted")}>{sub}</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-muted" />
    </button>
  );
}
