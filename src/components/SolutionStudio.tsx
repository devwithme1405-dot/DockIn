"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FlaskConical,
  FileText,
  GraduationCap,
  Loader2,
  PenLine,
  RotateCcw,
  ScanLine,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { Task } from "@/lib/types";
import type { ChatFile } from "@/lib/chat";
import { downloadChatFile, sendMessage, uploadChatFile, useFileCached } from "@/lib/chat";
import { useTasks } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProfile, saveProfile, setTaskDone } from "@/lib/repo";
import { useCollege } from "@/lib/college";
import { isNativeApp } from "@/lib/native";
import { DraftOnly, WebOnlyLms, submitToLms } from "@/lib/lmsSubmit";
import { useBackClose } from "@/lib/backClose";
import { isPractice } from "@/lib/practiceLms";
import {
  SOLUTION_MAX,
  SolutionError,
  assignInstance,
  canMakePdf,
  detectAuthor,
  docKind,
  findMyAssignment,
  hits,
  makeCopy,
  pickableAssignments,
  readText,
  solutionFor,
  type ChatSolution,
  type FileText as DocText,
  type OutFormat,
} from "@/lib/solution";
import { handOver } from "./AssignmentFile";
import { Sheet, cx, useToast } from "./ui";

const LMS_HOME = "https://lms.bennett.edu.in/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Only ever called from event handlers, to pace the animations. */
function clock(): number {
  return performance.now();
}
const size = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const first = (s: string) => s.trim().split(/\s+/)[0] || s;

function dueLabel(t: { dueDate?: string | null; dueTime?: string | null }): string {
  if (!t.dueDate) return "No deadline";
  const d = new Date(`${t.dueDate}T${t.dueTime ?? "23:59"}:00`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `${day} · ${time}`;
}

/** Splits text around the given strings so they can be marked. */
function marked(text: string, marks: string[]): (string | { m: string })[] {
  const keys = marks.map((m) => m.trim()).filter((m) => m.length > 1);
  if (!keys.length) return [text];
  const re = new RegExp(`(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 === 1 ? { m: part } : part));
}

function swapText(text: string, swaps: { find: string; replace: string }[]): string {
  let out = text;
  for (const s of swaps) {
    if (s.find.trim().length < 2 || !s.replace.trim()) continue;
    out = out.replace(new RegExp(s.find.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi"), s.replace.trim());
  }
  return out;
}

// ---------------------------------------------------------------------------
// In the chat: the solution card

/** Who has handed this in: my LMS task for the same assignment, if I have one. */
function useMyTask(sol: ChatSolution | undefined): { task: Task | null; ready: boolean } {
  const tasks = useTasks();
  if (!sol || !tasks) return { task: null, ready: !!tasks };
  return { task: findMyAssignment(sol, tasks), ready: true };
}

/**
 * A file sent as the answer to an LMS assignment. Everyone but the sender sees
 * whether they have submitted it yet, and two choices: download it as it is, or
 * put their own name on it and submit.
 */
export function SolutionCard({ f, mine, from }: { f: ChatFile; mine: boolean; from: string }) {
  const sol = f.solution!;
  const toast = useToast();
  const { task } = useMyTask(sol);
  const [busy, setBusy] = useState(false);
  const [studio, setStudio] = useState(false);
  const saved = useFileCached(f.path);
  const done = !!task?.done;
  const ext = (f.name.split(".").pop() ?? "").toUpperCase();

  async function download() {
    setBusy(true);
    try {
      await handOver(await downloadChatFile(f), f.name);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not download it.");
    }
    setBusy(false);
  }

  return (
    <div className="my-0.5 w-[16.5rem] max-w-full overflow-hidden rounded-2xl border border-card-edge bg-bg/70">
      <div className="relative bg-gradient-to-br from-[#fff3e4] to-[#ffe2c2] px-3 pt-2.5 pb-2 dark:from-[#3b2a1b] dark:to-[#2c1f15]">
        <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-[#b45f1e] uppercase dark:text-[#f0a25a]">
          <GraduationCap size={13} /> Assignment solution
        </p>
        <p className="mt-0.5 line-clamp-2 text-[14.5px] leading-snug font-extrabold">{sol.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted">
          {[sol.course, sol.dueDate ? `Due ${dueLabel(sol)}` : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void download();
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-black/[0.04]"
      >
        <span className={cx("grid h-10 w-9 shrink-0 place-items-center rounded-lg text-[10px] font-extrabold text-white", ext === "PDF" ? "bg-[#d64545]" : "bg-[#2b5797]")}>
          {ext || "FILE"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold">{f.name}</span>
          <span className="block text-[11.5px] text-muted">
            {size(f.size)} · by {mine ? "you" : first(from)}
            {saved && " · on phone"}
          </span>
        </span>
      </button>

      {mine ? (
        <p className="border-t border-card-edge px-3 py-2 text-[12px] text-muted">Friends can put their own name on it and submit to their LMS.</p>
      ) : (
        <div className="border-t border-card-edge px-2.5 pt-2 pb-2.5">
          <p className={cx("mb-2 flex items-center gap-1.5 px-0.5 text-[12px] font-bold", done ? "text-safe" : task ? "text-[#c2621d] dark:text-[#f0a25a]" : "text-muted")}>
            <span className={cx("size-2 rounded-full", done ? "bg-safe" : task ? "animate-pulse bg-[#e07a2c]" : "bg-muted/50")} />
            {done ? "You've submitted this" : task ? "You haven't submitted yet" : "Not on your LMS list"}
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void download();
              }}
              disabled={busy}
              className="btn-paper flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStudio(true);
              }}
              className="btn-leather flex h-10 flex-[1.45] items-center justify-center gap-1.5 rounded-xl text-[13px]"
            >
              <PenLine size={15} /> {done ? "Edit & resubmit" : "Edit & submit"}
            </button>
          </div>
        </div>
      )}
      {studio && (
        <CopyStudio
          fileName={f.name}
          fileSize={f.size}
          load={() => downloadChatFile(f)}
          solution={sol}
          from={from}
          onClose={() => setStudio(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sending: "just a file, or the solution to an assignment?"

/**
 * Asked when a Word file or PDF is sent in a chat. A plain file goes as it
 * always did; a solution carries which LMS assignment it answers and the
 * sender's own name and enrollment as they are written in it.
 */
export function SendDocSheet({ file, thread, onClose }: { file: File; thread: string; onClose: () => void }) {
  const toast = useToast();
  const tasks = useTasks();
  const profile = useLiveQuery(() => getProfile(), []);
  const { state } = useCollege();
  const [step, setStep] = useState<"what" | "which" | "who">("what");
  const [task, setTask] = useState<Task | null>(null);
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState(false);
  const [info, setInfo] = useState<DocText | null>(null);
  const [me, setMe] = useState<{ name: string; roll: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = docKind(file.name, file.type);
  const list = pickableAssignments(tasks ?? []);

  // Read the file once, in the background, as soon as it might be a solution.
  useEffect(() => {
    let alive = true;
    if (!kind) return;
    readText(file, file.name)
      .then((t) => alive && setInfo(t))
      .catch(() => alive && setInfo({ kind, text: "", scanned: true }));
    return () => {
      alive = false;
    };
  }, [file, kind]);

  const guess = info && profile ? detectAuthor(info.text, file.name, profile) : null;
  const who = me ?? (guess ? { name: guess.name, roll: guess.roll } : { name: "", roll: "" });

  async function sendPlain() {
    setBusy(true);
    try {
      const up = await uploadChatFile(thread, file);
      await sendMessage(thread, "", { file: up });
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not send that file.");
      setBusy(false);
    }
  }

  async function sendSolution() {
    const title = task?.title ?? custom.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      let body: File = file;
      if (file.size > SOLUTION_MAX) {
        const small = await makeCopy(file, file.name, [], "keep");
        body = new File([small.blob], file.name, { type: small.blob.type || file.type });
      }
      const sol: ChatSolution = task
        ? solutionFor(task, who)
        : { instance: null, title: title.slice(0, 140), authorName: who.name.trim(), authorRoll: who.roll.trim() };
      // Remember my enrollment for next time (and for the other direction).
      if (who.roll.trim() && !profile?.roll) void saveProfile({ roll: who.roll.trim() });
      const up = await uploadChatFile(thread, body);
      await sendMessage(thread, "", { file: { ...up, solution: sol } });
      toast.show("Solution sent — friends can submit their own copy");
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not send it.");
      setBusy(false);
    }
  }

  const title =
    step === "what" ? "Send this file" : step === "which" ? "Which assignment?" : "Your details in it";

  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title={title}>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
        <span className={cx("grid h-10 w-9 shrink-0 place-items-center rounded-lg text-[10px] font-extrabold text-white", kind === "pdf" ? "bg-[#d64545]" : kind === "docx" ? "bg-[#2b5797]" : "bg-[#7a6a5a]")}>
          {(file.name.split(".").pop() ?? "").toUpperCase().slice(0, 4)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold">{file.name}</p>
          <p className="text-[12px] text-muted">{size(file.size)}</p>
        </div>
      </div>

      {step === "what" && (
        <div key="what" className="anim-pop space-y-2.5">
          <button
            onClick={() => (kind ? setStep("which") : undefined)}
            disabled={!kind || busy}
            className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-[#e9a865] bg-gradient-to-br from-[#fff3e4] to-[#ffe7cf] p-3.5 text-left transition active:scale-[0.98] disabled:opacity-50 dark:from-[#3b2a1b] dark:to-[#2c1f15]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e07a2c] text-white shadow-sm">
              <GraduationCap size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">Solution for an LMS assignment</span>
              <span className="block text-[12.5px] leading-snug text-muted">
                {kind ? "Friends put their own name on it and submit to their LMS" : "Only Word or PDF files can be solutions"}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </button>
          <button
            onClick={() => void sendPlain()}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-card-edge bg-card p-3.5 text-left transition active:scale-[0.98] disabled:opacity-50"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
              {busy ? <Loader2 size={20} className="animate-spin" /> : <Send size={19} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">Just send the file</span>
              <span className="block text-[12.5px] text-muted">Like any other document</span>
            </span>
          </button>
        </div>
      )}

      {step === "which" && (
        <div key="which" className="anim-pop">
          {list.length > 0 ? (
            <ul className="-mx-1 max-h-[46dvh] space-y-1.5 overflow-y-auto px-1 pb-1">
              {list.map((t, i) => (
                <li key={t.id} className="anim-pop" style={{ "--d": `${Math.min(i, 8) * 28}ms` } as CSSProperties}>
                  <button
                    onClick={() => {
                      setTask(t);
                      setStep("who");
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-card-edge bg-card px-3 py-2.5 text-left transition active:scale-[0.98]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold">{t.title}</span>
                      <span className="block truncate text-[12px] text-muted">{[t.notes, dueLabel(t)].filter(Boolean).join(" · ")}</span>
                    </span>
                    {t.done && <span className="shrink-0 rounded-full bg-safe/15 px-2 py-0.5 text-[11px] font-bold text-safe">Submitted</span>}
                    <ChevronRight size={17} className="shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] leading-snug text-muted">
              {state.lms?.connected
                ? "No open LMS assignments right now. Type its name below."
                : "Connect your LMS (Profile → College accounts) to pick from your assignments — or type its name below."}
            </p>
          )}
          {typing ? (
            <div className="mt-3 flex gap-2">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.slice(0, 140))}
                placeholder="e.g. DBMS Assignment 4"
                autoFocus
                className="h-12 min-w-0 flex-1 rounded-2xl border-[1.5px] border-card-edge bg-card px-4 text-[15.5px] outline-none focus:border-orange"
              />
              <button
                onClick={() => {
                  setTask(null);
                  setStep("who");
                }}
                disabled={!custom.trim()}
                className="btn-leather grid size-12 shrink-0 place-items-center rounded-2xl disabled:opacity-50"
                aria-label="Next"
              >
                <ArrowRight size={19} />
              </button>
            </div>
          ) : (
            <button onClick={() => setTyping(true)} className="mt-3 w-full rounded-2xl py-2.5 text-[13.5px] font-bold text-mess">
              Not in the list? Type its name
            </button>
          )}
          <button onClick={() => setStep("what")} className="mt-1 flex items-center gap-1 text-[13px] font-bold text-muted">
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      )}

      {step === "who" && (
        <div key="who" className="anim-pop">
          <p className="mb-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px]">
            <span className="text-muted">Solution for </span>
            <b>{task?.title ?? custom.trim()}</b>
          </p>
          {!info ? (
            <p className="flex items-center gap-2 py-4 text-[13.5px] text-muted">
              <Loader2 size={16} className="animate-spin" /> Reading the file…
            </p>
          ) : info.scanned ? (
            <p className="flex gap-2 rounded-2xl bg-orange/10 px-3.5 py-3 text-[13px] leading-snug">
              <ScanLine size={16} className="mt-0.5 shrink-0 text-mess" />
              <span>This PDF is a scan, so its name can&apos;t be changed. Friends can still download it and submit it as it is.</span>
            </p>
          ) : (
            <>
              <p className="mb-2.5 text-[12.5px] leading-snug text-muted">
                Exactly as written in the file — friends&apos; copies get their own in these places.
              </p>
              <DetailInput
                label="Your name"
                value={who.name}
                onChange={(v) => setMe({ ...who, name: v })}
                found={hits(info.text, who.name)}
                placeholder="Vaibhav Sharma"
              />
              <DetailInput
                label="Your enrollment no."
                value={who.roll}
                onChange={(v) => setMe({ ...who, roll: v })}
                found={hits(info.text, who.roll)}
                placeholder="S25CSEU0155"
                mono
              />
              {guess && guess.otherRolls.filter((r) => r.toLowerCase() !== who.roll.toLowerCase()).length > 0 && (
                <div className="-mt-1 mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-muted">In the file:</span>
                  {guess.otherRolls
                    .filter((r) => r.toLowerCase() !== who.roll.toLowerCase())
                    .slice(0, 3)
                    .map((r) => (
                      <button key={r} onClick={() => setMe({ ...who, roll: r })} className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[12px] font-bold">
                        {r}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
          {file.size > SOLUTION_MAX && (
            <p className="mt-2 text-[12px] text-muted">Over 5 MB — it&apos;ll be compressed before sending.</p>
          )}
          <button
            onClick={() => void sendSolution()}
            disabled={busy || !info}
            className="btn-leather mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />} {busy ? "Sending…" : "Send solution"}
          </button>
          <button onClick={() => setStep("which")} disabled={busy} className="mt-2 flex items-center gap-1 text-[13px] font-bold text-muted">
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      )}
    </Sheet>
  );
}

function DetailInput({
  label,
  value,
  onChange,
  found,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  found: number;
  placeholder: string;
  mono?: boolean;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 flex items-center justify-between text-[12.5px] font-bold">
        {label}
        {value.trim().length > 1 &&
          (found > 0 ? (
            <span className="flex items-center gap-1 text-safe">
              <Check size={13} strokeWidth={3} /> found {found}×
            </span>
          ) : (
            <span className="text-warn">not in the file</span>
          ))}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 80))}
        placeholder={placeholder}
        className={cx(
          "h-12 w-full rounded-2xl border-[1.5px] border-card-edge bg-card px-4 text-[15.5px] font-semibold outline-none focus:border-orange",
          mono && "font-mono tracking-wide uppercase",
        )}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// The studio: setup → making it (animated) → check → submit → result

type Phase = "load" | "setup" | "working" | "preview" | "sending" | "done" | "failed";
type Step = "read" | "swap" | "convert" | "shrink" | "check";

/**
 * Full screen, start to finish: pick the assignment, check the names, watch
 * DockIn make your copy, look at it, submit it to YOUR LMS, and see whether it
 * went in. With no `solution` it is your own file being handed in.
 */
export function CopyStudio({
  fileName,
  fileSize,
  load,
  solution,
  from,
  task: given,
  onClose,
}: {
  fileName: string;
  fileSize: number;
  load: () => Promise<Blob>;
  solution?: ChatSolution | null;
  from?: string;
  task?: Task | null;
  onClose: () => void;
}) {
  const own = !solution;
  const toast = useToast();
  const tasks = useTasks();
  const profile = useLiveQuery(() => getProfile(), []);
  const { state } = useCollege();
  const [loader] = useState(() => load);
  const [phase, setPhase] = useState<Phase>("load");
  const [src, setSrc] = useState<{ blob: Blob; info: DocText | null } | null>(null);
  const [fail, setFail] = useState<{ msg: string; webOnly?: boolean; draft?: boolean; at: "load" | "make" | "submit" } | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(given?.id ?? null);
  const [picking, setPicking] = useState(false);
  const [mine, setMine] = useState<{ name: string; roll: string } | null>(null);
  const [format, setFormat] = useState<OutFormat>("keep");
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof makeCopy>> | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [checked, setChecked] = useState(false);
  const busy = phase === "working" || phase === "sending";
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useBackClose(true, () => {
    if (picking) setPicking(false);
    else if (!busy) closeRef.current();
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const blob = await loader();
        const kind = docKind(fileName, blob.type);
        // Your own file goes in as it is even if DockIn can't read it.
        const info = kind ? await readText(blob, fileName).catch((e) => (own ? null : Promise.reject(e))) : null;
        if (!alive) return;
        if (!info && !own) throw new SolutionError("Only Word (.docx) and PDF files can be changed.");
        setSrc({ blob, info });
        setPhase("setup");
      } catch (e) {
        if (!alive) return;
        setFail({ msg: e instanceof Error ? e.message : "Could not open the file.", at: "load" });
        setPhase("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [loader, fileName, own]);

  const all = tasks ?? [];
  const auto = solution ? findMyAssignment(solution, all) : null;
  const task = (chosenId ? all.find((t) => t.id === chosenId) : null) ?? (chosenId ? null : (auto ?? given ?? null));
  const instance = task ? assignInstance(task.id) : null;
  const me = mine ?? { name: profile?.name?.trim() ?? "", roll: profile?.roll?.trim() ?? "" };
  const info = src?.info ?? null;
  const swapping = !own && !!info && !info.scanned;
  const swaps =
    swapping && solution
      ? [
          { find: solution.authorName, replace: me.name },
          { find: solution.authorRoll, replace: me.roll },
        ]
      : [];
  const theirHits = swapping && solution ? hits(info!.text, solution.authorName) + hits(info!.text, solution.authorRoll) : 0;
  const needName = swapping && !!solution?.authorName && hits(info!.text, solution.authorName) > 0 && me.name.trim().length < 2;
  const needRoll = swapping && !!solution?.authorRoll && hits(info!.text, solution.authorRoll) > 0 && me.roll.trim().length < 2;
  const practice = isPractice(instance);
  const canSubmit = instance !== null && (practice || (isNativeApp() && !!state.lms?.connected));

  async function make() {
    if (!src || needName || needRoll) return;
    setPhase("working");
    setSteps(["read"]);
    setFail(null);
    // Remember what they typed: asked once, prefilled (and editable) after.
    if (swapping && (me.name !== (profile?.name ?? "") || me.roll !== (profile?.roll ?? ""))) {
      void saveProfile({ ...(me.name.trim() ? { name: me.name.trim() } : {}), ...(me.roll.trim() ? { roll: me.roll.trim() } : {}) });
    }
    const t0 = clock();
    try {
      let out: Awaited<ReturnType<typeof makeCopy>>;
      if (info) {
        out = await makeCopy(src.blob, fileName, swaps, format, (s) => setSteps((p) => (p.includes(s) ? p : [...p, s])));
      } else {
        if (src.blob.size > 20 * 1048576) throw new SolutionError("Files over 20 MB have to be uploaded on the LMS website.");
        out = { blob: src.blob, name: fileName, kind: "pdf", changed: 0, text: "", shrunk: false };
      }
      setSteps((p) => [...p, "check"]);
      // Long enough to enjoy, never so long it feels slow.
      const rest = (swapping ? 3000 : 1600) - (clock() - t0);
      if (rest > 0) await sleep(rest);
      setCopy(out);
      setPhase("preview");
    } catch (e) {
      setFail({ msg: e instanceof Error ? e.message : "Could not make the copy.", at: "make" });
      setPhase("setup");
      toast.show(e instanceof Error ? e.message : "Could not make the copy.");
    }
  }

  async function submit() {
    if (!copy || !task || instance === null || busy) return;
    setPhase("sending");
    setFail(null);
    const t0 = clock();
    try {
      const r = await submitToLms(instance, copy.blob, copy.name);
      const rest = 2200 - (clock() - t0);
      if (rest > 0) await sleep(rest);
      await setTaskDone(task.id, true);
      setChecked(r.checked);
      navigator.vibrate?.([14, 50, 14]);
      setPhase("done");
    } catch (e) {
      const rest = 1200 - (clock() - t0);
      if (rest > 0) await sleep(rest);
      setFail({
        msg: e instanceof Error ? e.message : "The LMS did not take it.",
        webOnly: e instanceof WebOnlyLms,
        draft: e instanceof DraftOnly,
        at: "submit",
      });
      navigator.vibrate?.(30);
      setPhase("failed");
    }
  }

  const head =
    phase === "preview"
      ? "Check your copy"
      : phase === "done"
        ? "Submitted"
        : phase === "failed" && fail?.at === "submit"
          ? "Not submitted"
          : own
            ? "Hand in to LMS"
            : "Make my copy";

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  // On <body>, so nothing around the chat bubble (a transform, the chat's own
  // colours, its long-press and swipe) can reach in.
  return createPortal(
    <div
      className="paper-page fixed inset-0 z-[60] flex flex-col [animation:fade-in_160ms_ease-out]"
      role="dialog"
      aria-label={head}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
      onClick={stop}
      onContextMenu={stop}
      onKeyDown={stop}
    >
      <header className="solid-bar flex items-center gap-1.5 rounded-none border-x-0 border-t-0 px-1.5 pt-[max(0.4rem,var(--sat))] pb-1.5">
        <button onClick={() => !busy && onClose()} disabled={busy} aria-label="Close" className="grid size-11 place-items-center rounded-full active:bg-surface-2 disabled:opacity-40">
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17.5px] leading-tight font-extrabold">{head}</p>
          <p className="truncate text-[12px] text-muted">{task?.title ?? solution?.title ?? fileName}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-36">
        {phase === "load" && (
          <div className="grid place-items-center pt-24 text-muted">
            <Loader2 size={26} className="animate-spin" />
            <p className="mt-3 text-[13.5px]">Opening the file…</p>
          </div>
        )}

        {phase === "setup" && src && (
          <div className="anim-pop space-y-4">
            {!own && (
              <p className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px]">
                <Sparkles size={16} className="shrink-0 text-mess" />
                <span>
                  <b>{first(from ?? "A friend")}</b> sent this. DockIn swaps in your name and enrollment — nothing else changes.
                </span>
              </p>
            )}

            <Section label="Submitting to">
              <button onClick={() => setPicking(true)} className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-card-edge bg-card px-3.5 py-3 text-left active:scale-[0.99]">
                <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", task ? "bg-[#e07a2c] text-white" : "bg-surface-2 text-muted")}>
                  <GraduationCap size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  {task ? (
                    <>
                      <span className="block truncate text-[14.5px] font-bold">{task.title}</span>
                      <span className="block truncate text-[12px] text-muted">{[task.notes, dueLabel(task)].filter(Boolean).join(" · ")}</span>
                    </>
                  ) : (
                    <>
                      <span className="block text-[14.5px] font-bold">Pick the assignment</span>
                      <span className="block text-[12px] text-muted">{own ? "Your LMS assignment for this file" : "Couldn't match it on your LMS"}</span>
                    </>
                  )}
                </span>
                <span className="shrink-0 text-[12.5px] font-bold text-mess">{task ? "Change" : "Pick"}</span>
              </button>
              {task?.done && <p className="mt-1.5 px-1 text-[12px] text-muted">Already submitted — submitting again replaces your file on the LMS.</p>}
            </Section>

            {!own && info?.scanned && (
              <p className="flex gap-2.5 rounded-2xl bg-orange/10 px-3.5 py-3 text-[13px] leading-snug">
                <ScanLine size={17} className="mt-0.5 shrink-0 text-mess" />
                <span>
                  This PDF is a scan (photos of pages), so the name inside can&apos;t be changed. You can still submit it exactly as it is.
                </span>
              </p>
            )}

            {swapping && solution && (
              <Section label="Names in the file">
                <div className="rounded-2xl border-[1.5px] border-card-edge bg-card p-3">
                  <SwapRow
                    label="Name"
                    theirs={solution.authorName}
                    found={hits(info!.text, solution.authorName)}
                    value={me.name}
                    onChange={(v) => setMine({ ...me, name: v })}
                    placeholder="Your full name"
                    need={needName}
                  />
                  <div className="my-2.5 h-px bg-line" />
                  <SwapRow
                    label="Enrollment"
                    theirs={solution.authorRoll}
                    found={hits(info!.text, solution.authorRoll)}
                    value={me.roll}
                    onChange={(v) => setMine({ ...me, roll: v.toUpperCase() })}
                    placeholder="Your enrollment no."
                    need={needRoll}
                    mono
                  />
                </div>
                <p className="mt-1.5 px-1 text-[12px] text-muted">
                  {theirHits === 0
                    ? "Their name isn't written as text in this file, so it stays as it is."
                    : "Saved for next time — edit it here whenever you need."}
                </p>
              </Section>
            )}

            {info?.kind === "docx" && (
              <Section label="Hand in as">
                <div className="grid grid-cols-2 gap-2">
                  <FormatTile on={format === "keep"} onClick={() => setFormat("keep")} badge="DOCX" tint="bg-[#2b5797]" title="Word file" sub="Keep it as it is" />
                  <FormatTile
                    on={format === "pdf"}
                    onClick={() => (canMakePdf() ? setFormat("pdf") : toast.show("Turning Word into PDF works in the DockIn app."))}
                    badge="PDF"
                    tint="bg-[#d64545]"
                    title="PDF"
                    sub={canMakePdf() ? "Converted on your phone" : "In the app"}
                    dim={!canMakePdf()}
                  />
                </div>
              </Section>
            )}

            <p className="flex items-center gap-2 px-1 text-[12px] text-muted">
              <FileText size={14} className="shrink-0" /> {fileName} · {size(src.blob.size || fileSize)}
              {(src.blob.size || fileSize) > SOLUTION_MAX && info ? " · will be compressed to 5 MB" : ""}
            </p>
            {fail?.at === "make" && <p className="rounded-2xl bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">{fail.msg}</p>}
          </div>
        )}

        {phase === "working" && (
          <Working
            from={swapping ? solution?.authorName ?? "" : ""}
            to={swapping ? me.name : ""}
            fromRoll={swapping ? solution?.authorRoll ?? "" : ""}
            toRoll={swapping ? me.roll : ""}
            steps={steps}
            convert={format === "pdf" && info?.kind === "docx"}
            big={(src?.blob.size ?? 0) > SOLUTION_MAX}
            own={!swapping}
          />
        )}

        {phase === "preview" && copy && src && (
          <Preview
            copy={copy}
            original={swapping ? swapText(info!.text, swaps) : copy.text || info?.text || ""}
            marks={swapping ? [me.name, me.roll] : []}
            leftover={swapping && solution ? hits(copy.text, solution.authorName) + hits(copy.text, solution.authorRoll) : 0}
            swapped={swapping}
            scanned={!!info?.scanned}
          />
        )}

        {phase === "sending" && <Sending title={task?.title ?? ""} />}

        {phase === "done" && <Done title={task?.title ?? ""} checked={checked} practice={practice} />}

        {phase === "failed" && fail && (
          <div className="anim-pop pt-8 text-center">
            <div className="mx-auto grid size-24 place-items-center rounded-full bg-danger/12 text-danger [animation:check-pop_420ms_cubic-bezier(.2,1.4,.4,1)_both]">
              <AlertTriangle size={40} />
            </div>
            <p className="mt-5 text-[22px] font-extrabold">{fail.at === "submit" ? "Not submitted" : "Couldn't open it"}</p>
            <p className="mx-auto mt-2 max-w-[19rem] text-[14px] leading-snug text-muted">
              {fail.webOnly ? "Your LMS login only works on the website, so DockIn can't upload for you. Save the file and upload it on the LMS." : fail.msg}
            </p>
            {fail.at === "submit" && <p className="mt-3 text-[12.5px] text-muted">Nothing was handed in. Your copy is still here.</p>}
          </div>
        )}
      </div>

      {/* footer actions */}
      {(phase === "setup" || phase === "preview" || phase === "done" || phase === "failed") && (
        <footer className="solid-bar absolute inset-x-0 bottom-0 rounded-none border-x-0 border-b-0 px-4 pt-3 pb-[max(1rem,var(--sab))]">
          {phase === "setup" && (
            <button
              onClick={() => void make()}
              disabled={needName || needRoll}
              className="btn-leather flex h-13 w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] disabled:opacity-50"
            >
              <Sparkles size={18} /> {swapping ? "Make my copy" : own ? "Get it ready" : "Use this file"}
            </button>
          )}
          {phase === "preview" && copy && (
            <div className="space-y-2">
              {canSubmit ? (
                <>
                  {practice && (
                    <p className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-mess">
                      <FlaskConical size={13} /> Practice LMS — this stays on your phone
                    </p>
                  )}
                  <button onClick={() => void submit()} className="btn-leather flex h-13 w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px]">
                    <Send size={18} /> {practice ? "Submit to Practice LMS" : "Submit to LMS"}
                  </button>
                </>
              ) : (
                <p className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-snug text-muted">
                  {!isNativeApp()
                    ? "Submitting works in the DockIn app. Save the file and upload it on the LMS."
                    : !state.lms?.connected
                      ? "Connect your LMS (Profile → College accounts) to submit from here."
                      : "Pick the assignment (go back) to submit from here."}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setPhase("setup")} className="btn-paper flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[13.5px] font-bold">
                  <ArrowLeft size={15} /> Back
                </button>
                <button onClick={() => void handOver(copy.blob, copy.name)} className="btn-paper flex h-11 flex-[1.3] items-center justify-center gap-1.5 rounded-2xl text-[13.5px] font-bold">
                  <Eye size={15} /> Open / save
                </button>
              </div>
            </div>
          )}
          {phase === "done" && (
            <button onClick={onClose} className="btn-leather flex h-13 w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px]">
              <Check size={18} /> Done
            </button>
          )}
          {phase === "failed" && (
            <div className="space-y-2">
              {fail?.at === "submit" && !fail.webOnly && (
                <button onClick={() => void submit()} className="btn-leather flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px]">
                  <RotateCcw size={17} /> Try again
                </button>
              )}
              <div className="flex gap-2">
                {copy && (
                  <button onClick={() => void handOver(copy.blob, copy.name)} className="btn-paper flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[13.5px] font-bold">
                    <Download size={15} /> Save file
                  </button>
                )}
                {fail?.at === "submit" ? (
                  <a href={task?.url || LMS_HOME} target="_blank" rel="noreferrer" className="btn-paper flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[13.5px] font-bold">
                    Open LMS <ExternalLink size={14} />
                  </a>
                ) : (
                  <button onClick={onClose} className="btn-paper flex h-11 flex-1 items-center justify-center rounded-2xl text-[13.5px] font-bold">
                    Close
                  </button>
                )}
              </div>
            </div>
          )}
        </footer>
      )}

      {picking && (
        <div className="absolute inset-0 z-[2] flex flex-col bg-black/45 [animation:fade-in_140ms_ease-out]" onClick={() => setPicking(false)}>
          <div className="anim-sheet paper-page mt-auto max-h-[78dvh] overflow-y-auto rounded-t-3xl px-4 pt-3 pb-[max(1.25rem,var(--sab))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <p className="mb-3 text-[18px] font-extrabold">Your LMS assignments</p>
            {pickableAssignments(all).length === 0 ? (
              <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] text-muted">
                {state.lms?.connected ? "No open assignments on your LMS right now." : "Connect your LMS (Profile → College accounts) to see your assignments."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {pickableAssignments(all).map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => {
                        setChosenId(t.id);
                        setPicking(false);
                      }}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-3 py-2.5 text-left",
                        task?.id === t.id ? "border-[#e07a2c] bg-mess-soft" : "border-card-edge bg-card",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-bold">{t.title}</span>
                        <span className="block truncate text-[12px] text-muted">{[t.notes, dueLabel(t)].filter(Boolean).join(" · ")}</span>
                      </span>
                      {t.done && <span className="shrink-0 rounded-full bg-safe/15 px-2 py-0.5 text-[11px] font-bold text-safe">Submitted</span>}
                      {task?.id === t.id && <Check size={18} className="shrink-0 text-mess" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-[12px] font-extrabold tracking-wide text-muted uppercase">{label}</p>
      {children}
    </div>
  );
}

function SwapRow({
  label,
  theirs,
  found,
  value,
  onChange,
  placeholder,
  need,
  mono,
}: {
  label: string;
  theirs: string;
  found: number;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  need: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="font-bold text-muted">{label}</span>
        <span className={cx("font-semibold", found ? "text-muted" : "text-warn")}>{found ? `in the file ${found}×` : "not in the file"}</span>
      </div>
      <p className={cx("mt-1 truncate text-[13.5px] text-muted line-through decoration-[#e07a2c]/70 decoration-2", mono && "font-mono")}>{theirs || "—"}</p>
      <div className="mt-1 flex items-center gap-2">
        <ArrowRight size={15} className="shrink-0 text-mess" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 80))}
          placeholder={placeholder}
          autoFocus={need}
          className={cx(
            "h-11 min-w-0 flex-1 rounded-xl border-[1.5px] bg-bg px-3 text-[15.5px] font-bold outline-none focus:border-orange",
            need ? "border-[#e07a2c]" : "border-card-edge",
            mono && "font-mono tracking-wide",
          )}
        />
      </div>
    </div>
  );
}

function FormatTile({ on, onClick, badge, tint, title, sub, dim }: { on: boolean; onClick: () => void; badge: string; tint: string; title: string; sub: string; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "relative flex items-center gap-2.5 rounded-2xl border-[1.5px] p-3 text-left transition active:scale-[0.98]",
        on ? "border-[#e07a2c] bg-mess-soft" : "border-card-edge bg-card",
        dim && "opacity-60",
      )}
    >
      <span className={cx("grid h-10 w-9 shrink-0 place-items-center rounded-lg text-[9.5px] font-extrabold text-white", tint)}>{badge}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-extrabold">{title}</span>
        <span className="block text-[11.5px] leading-tight text-muted">{sub}</span>
      </span>
      {on && (
        <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-[#e07a2c] text-white">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The animations

const STEP_LABEL: Record<Step, string> = {
  read: "Reading the file",
  swap: "Swapping name & enrollment",
  convert: "Turning it into a PDF",
  shrink: "Squeezing it under 5 MB",
  check: "Final check",
};

/** Types `text` out once `start` ms have passed; returns how much is showing. */
function useTyped(text: string, start: number, every = 55): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    let timer = 0;
    const begin = window.setTimeout(() => {
      timer = window.setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) window.clearInterval(timer);
      }, every);
    }, start);
    return () => {
      window.clearTimeout(begin);
      window.clearInterval(timer);
    };
  }, [text, start, every]);
  return Math.min(n, text.length);
}

function Working({
  from,
  to,
  fromRoll,
  toRoll,
  steps,
  convert,
  big,
  own,
}: {
  from: string;
  to: string;
  fromRoll: string;
  toRoll: string;
  steps: Step[];
  convert: boolean;
  big: boolean;
  own: boolean;
}) {
  const name = useTyped(to, 1100);
  const roll = useTyped(toRoll, 1100 + to.length * 55 + 250, 60);
  const typedAll = name >= to.length && roll >= toRoll.length;
  const [line, setLine] = useState(0);
  const lines = own
    ? ["Opening it up…", "Checking every page…", "Lining things up…", "Almost there…"]
    : [`Finding ${first(from)}'s name…`, "Rubbing it out, neatly…", "Writing yours in…", "Matching the font…", "Checking every page…", "Almost there…"];
  useEffect(() => {
    const t = window.setInterval(() => setLine((x) => x + 1), 1100);
    return () => window.clearInterval(t);
  }, []);
  const plan: Step[] = ["read", ...(own ? [] : (["swap"] as Step[])), ...(convert ? (["convert"] as Step[]) : []), ...(big ? (["shrink"] as Step[]) : []), "check"];
  const reached = (s: Step) => steps.includes(s);
  const current = plan.find((s) => !reached(s)) ?? "check";

  return (
    <div className="anim-pop flex flex-col items-center pt-2">
      {/* the page being edited */}
      <div className="studio-doc relative w-[min(16rem,78vw)] overflow-hidden rounded-[14px] bg-white px-4 pt-4 pb-5 text-[#2a2420] shadow-[0_24px_48px_-24px_rgb(60_30_10/0.55)] ring-1 ring-black/5">
        <div className="mb-3 h-2.5 w-3/5 rounded-full bg-[#2a2420]/80" />
        <Row label="Name:">
          {own ? (
            <span className="h-2 w-24 rounded-full bg-[#2a2420]/20" />
          ) : (
            <Swap old={from} typed={to.slice(0, name)} showCaret={name < to.length && name > 0} gone={name > 0} />
          )}
        </Row>
        <Row label="Enroll:">
          {own ? (
            <span className="h-2 w-20 rounded-full bg-[#2a2420]/20" />
          ) : (
            <Swap old={fromRoll} typed={toRoll.slice(0, roll)} showCaret={roll < toRoll.length && roll > 0} gone={roll > 0} mono />
          )}
        </Row>
        <div className="mt-3 space-y-1.5">
          {[92, 100, 84, 96, 70, 88, 60].map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-[#2a2420]/12" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="studio-beam pointer-events-none absolute inset-x-0 top-0 h-14" />
        {typedAll && !own && (
          <>
            {[
              ["12%", "22%", "0ms"],
              ["84%", "18%", "120ms"],
              ["70%", "44%", "240ms"],
              ["20%", "48%", "360ms"],
            ].map(([x, y, d], i) => (
              <Sparkles key={i} size={16} className="studio-spark absolute text-[#e07a2c]" style={{ left: x, top: y, animationDelay: d }} />
            ))}
          </>
        )}
      </div>

      <p key={line} className="mt-6 h-5 text-[15px] font-extrabold [animation:rise-quick_300ms_ease-out_both]">
        {lines[line % lines.length]}
      </p>

      <ul className="mt-5 w-full max-w-[18rem] space-y-2">
        {plan.map((s) => {
          const ok = reached(s) && s !== current;
          const now = s === current;
          return (
            <li key={s} className={cx("flex items-center gap-2.5 text-[13.5px] transition-opacity", !ok && !now && "opacity-45")}>
              <span className={cx("grid size-6 shrink-0 place-items-center rounded-full", ok ? "bg-safe text-white" : now ? "bg-[#e07a2c]/15 text-[#e07a2c]" : "bg-surface-2 text-muted")}>
                {ok ? <Check size={13} strokeWidth={3} className="[animation:check-pop_300ms_ease-out_both]" /> : now ? <Loader2 size={13} className="animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={cx(now && "font-bold")}>{STEP_LABEL[s]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-1.5 flex h-6 items-center gap-2 text-[12.5px]">
      <span className="w-12 shrink-0 font-bold">{label}</span>
      <span className="relative flex min-w-0 flex-1 items-center">{children}</span>
    </div>
  );
}

function Swap({ old, typed, showCaret, gone, mono }: { old: string; typed: string; showCaret: boolean; gone: boolean; mono?: boolean }) {
  return (
    <span className={cx("relative block min-w-0 flex-1 truncate", mono && "font-mono text-[11.5px]")}>
      {!gone ? (
        <span className="studio-old rounded bg-[#ffd8a8]/70 px-0.5">{old || "—"}</span>
      ) : (
        <span className="rounded bg-[#ffe9cf] px-0.5 font-bold text-[#b45f1e]">
          {typed}
          {showCaret && <span className="studio-caret ml-px inline-block h-3.5 w-[2px] translate-y-0.5 bg-[#e07a2c]" />}
        </span>
      )}
    </span>
  );
}

function Sending({ title }: { title: string }) {
  const [i, setI] = useState(0);
  const lines = ["Uploading to your LMS…", "Handing it in…", "Asking the LMS to confirm…"];
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => Math.min(x + 1, 2)), 1300);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="anim-pop flex flex-col items-center pt-16">
      <div className="relative h-40 w-44">
        <div className="studio-fly absolute left-1/2 top-0 grid h-16 w-12 -translate-x-1/2 place-items-center rounded-lg bg-white shadow-lg ring-1 ring-black/5">
          <FileText size={22} className="text-[#e07a2c]" />
        </div>
        <div className="absolute inset-x-4 bottom-0 grid h-16 place-items-center rounded-2xl bg-gradient-to-b from-[#e07a2c] to-[#b45f1e] text-white shadow-[0_16px_30px_-16px_rgb(180_95_30/0.9)]">
          <span className="flex items-center gap-1.5 text-[14px] font-extrabold">
            <GraduationCap size={18} /> LMS
          </span>
        </div>
      </div>
      <p key={i} className="mt-8 text-[16px] font-extrabold [animation:rise-quick_300ms_ease-out_both]">
        {lines[i]}
      </p>
      <p className="mt-1.5 max-w-[17rem] truncate text-center text-[12.5px] text-muted">{title}</p>
      <p className="mt-6 text-[11.5px] text-muted">With your own LMS login, to your own submission.</p>
    </div>
  );
}

function Done({ title, checked, practice }: { title: string; checked: boolean; practice: boolean }) {
  return (
    <div className="flex flex-col items-center pt-14 text-center">
      <div className="relative">
        <span className="studio-halo absolute inset-0 rounded-full bg-safe/25" />
        <div className="relative grid size-28 place-items-center rounded-full bg-safe text-white shadow-[0_18px_40px_-16px_rgb(30_140_80/0.8)] [animation:check-pop_520ms_cubic-bezier(.2,1.5,.4,1)_both]">
          <Check size={56} strokeWidth={3} />
        </div>
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <span key={k} className="studio-burst absolute top-1/2 left-1/2 size-2 rounded-full" style={{ "--a": `${k * 60}deg`, background: k % 2 ? "#e07a2c" : "#2fa36b" } as CSSProperties} />
        ))}
      </div>
      <p className="mt-7 text-[24px] font-extrabold [animation:rise-quick_400ms_200ms_ease-out_both]">{practice ? "Submitted to Practice LMS" : "Submitted to LMS"}</p>
      <p className="mt-1.5 max-w-[19rem] text-[14px] text-muted [animation:rise-quick_400ms_300ms_ease-out_both]">{title}</p>
      <p className="mt-4 rounded-full bg-safe/12 px-3 py-1 text-[12px] font-bold text-safe [animation:rise-quick_400ms_420ms_ease-out_both]">
        {practice ? "Practice — nothing went to the real LMS" : checked ? "The LMS confirmed it's handed in" : "Uploaded and handed in"}
      </p>
      {practice && <p className="mt-2 max-w-[18rem] text-[12px] text-muted">Open the handed-in file in Settings → Practice LMS to check the name.</p>}
    </div>
  );
}

function Preview({
  copy,
  original,
  marks,
  leftover,
  swapped,
  scanned,
}: {
  copy: Awaited<ReturnType<typeof makeCopy>>;
  original: string;
  marks: string[];
  leftover: number;
  swapped: boolean;
  scanned: boolean;
}) {
  const ext = (copy.name.split(".").pop() ?? "").toUpperCase();
  const text = original.trim();
  return (
    <div className="anim-pop space-y-3">
      <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-card-edge bg-card px-3.5 py-3">
        <span className={cx("grid h-12 w-10 shrink-0 place-items-center rounded-lg text-[10px] font-extrabold text-white", ext === "PDF" ? "bg-[#d64545]" : ext === "DOCX" ? "bg-[#2b5797]" : "bg-[#7a6a5a]")}>
          {ext.slice(0, 4)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-bold">{copy.name}</p>
          <p className="text-[12px] text-muted">
            {size(copy.blob.size)}
            {copy.shrunk && " · compressed"}
          </p>
        </div>
        <button onClick={() => void handOver(copy.blob, copy.name)} className="btn-paper inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold">
          <Eye size={14} /> Open
        </button>
      </div>

      {swapped && (
        <div className="flex flex-wrap gap-1.5">
          <span className="flex items-center gap-1 rounded-full bg-safe/12 px-2.5 py-1 text-[12px] font-bold text-safe">
            <Check size={13} strokeWidth={3} /> {copy.changed} {copy.changed === 1 ? "place" : "places"} changed
          </span>
          {leftover === 0 ? (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-bold text-muted">Their name is gone</span>
          ) : (
            <span className="rounded-full bg-orange/15 px-2.5 py-1 text-[12px] font-bold text-mess">Still there in {leftover} place{leftover === 1 ? "" : "s"}</span>
          )}
        </div>
      )}
      {leftover > 0 && (
        <p className="flex gap-2 rounded-2xl bg-orange/10 px-3.5 py-2.5 text-[12.5px] leading-snug">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-mess" />
          Some of their name couldn&apos;t be changed (it may be split oddly or inside a picture). Open the file and check before submitting.
        </p>
      )}
      {scanned && <p className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-muted">Scanned PDF — it goes in exactly as it was sent.</p>}

      {text ? (
        <div className="max-h-[48dvh] overflow-y-auto rounded-2xl border-[1.5px] border-card-edge bg-white px-4 py-3.5 text-[13px] leading-relaxed whitespace-pre-wrap text-[#2a2420] shadow-sm">
          {marked(text.slice(0, 3500), marks).map((p, i) =>
            typeof p === "string" ? (
              <span key={i}>{p}</span>
            ) : (
              <mark key={i} className="rounded bg-[#ffd8a8] px-0.5 font-bold text-[#2a2420]">
                {p.m}
              </mark>
            ),
          )}
          {text.length > 3500 && <span className="text-[#2a2420]/50"> …</span>}
        </div>
      ) : (
        <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] text-muted">No text to preview — tap Open to look at the file.</p>
      )}
      <p className="px-1 text-center text-[11.5px] text-muted">Text only — tap Open to see the real file.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// On the Tasks page

/** Solutions friends sent for this assignment (newest first), from any chat. */
export function useSolutionsFor(task: Task | null | undefined): { id: string; f: ChatFile; from: string; author: string }[] {
  return (
    useLiveQuery(async () => {
      if (!task || assignInstance(task.id) === null) return [];
      const rows = await db.messages.filter((m) => m.kind === "file" && !m.deleted && !!(m.data as ChatFile | null)?.solution?.title).toArray();
      const friends = new Map((await db.friends.toArray()).map((x) => [x.id, x.name]));
      return rows
        .filter((m) => findMyAssignment((m.data as ChatFile).solution!, [task]) !== null)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((m) => {
          const f = m.data as ChatFile;
          return { id: m.id, f, from: friends.get(m.author) ?? f.solution!.authorName ?? "A friend", author: m.author };
        })
        .filter((x, i, all) => all.findIndex((y) => y.f.path === x.f.path) === i);
    }, [task?.id, task?.title]) ?? []
  );
}

/**
 * An LMS assignment's own hand-in on the Tasks page: upload your file (and
 * optionally turn Word into PDF), or take a friend's solution with your name.
 */
export function LmsHandIn({ task }: { task: Task }) {
  const input = useRef<HTMLInputElement>(null);
  const me = useAuth().session?.user.id ?? null;
  const [own, setOwn] = useState<File | null>(null);
  const [theirs, setTheirs] = useState<{ f: ChatFile; from: string } | null>(null);
  const solutions = useSolutionsFor(task).filter((s) => s.author !== me);
  if (assignInstance(task.id) === null) {
    // Only a quiz has to be done on the LMS itself.
    return task.url && (task.kind === "quiz" || task.id.startsWith("lms-quiz-")) ? (
      <a href={task.url} target="_blank" rel="noreferrer" className="btn-paper mb-4 flex h-12 items-center justify-center gap-1.5 rounded-2xl px-4 text-[14px]">
        Take the quiz on LMS ↗
      </a>
    ) : null;
  }
  return (
    <div className="mb-4">
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setOwn(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="btn-leather flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14.5px]"
      >
        <Send size={17} /> {task.done ? "Upload again to LMS" : "Upload my file to LMS"}
      </button>
      {solutions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {solutions.slice(0, 3).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTheirs({ f: s.f, from: s.from })}
              className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-[#e9a865] bg-gradient-to-br from-[#fff3e4] to-[#ffe7cf] px-3 py-2.5 text-left active:scale-[0.99] dark:from-[#3b2a1b] dark:to-[#2c1f15]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e07a2c] text-white">
                <PenLine size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-extrabold">Use {first(s.from)}&apos;s solution</span>
                <span className="block truncate text-[12px] text-muted">Your name on it, then submit · {s.f.name}</span>
              </span>
              <ChevronRight size={17} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>
      )}
      {own && (
        <CopyStudio key={own.name + own.lastModified} fileName={own.name} fileSize={own.size} load={async () => own} task={task} onClose={() => setOwn(null)} />
      )}
      {theirs && (
        <CopyStudio
          key={theirs.f.path}
          fileName={theirs.f.name}
          fileSize={theirs.f.size}
          load={() => downloadChatFile(theirs.f)}
          solution={theirs.f.solution}
          from={theirs.from}
          task={task}
          onClose={() => setTheirs(null)}
        />
      )}
    </div>
  );
}
