"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import type { ShareFile } from "@/lib/types";
import { MAX_FILE_BYTES, SocialError, copyAssignment, fileKind } from "@/lib/social";
import { countIn, guessRolls, readDocxText } from "@/lib/docx";
import { getProfile, saveProfile } from "@/lib/repo";
import { Button, Field, Sheet, cx, inputCls, useToast } from "./ui";

/** Where the finished file actually has to go. */
export const LMS_URL = "https://lms.bennett.edu.in/";

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/**
 * Hands a file to the person, whichever way their phone does that.
 *
 * On a phone the share sheet is the useful one, because the next step is "open
 * in Word" rather than "put it in Downloads and go looking for it"; on a desktop
 * there is no share sheet, so it falls back to a plain download.
 */
async function handOver(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      // The person closed the sheet: that is a choice, not a failure.
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// Attaching, as the author
// ---------------------------------------------------------------------------

export interface Attachment {
  file: File;
  kind: "docx" | "pdf";
  /** The author's OWN name and roll, exactly as they are written inside the file. */
  name: string;
  roll: string;
  /** Everything the document says, so the two fields can be checked as they are typed. */
  text: string | null;
}

/**
 * The file picker on the share sheet, and the two strings the whole feature
 * hangs on.
 *
 * These two fields are the author's own details — what is written in the
 * document today — not the reader's. That is easy to read the wrong way round,
 * so the app does not rely on the labels: it reads the document, fills both
 * fields in from what it finds, and says how many times each one appears. In
 * the normal case the author changes nothing and just sees that it is right.
 */
export function AttachPicker({
  value,
  onChange,
}: {
  value: Attachment | null;
  onChange: (next: Attachment | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const profile = useLiveQuery(() => getProfile(), []);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    const kind = fileKind(file.name, file.type);
    if (!kind) return setProblem("Attach a Word file (.docx) or a PDF.");
    if (file.size > MAX_FILE_BYTES) return setProblem("That file is over 10 MB.");

    const myName = profile?.name?.trim() ?? "";
    const myRoll = profile?.roll?.trim() ?? "";
    if (kind !== "docx") {
      onChange({ file, kind, name: myName, roll: myRoll, text: null });
      return;
    }

    onChange({ file, kind, name: myName, roll: myRoll, text: null });
    setReading(true);
    try {
      const text = await readDocxText(file);
      // Work out what is really in there rather than trusting the profile: the
      // name on an assignment is often fuller than the one in Settings, and the
      // roll is in the document and usually in its filename too.
      const rolls = guessRolls(`${text}\n${file.name}`);
      const roll = myRoll && countIn(text, myRoll) > 0 ? myRoll : (rolls[0] ?? myRoll);
      onChange({ file, kind, name: myName, roll, text });
    } catch {
      setProblem("That Word file could not be read. Try saving it again as .docx.");
      onChange(null);
    }
    setReading(false);
  }

  if (!value) {
    return (
      <div className="mb-4">
        <input
          ref={input}
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <button
          onClick={() => input.current?.click()}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line px-3.5 py-3 text-left"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
            <Paperclip size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14.5px] font-medium">Attach the file</span>
            <span className="block text-[12.5px] text-muted">
              Word file, and everyone gets a copy with their own name on it
            </span>
          </span>
        </button>
        {problem && <p className="mt-2 text-[13px] text-danger">{problem}</p>}
      </div>
    );
  }

  const text = value.text;
  const hits = {
    name: text ? countIn(text, value.name) : 0,
    roll: text ? countIn(text, value.roll) : 0,
  };
  // Anything in the document that looks like a roll number and is not the one
  // already chosen — one tap to correct it.
  const otherRolls = (text ? guessRolls(`${text}\n${value.file.name}`) : [])
    .filter((r) => r.toLowerCase() !== value.roll.trim().toLowerCase())
    .slice(0, 3);

  return (
    <div className="mb-4 rounded-2xl bg-surface-2 p-3.5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-accent">
          {reading ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium">{value.file.name}</p>
          <p className="text-[12.5px] text-muted">
            {value.kind === "docx" ? "Word file" : "PDF"} · {kb(value.file.size)}
          </p>
        </div>
        <button
          onClick={() => onChange(null)}
          aria-label="Remove the file"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted"
        >
          <X size={16} />
        </button>
      </div>

      {value.kind === "pdf" ? (
        <p className="mt-3 flex gap-2 rounded-xl bg-surface px-3 py-2.5 text-[12.5px] text-muted">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>
            A PDF cannot be edited, so your classmates will get it exactly as it is, with your name
            inside. Share the Word file instead if they are meant to submit their own copy.
          </span>
        </p>
      ) : (
        <div className="mt-4">
          <p className="text-[13px] font-medium">Your details inside this file</p>
          <p className="mt-0.5 mb-2.5 text-[12.5px] text-muted">
            Each person&rsquo;s copy gets their own name and roll in place of these.
          </p>

          <Field label="Your name, as written in the document" compact>
            <input
              className={inputCls}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="Sachin Kumar"
            />
          </Field>
          {text && <Hits found={hits.name} what="name" typed={value.name} />}

          <Field label="Your roll number, as written in the document" compact>
            <input
              className={inputCls}
              value={value.roll}
              onChange={(e) => onChange({ ...value, roll: e.target.value })}
              placeholder="E23CSEU0155"
            />
          </Field>
          {text && <Hits found={hits.roll} what="roll number" typed={value.roll} />}

          {otherRolls.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-muted">Also in the file:</span>
              {otherRolls.map((r) => (
                <button
                  key={r}
                  onClick={() => onChange({ ...value, roll: r })}
                  className="rounded-full bg-surface px-2.5 py-1 font-mono text-[12px] font-medium"
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {!value.name.trim() && !value.roll.trim() && (
            <p className="mt-1 text-[12.5px] text-muted">
              Leave both blank and everyone gets your file exactly as it is.
            </p>
          )}
        </div>
      )}
      {problem && <p className="mt-2 text-[13px] text-danger">{problem}</p>}
    </div>
  );
}

/**
 * How many times this will actually be replaced.
 *
 * A count rather than a tick: "found 4 times" tells the author the swap will
 * reach the cover page and the declaration, and a quiet "1" on a name they
 * expected everywhere is worth noticing too.
 */
function Hits({ found, what, typed }: { found: number; what: string; typed: string }) {
  if (!typed.trim()) return null;
  if (found > 0) {
    return (
      <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-safe">
        <Check size={13} /> Found {found} {found === 1 ? "time" : "times"} — will be swapped.
      </p>
    );
  }
  return (
    <p className="mb-2 flex gap-1.5 text-[12.5px] text-warn">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>
        This {what} is not in the document, so nothing will change. Put in the {what} exactly as it
        appears inside the file.
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Taking a copy, as the reader
// ---------------------------------------------------------------------------

/**
 * The attached file on a shared assignment, and the one button that matters:
 * take a copy with my name on it.
 *
 * Old way: download, convert to Word, find and replace, convert back, open the
 * LMS, upload. This is: tap, check it, upload.
 */
export function SharedFileRow({ file, mine }: { file: ShareFile; mine: boolean }) {
  const toast = useToast();
  const profile = useLiveQuery(() => getProfile(), []);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState("");
  const [roll, setRoll] = useState("");
  const [done, setDone] = useState(false);

  const personalises = file.type === "docx" && (!!file.authorName || !!file.authorRoll);
  const needsRoll = !!file.authorRoll;

  async function take(as?: { name: string; roll: string }) {
    const me = as ?? { name: profile?.name?.trim() ?? "", roll: profile?.roll?.trim() ?? "" };
    // Only ask for what the swap actually needs, and only once.
    if (personalises && !mine && (!me.name || (needsRoll && !me.roll))) {
      setName(me.name);
      setRoll(me.roll);
      setAsking(true);
      return;
    }
    setBusy(true);
    try {
      const copy = await copyAssignment(file, mine ? {} : me);
      await handOver(copy.blob, copy.name);
      setDone(true);
      toast.show(
        copy.personalised ? "Your copy is ready, with your name on it" : "File saved",
      );
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not get that file.");
    }
    setBusy(false);
  }

  async function confirmWho() {
    const me = { name: name.trim(), roll: roll.trim() };
    if (!me.name) return;
    await saveProfile({ name: me.name, roll: me.roll || undefined });
    setAsking(false);
    await take(me);
  }

  return (
    <>
      <div className="mt-2 flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-accent">
          <FileText size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium">{file.name}</p>
          <p className="text-[12px] text-muted">
            {kb(file.size)}
            {mine
              ? " · your file"
              : personalises
                ? " · your copy gets your name"
                : file.type === "pdf"
                  ? " · PDF, cannot be edited"
                  : ""}
          </p>
        </div>
        <button
          onClick={() => void take()}
          disabled={busy}
          className={cx(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium",
            "bg-accent text-on-accent disabled:opacity-60",
          )}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : done ? (
            <Check size={14} />
          ) : (
            <Download size={14} />
          )}
          {mine ? "Open" : done ? "Again" : "My copy"}
        </button>
      </div>

      {done && !mine && (
        <a
          href={LMS_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-[13px] font-medium text-accent"
        >
          <span>
            Check it, save it as PDF, then upload
            <span className="block text-[12px] font-normal opacity-80">Opens the LMS</span>
          </span>
          <ExternalLink size={15} className="shrink-0" />
        </a>
      )}

      <Sheet open={asking} onClose={() => setAsking(false)} title="Put your name on it">
        <p className="mb-4 text-[13.5px] text-muted">
          This goes in place of {file.authorName ? <b className="text-text">{file.authorName}</b> : "the author's name"}{" "}
          everywhere in the document. Saved for next time.
        </p>
        <Field label="Your name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As it should appear"
            autoFocus
          />
        </Field>
        {needsRoll && (
          <Field label="Your roll number">
            <input
              className={inputCls}
              value={roll}
              onChange={(e) => setRoll(e.target.value)}
              placeholder="E23CSEU0155"
            />
          </Field>
        )}
        <Button className="mt-1 w-full" onClick={() => void confirmWho()} disabled={!name.trim()}>
          Get my copy
        </Button>
      </Sheet>
    </>
  );
}
