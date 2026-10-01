"use client";

import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChevronRight,
  Cloud,
  Download,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Smartphone,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { applyTheme, exportAll, getProfile, importAll, resetAll, saveProfile } from "@/lib/repo";
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
import { BackHeader } from "@/components/PageHeader";
import { ProfileSkeleton } from "@/components/Skeleton";
import { SignIn } from "@/components/SignIn";
import { signOutCloud, useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { clearSyncState, flushNow, getSyncStatus, resetSyncStatus, subscribeSync } from "@/lib/sync";

type SheetName = "name" | "signin" | "logout" | "delete" | "restore" | "install" | null;
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
  const [nameDraft, setNameDraft] = useState("");
  const [budgetText, setBudgetText] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupCheck>("idle");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; counts: string } | null>(null);
  const [installed] = useState(isInstalled);
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

  async function saveName() {
    const n = nameDraft.trim();
    if (!n) return;
    await saveProfile({ name: n });
    setSheet(null);
  }

  async function saveBudget() {
    if (budgetText === null) return;
    const n = Math.round(Number(budgetText.replace(/[^\d.]/g, "")));
    setBudgetText(null);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return;
    await saveProfile({ budget: n });
    toast.show(n > 0 ? "Monthly budget saved" : "Budget cleared");
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
        <section className="flex items-center gap-4 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
          <Avatar name={profile.name} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {profile.name || "Your name"}
            </h1>
            <p className="truncate text-[13px] text-muted">
              {signedIn ? session.user.email : "Saved on this phone only"}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">Using DockIn since {since}</p>
          </div>
          <button
            onClick={() => {
              setNameDraft(profile.name);
              setSheet("name");
            }}
            aria-label="Edit name"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-text"
          >
            <Pencil size={17} />
          </button>
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
      <Sheet open={sheet === "name"} onClose={close} title="Your name">
        <Field label="First name">
          <input
            className={inputCls}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void saveName()}
            autoComplete="given-name"
            autoFocus
          />
        </Field>
        <Button className="w-full" onClick={saveName} disabled={!nameDraft.trim()}>
          Save
        </Button>
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
