"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Clock3, Eye, Send, Sparkles, UserRound, Users, Wifi, X, Zap } from "lucide-react";
import { ago, audienceLabel, broadcasts2, notify, pctOf, segments, type Audience, type Broadcast2 } from "@/lib/adminApi";
import { cx, useToast } from "../ui";
import { Badge, Card, Empty, Loading, RefreshButton, useConfirm, useLoad } from "./parts";

const SCREENS = [
  ["/", "Today"],
  ["/attendance", "Attendance"],
  ["/timetable", "Timetable"],
  ["/cafeteria", "Cafeteria"],
  ["/tasks", "Tasks"],
  ["/circle", "Friends"],
  ["/settings", "Profile"],
  ["/?update=1", "Update popup"],
] as const;

const TEMPLATES = [
  { t: "Your attendance, sorted ✅", b: "Open DockIn to see how many classes you can still skip this week." },
  { t: "Connect MyCamu in 10 seconds", b: "Your attendance and timetable fill in by themselves once MyCamu is connected." },
  { t: "Exams are close 📚", b: "Check your timetable and pending tasks in DockIn — all in one place." },
  { t: "DockIn update ready 🎉", b: "A faster, better DockIn is here. Tap to update — your data stays." },
];

type Kind = Audience["kind"];

export function Notify({ target, clearTarget, owner }: { target: { id: string; name: string } | null; clearTarget: () => void; owner: boolean }) {
  const toast = useToast();
  const { confirm, node } = useConfirm();
  const seg = useLoad(segments);
  const history = useLoad(() => broadcasts2(40));

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [path, setPath] = useState("/");
  const [kind, setKind] = useState<Kind>(target ? "user" : "me");
  const [days, setDays] = useState(7);
  const [version, setVersion] = useState("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState(1);
  const [reach, setReach] = useState<{ people: number; phones: number; instant?: number } | null>(null);
  const [reachErr, setReachErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; detail?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [lastTarget, setLastTarget] = useState(target?.id);
  if (target?.id !== lastTarget) {
    setLastTarget(target?.id);
    if (target) setKind("user");
  }

  const audience: Audience = useMemo(() => {
    if (kind === "user" && target) return { kind: "user", userId: target.id };
    if (kind === "active" || kind === "inactive") return { kind, days };
    if (kind === "version_below") return { kind, version: version || "0" };
    if (kind === "branch") return { kind, value: branch || seg.data?.branches[0]?.v || "" };
    if (kind === "year") return { kind, value: year };
    return { kind } as Audience;
  }, [kind, target, days, version, branch, year, seg.data]);
  const key = JSON.stringify(audience);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setReach(null);
      notify({ title: "x", body: "x", path: "/", audience: JSON.parse(key) as Audience, dryRun: true })
        .then((r) => alive && (setReach({ people: r.people, phones: r.phones, instant: r.instant }), setReachErr(null)))
        .catch((e: Error) => alive && (setReach(null), setReachErr(e.message)));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key]);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const r = await notify({ title, body, path, audience });
      const errs = Object.entries(r.errors ?? {});
      const sent = r.sent ?? 0;
      setResult({
        ok: sent > 0,
        text: r.phones === 0 ? "Nobody to send to — none of these students has a phone with DockIn notifications on." : `Accepted by ${sent} of ${r.phones} phones${r.instant ? ` · ${r.instant} get it instantly` : ""}`,
        detail: errs.length ? `Google said: ${errs.map(([k, n]) => `${k} ×${n}`).join(", ")}${errs.some(([k]) => k === "UNREGISTERED") ? " (old phones, now removed)" : ""}` : undefined,
      });
      toast.show(sent ? `Sent to ${sent} phones` : "Not delivered — see below");
      if (sent) {
        setTitle("");
        setBody("");
      }
      void history.reload();
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
      toast.show("Not sent — see below");
    } finally {
      setBusy(false);
    }
  }

  const ready = title.trim().length > 0 && body.trim().length > 0 && (kind !== "all" || owner);
  const isTest = kind === "me" || kind === "user";

  const AUDIENCES: { kind: Kind; label: string; sub: string; off?: boolean }[] = [
    { kind: "all", label: "Everyone", sub: "every phone with notifications", off: !owner },
    { kind: "active", label: "Active students", sub: "opened in the last N days" },
    { kind: "inactive", label: "Gone quiet", sub: "haven't opened for N days" },
    { kind: "no_camu", label: "No MyCamu yet", sub: "haven't connected MyCamu" },
    { kind: "unverified", label: "Not verified", sub: "never confirmed with MyCamu" },
    { kind: "year", label: "By year", sub: "a year of study" },
    { kind: "branch", label: "By branch", sub: "one branch / programme" },
    { kind: "outdated", label: "Old app", sub: "behind the latest version" },
    { kind: "version_below", label: "Below a version", sub: "older than a version you pick" },
    { kind: "preview", label: "Preview testers", sub: "preview build only" },
    { kind: "me", label: "Only me", sub: "a test to your own phone" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {node}
      <div className="space-y-4">
        <Card title="Write it" sub="Short and clear works best — 1 line title, 1–2 line message">
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {TEMPLATES.map((x) => (
              <button
                key={x.t}
                type="button"
                onClick={() => {
                  setTitle(x.t);
                  setBody(x.b);
                  if (x.t.startsWith("DockIn update")) setPath("/?update=1");
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-[12.5px] font-semibold text-muted hover:text-[var(--text)]"
              >
                <Sparkles size={12} /> {x.t}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 flex justify-between text-[12.5px] font-semibold text-muted">
              Title <span>{title.length}/80</span>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="e.g. Exams are close 📚" className="field h-11 w-full px-3.5 text-[15px]" />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 flex justify-between text-[12.5px] font-semibold text-muted">
              Message <span>{body.length}/240</span>
            </span>
            <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 240))} rows={3} placeholder="What should they know?" className="field w-full resize-none px-3.5 py-2.5 text-[15px]" />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[12.5px] font-semibold text-muted">Opens</span>
            <select value={path} onChange={(e) => setPath(e.target.value)} className="field h-11 w-full px-3 text-[15px]">
              {SCREENS.map(([p, l]) => (
                <option key={p} value={p}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Card
          title="Who gets it"
          sub={reachErr ? `Can't count: ${reachErr}` : reach ? `${reach.people} ${reach.people === 1 ? "student" : "students"} · ${reach.phones} ${reach.phones === 1 ? "phone" : "phones"}${reach.instant ? ` · ${reach.instant} instant` : ""}` : "Counting…"}
        >
          {target && (
            <button type="button" onClick={() => setKind("user")} className={cx("mb-2 flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left", kind === "user" ? "border-accent bg-accent-soft" : "border-line")}>
              <UserRound size={18} className="text-accent" />
              <span className="flex-1">
                <span className="block text-[14px] font-bold">{target.name}</span>
                <span className="block text-[12px] text-muted">just this student</span>
              </span>
              <span role="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); clearTarget(); setKind("me"); }} className="grid size-7 place-items-center rounded-full text-muted">
                <X size={15} />
              </span>
            </button>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.kind}
                type="button"
                disabled={a.off}
                onClick={() => setKind(a.kind)}
                className={cx("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition disabled:opacity-45", kind === a.kind ? "border-accent bg-accent-soft" : "border-line hover:bg-surface")}
              >
                <span className={cx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", kind === a.kind ? "border-accent" : "border-line")}>{kind === a.kind && <span className="size-1.5 rounded-full bg-accent" />}</span>
                <span>
                  <span className="block text-[13.5px] font-bold">{a.label}</span>
                  <span className="block text-[12px] text-muted">{a.sub}</span>
                </span>
              </button>
            ))}
          </div>
          {(kind === "active" || kind === "inactive") && (
            <div className="mt-3 flex items-center gap-2 text-[13.5px]">
              <span className="text-muted">Days:</span>
              {[1, 3, 7, 14, 30].map((n) => (
                <button key={n} type="button" onClick={() => setDays(n)} className={cx("h-8 min-w-9 rounded-full border px-2.5 text-[12.5px] font-bold", days === n ? "border-transparent bg-[var(--ink)] text-[var(--on-ink)]" : "border-line text-muted")}>
                  {n}
                </button>
              ))}
            </div>
          )}
          {kind === "version_below" && <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version, e.g. 3.0.120" className="field mt-3 h-10 w-full px-3 text-[14px]" />}
          {kind === "branch" && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {seg.data?.branches.length ? (
                seg.data.branches.map((b) => (
                  <button key={b.v} type="button" onClick={() => setBranch(b.v)} className={cx("h-8 rounded-full border px-3 text-[12.5px] font-semibold", (branch || seg.data?.branches[0]?.v) === b.v ? "border-transparent bg-[var(--ink)] text-[var(--on-ink)]" : "border-line text-muted")}>
                    {b.v} <span className="opacity-60">· {b.n}</span>
                  </button>
                ))
              ) : (
                <span className="text-[12.5px] text-muted">No branches on profiles yet.</span>
              )}
            </div>
          )}
          {kind === "year" && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(seg.data?.years.length ? seg.data.years : [{ v: 1, n: 0 }, { v: 2, n: 0 }, { v: 3, n: 0 }, { v: 4, n: 0 }]).map((y) => (
                <button key={y.v} type="button" onClick={() => setYear(y.v)} className={cx("h-8 rounded-full border px-3 text-[12.5px] font-semibold", year === y.v ? "border-transparent bg-[var(--ink)] text-[var(--on-ink)]" : "border-line text-muted")}>
                  Year {y.v} {y.n ? <span className="opacity-60">· {y.n}</span> : ""}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Preview" sub="How it looks on a phone">
          <div className="rounded-[22px] bg-[#1d1712] p-3">
            <div className="rounded-2xl bg-[#2c241d] p-3 text-[#f3e4cc] shadow">
              <div className="flex items-center gap-2 text-[11.5px] text-[#c9b49a]">
                <span className="grid size-5 place-items-center rounded-full bg-[#7c3d1b] text-[10px] font-black text-white">D</span>
                DockIn · now
              </div>
              <p className="mt-1.5 text-[14px] font-bold">{title || "Your title"}</p>
              <p className="text-[13px] leading-snug text-[#e3d2b8]">{body || "Your message shows here."}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={async () => {
              if (isTest) return void send();
              if (await confirm("Send it?", `This goes to about ${reach?.people ?? "?"} students (${audienceLabel(audience)}) and can't be taken back.`, "Send now", false)) void send();
            }}
            className="btn-leather mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] disabled:opacity-50"
          >
            <Send size={17} /> {kind === "me" ? "Send me a test" : "Send"}
          </button>
          {result && (
            <div role="status" className={cx("anim-fade mt-3 rounded-xl border p-3 text-[13.5px]", result.ok ? "border-safe/40 bg-safe-soft" : "border-danger/40 bg-danger-soft")}>
              <p className={cx("font-bold", result.ok ? "text-safe" : "text-danger")}>{result.text}</p>
              {result.detail && <p className="mt-0.5 text-[12.5px] text-muted">{result.detail}</p>}
              {result.ok && <p className="mt-0.5 text-[12.5px] text-muted">Arrived / opened fills in below as phones confirm.</p>}
              {!result.ok && <p className="mt-0.5 text-[12.5px] text-muted">Health → Setup checks shows what the server is missing.</p>}
            </div>
          )}
        </Card>

        <Card title="Sent" sub="Arrived = phone confirmed · Opened = tapped" action={<RefreshButton loading={history.loading} onClick={() => void history.reload()} />}>
          {!history.data ? (
            <Loading />
          ) : history.data.length === 0 ? (
            <Empty icon={<BellRing />} title="Nothing sent yet" />
          ) : (
            <ul className="space-y-2.5">
              {history.data.map((b) => (
                <SentRow key={b.id} b={b} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function SentRow({ b }: { b: Broadcast2 }) {
  const reached = b.reached ?? 0;
  const opened = b.opened ?? 0;
  return (
    <li className="rounded-xl border border-line p-3">
      <p className="text-[13.5px] font-bold">{b.title}</p>
      <p className="line-clamp-2 text-[12.5px] text-muted">{b.body}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
        <Clock3 size={11} /> {ago(b.sent_at)} · {b.sent_by}
        <Badge tone="plain">{audienceLabel(b.audience)}</Badge>
      </p>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
        <Pill icon={<Users size={11} />} n={b.people} label="target" />
        <Pill icon={<Check size={11} />} n={reached} label="arrived" tone={reached > 0 ? "good" : undefined} />
        <Pill icon={<Eye size={11} />} n={opened} label="opened" tone={opened > 0 ? "accent" : undefined} />
        <Pill icon={<Zap size={11} />} n={pctOf(opened, Math.max(1, reached))} label="CTR %" />
      </div>
      {b.failed ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-danger">
          <Wifi size={11} /> {b.failed} phone{b.failed === 1 ? "" : "s"} couldn&apos;t be reached
        </p>
      ) : null}
    </li>
  );
}

function Pill({ icon, n, label, tone }: { icon: React.ReactNode; n: number; label: string; tone?: "good" | "accent" }) {
  return (
    <div className={cx("rounded-lg px-1.5 py-1.5", tone === "good" ? "bg-safe-soft" : tone === "accent" ? "bg-accent-soft" : "bg-surface")}>
      <p className={cx("flex items-center justify-center gap-0.5 text-[14px] font-extrabold tabular-nums", tone === "good" ? "text-safe" : tone === "accent" ? "text-accent" : "")}>
        {icon} {n}
      </p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}
