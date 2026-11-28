"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Activity, Bell, Boxes, Flag, LayoutDashboard, Loader2, LogOut, type LucideIcon, MoreHorizontal, Moon, Radio, Settings, Shield, ShieldX, Sun, TrendingUp, Users } from "lucide-react";
import { signInWithUsername, signOutCloud, useAuth } from "@/lib/auth";
import { adminRole, overview2 } from "@/lib/adminApi";
import { applyTheme } from "@/lib/repo";
import { Logo } from "../Logo";
import { ToastProvider, cx } from "../ui";
import { CommandCenter } from "./CommandCenter";
import { Control } from "./Control";
import { Features } from "./Features";
import { Growth } from "./Growth";
import { HealthSection } from "./Health";
import { Live } from "./Live";
import { Notify } from "./Notify";
import { ReportsSection } from "./Reports";
import { Students } from "./Users";
import { Trust } from "./Trust";

type Section = "command" | "live" | "students" | "trust" | "notify" | "growth" | "features" | "reports" | "health" | "control";

const NAV: { id: Section; label: string; icon: LucideIcon; title: string; sub: string; primary?: boolean }[] = [
  { id: "command", label: "Command", icon: LayoutDashboard, title: "Command center", sub: "How DockIn is doing, right now", primary: true },
  { id: "live", label: "Live", icon: Radio, title: "Live", sub: "Who's online and everything happening" },
  { id: "students", label: "Students", icon: Users, title: "Students", sub: "Everyone on DockIn — search, inspect, act", primary: true },
  { id: "trust", label: "Trust", icon: Shield, title: "Trust & safety", sub: "Fake or suspicious accounts, scored", primary: true },
  { id: "notify", label: "Notify", icon: Bell, title: "Notifications", sub: "Send a push — and see who got it", primary: true },
  { id: "growth", label: "Growth", icon: TrendingUp, title: "Growth", sub: "Funnel, retention and churn" },
  { id: "features", label: "Features", icon: Boxes, title: "Feature usage", sub: "What's used, what works, what fails" },
  { id: "reports", label: "Reports", icon: Flag, title: "Reports", sub: "Messages students reported" },
  { id: "health", label: "Health", icon: Activity, title: "App health", sub: "Errors, versions, push and services" },
  { id: "control", label: "Control", icon: Settings, title: "Control room", sub: "Feature switches, announcement, team, log" },
];

const THEME_KEY = "dockin-admin-theme";
const themeSubs = new Set<() => void>();
const readTheme = () => {
  try {
    return (localStorage.getItem(THEME_KEY) as "light" | "dark" | null) ?? "light";
  } catch {
    return "light";
  }
};

function useAdminTheme(): ["light" | "dark", () => void] {
  const theme = useSyncExternalStore(
    (f) => {
      themeSubs.add(f);
      return () => themeSubs.delete(f);
    },
    readTheme,
    () => "light" as const,
  );
  useEffect(() => {
    applyTheme(theme, false);
  }, [theme]);
  return [
    theme,
    () => {
      try {
        localStorage.setItem(THEME_KEY, theme === "dark" ? "light" : "dark");
      } catch {}
      themeSubs.forEach((f) => f());
    },
  ];
}

const sectionFromHash = (): Section => {
  if (typeof window === "undefined") return "command";
  const h = window.location.hash.replace("#", "").split("?")[0] as Section;
  return NAV.some((n) => n.id === h) ? h : "command";
};

/**
 * DockIn Admin: the founder's dashboard, at /admin on the web and inside the
 * DockIn Admin app. Only accounts in public.admins get past the door; every
 * number and action is checked again by the database / server.
 */
export function AdminApp() {
  useAdminTheme();
  useEffect(() => {
    document.documentElement.style.zoom = "";
  }, []);
  return (
    <ToastProvider>
      <Gate />
    </ToastProvider>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const [role, setRole] = useState<"owner" | "moderator" | null | undefined>(undefined);
  const [roleErr, setRoleErr] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    adminRole()
      .then((r) => alive && setRole(r ?? null))
      .catch((e: Error) => {
        if (!alive) return;
        setRoleErr(e.message);
        setRole(null);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (loading || (userId && role === undefined)) {
    return (
      <Center>
        <Loader2 className="animate-spin text-accent" />
      </Center>
    );
  }
  if (!userId) return <SignInCard />;
  if (!role) {
    return (
      <Center>
        <div className="w-full max-w-sm rounded-3xl border border-line bg-card p-7 text-center shadow-xl">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
            <ShieldX size={28} />
          </span>
          <h1 className="font-display mt-4 text-[21px] font-extrabold">Not an admin account</h1>
          <p className="mt-1.5 text-[14px] text-muted">{roleErr && !/not an admin/i.test(roleErr) ? roleErr : "This DockIn account can't open the dashboard."}</p>
          <button type="button" onClick={() => void signOutCloud()} className="btn-paper mt-5 h-11 w-full rounded-xl text-[14px] font-bold">
            Use another account
          </button>
        </div>
      </Center>
    );
  }
  return <Shell role={role} name={session?.user.email?.split("@")[0] ?? ""} />;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="adm-bg flex min-h-dvh items-center justify-center p-5">{children}</div>;
}

function SignInCard() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Center>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(await signInWithUsername(u.trim(), p));
          setBusy(false);
        }}
        className="w-full max-w-sm rounded-3xl border border-line bg-card p-7 shadow-xl"
      >
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <p className="font-display text-[22px] leading-tight font-extrabold">DockIn Admin</p>
            <p className="text-[13px] text-muted">For the DockIn team only</p>
          </div>
        </div>
        <label className="mt-6 block">
          <span className="mb-1 block text-[12.5px] font-semibold text-muted">Username</span>
          <input value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none" autoComplete="username" className="field h-12 w-full px-3.5 text-[16px]" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[12.5px] font-semibold text-muted">Password</span>
          <input value={p} onChange={(e) => setP(e.target.value)} type="password" autoComplete="current-password" className="field h-12 w-full px-3.5 text-[16px]" />
        </label>
        {err && <p className="mt-3 text-[13px] font-semibold text-danger">{err}</p>}
        <button type="submit" disabled={busy || !u || !p} className="btn-leather mt-5 h-12 w-full rounded-2xl text-[15px] disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </Center>
  );
}

function Shell({ role, name }: { role: "owner" | "moderator"; name: string }) {
  const [section, setSection] = useState<Section>(sectionFromHash);
  const [filter, setFilter] = useState<string | undefined>();
  const [openUser, setOpenUser] = useState<string | undefined>();
  const [notifyTarget, setNotifyTarget] = useState<{ id: string; name: string } | null>(null);
  const [openReports, setOpenReports] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, toggleTheme] = useAdminTheme();
  const owner = role === "owner";

  const go = useCallback((s: string, f?: string) => {
    setSection(s as Section);
    setFilter(f);
    setOpenUser(undefined);
    setMoreOpen(false);
    window.history.replaceState(null, "", `#${s}`);
    window.scrollTo({ top: 0 });
  }, []);

  const openStudent = useCallback((id: string) => {
    setSection("students");
    setFilter(undefined);
    setOpenUser(id);
    setMoreOpen(false);
    window.history.replaceState(null, "", "#students");
  }, []);

  const refreshBadge = useCallback(() => {
    overview2()
      .then((o) => setOpenReports(o.reports_open))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(refreshBadge, 0);
    const i = setInterval(refreshBadge, 60_000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [refreshBadge]);
  useEffect(() => {
    const on = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const nav = NAV.find((n) => n.id === section)!;
  const primary = NAV.filter((n) => n.primary);
  const extra = NAV.filter((n) => !n.primary);
  const inMore = extra.some((n) => n.id === section);

  return (
    <div className="adm-bg min-h-dvh lg:flex">
      {/* sidebar (desktop) */}
      <aside className="adm-side sticky top-0 hidden h-dvh w-60 shrink-0 flex-col px-4 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <Logo size={36} />
          <div>
            <p className="font-display text-[18px] leading-tight font-extrabold text-[var(--on-ink)]">DockIn</p>
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-[var(--ink-muted)] uppercase">Admin</p>
          </div>
        </div>
        <nav className="mt-7 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => go(n.id)}
              className={cx(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition",
                section === n.id ? "bg-[rgb(255_243_224/0.14)] text-white" : "text-[var(--ink-muted)] hover:bg-[rgb(255_243_224/0.07)] hover:text-white",
              )}
            >
              <n.icon size={18} />
              <span className="flex-1 text-left">{n.label}</span>
              {n.id === "reports" && openReports > 0 && <span className="rounded-full bg-orange px-1.5 text-[11px] font-bold text-white">{openReports}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-[rgb(255_243_224/0.12)] pt-3">
          <button type="button" onClick={toggleTheme} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold text-[var(--ink-muted)] hover:text-white">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />} {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button type="button" onClick={() => void signOutCloud()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold text-[var(--ink-muted)] hover:text-white">
            <LogOut size={17} /> Sign out
          </button>
          <p className="px-3 pt-1 text-[11.5px] text-[var(--ink-muted)]">
            @{name} · {role}
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="adm-top sticky top-0 z-30 border-b border-line px-4 pt-[calc(var(--sat,0px)+0.6rem)] pb-2.5 lg:px-8 lg:pt-5 lg:pb-4">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <span className="lg:hidden">
              <Logo size={30} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display truncate text-[20px] leading-tight font-extrabold tracking-[-0.02em] lg:text-[26px]">{nav.title}</h1>
              <p className="hidden truncate text-[13px] text-muted sm:block">{nav.sub}</p>
            </div>
            <button type="button" onClick={toggleTheme} aria-label="Theme" className="adm-icon-btn grid size-9 place-items-center rounded-xl border border-line bg-card text-muted lg:hidden">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="hidden rounded-full border border-line bg-card px-3 py-1.5 text-[12.5px] font-semibold text-muted sm:inline-block">
              @{name} · {role}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-4 pb-[calc(6rem+var(--sab,0px))] lg:px-8 lg:pb-12">
          <div key={section} className="adm-enter">
            {section === "command" && <CommandCenter go={go} />}
            {section === "live" && <Live onOpenUser={openStudent} />}
            {section === "students" && (
              <Students key={`${filter ?? ""}-${openUser ?? ""}`} initialFilter={filter} openUser={openUser} onNotify={(u) => { setNotifyTarget(u); go("notify"); }} />
            )}
            {section === "trust" && <Trust onOpenUser={openStudent} />}
            {section === "notify" && <Notify target={notifyTarget} clearTarget={() => setNotifyTarget(null)} owner={owner} />}
            {section === "growth" && <Growth />}
            {section === "features" && <Features />}
            {section === "reports" && <ReportsSection onOpenUser={openStudent} onChanged={refreshBadge} />}
            {section === "health" && <HealthSection />}
            {section === "control" && <Control owner={owner} />}
          </div>
        </main>

        {/* bottom bar (phone): 4 primary + More */}
        <nav className="adm-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line px-1 pt-1.5 pb-[max(0.5rem,var(--sab,0px))] lg:hidden" aria-label="Admin">
          {primary.map((n) => (
            <BottomTab key={n.id} n={n} active={section === n.id} badge={n.id === "reports" ? openReports : 0} onClick={() => go(n.id)} />
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className={cx("relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-semibold", inMore ? "text-accent" : "text-muted")}>
            <MoreHorizontal size={20} strokeWidth={inMore ? 2.4 : 1.9} />
            More
            {openReports > 0 && !primary.some((p) => p.id === "reports") && <span className="absolute top-0.5 right-[24%] min-w-4 rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-white">{openReports}</span>}
          </button>
        </nav>

        {/* "More" sheet (phone) */}
        {moreOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="More sections">
            <div className="anim-fade absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
            <div className="adm-sheet absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-card p-4 pb-[calc(1rem+var(--sab,0px))]">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
              <div className="grid grid-cols-3 gap-2">
                {extra.map((n) => (
                  <button key={n.id} type="button" onClick={() => go(n.id)} className={cx("relative flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3.5 text-[12px] font-semibold", section === n.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted")}>
                    <n.icon size={20} />
                    {n.label}
                    {n.id === "reports" && openReports > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-danger px-1 text-[10px] font-bold text-white">{openReports}</span>}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={toggleTheme} className="btn-paper inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold">
                  {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} {theme === "dark" ? "Light" : "Dark"}
                </button>
                <button type="button" onClick={() => void signOutCloud()} className="btn-paper inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold">
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BottomTab({ n, active, badge, onClick }: { n: { label: string; icon: LucideIcon }; active: boolean; badge: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx("relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-semibold", active ? "text-accent" : "text-muted")}>
      <n.icon size={20} strokeWidth={active ? 2.4 : 1.9} />
      {n.label}
      {badge > 0 && <span className="absolute top-0.5 right-[24%] min-w-4 rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-white">{badge}</span>}
    </button>
  );
}
