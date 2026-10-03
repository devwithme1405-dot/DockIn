"use client";

import { useEffect, useRef, useState } from "react";
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
import { readDocxText } from "@/lib/docx";
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
  /** The author's name and roll as they appear inside the document. */
  name: string;
  roll: string;
  /** Whether those two strings were actually found in the text. */
  found: { name: boolean; roll: boolean } | null;
}

/**
 * The file picker on the share sheet, plus the two strings that make the whole
 * feature work.
 *
 * Everything hangs on replacing the right text, and only the author knows what
 * that text is — so rather than guessing, the app prefills from their profile,
 * then actually reads the document and says whether it found it. A mismatch is
 * caught here, by the one person who can fix it, instead of silently reaching
 * thirty classmates.
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

    const name = profile?.name?.trim() ?? "";
    const roll = profile?.roll?.trim() ?? "";
    onChange({ file, kind, name, roll, found: null });

    if (kind !== "docx") return;
    setReading(true);
    try {
      const text = (await readDocxText(file)).toLowerCase();
      onChange({
        file,
        kind,
        name,
        roll,
        found: {
          name: !!name && text.includes(name.toLowerCase()),
          roll: !!roll && text.includes(roll.toLowerCase()),
        },
      });
    } catch {
      setProblem("That Word file could not be read. Try saving it again as .docx.");
      onChange(null);
    }
    setReading(false);
  }

  // Re-check against the document whenever the author corrects either string.
  const text = useRef<string | null>(null);
  useEffect(() => {
    if (!value || value.kind !== "docx") return;
    let alive = true;
    void (async () => {
      if (text.current === null) {
        try {
          text.current = (await readDocxText(value.file)).toLowerCase();
        } catch {
          return;
        }
      }
      const body = text.current;
      const found = {
        name: !!value.name.trim() && body.includes(value.name.trim().toLowerCase()),
        roll: !!value.roll.trim() && body.includes(value.roll.trim().toLowerCase()),
      };
      if (!alive) return;
      if (found.name !== value.found?.name || found.roll !== value.found?.roll) {
        onChange({ ...value, found });
      }
    })();
    return () => {
      alive = false;
    };
  }, [value, onChange]);

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

  const swapsReady = value.kind === "docx" && !!value.name.trim();

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
        <div className="mt-3">
          <p className="mb-2 text-[12.5px] text-muted">
            Swapped for each person&rsquo;s own details when they take a copy.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Your name in the file" compact>
              <input
                className={inputCls}
                value={value.name}
                onChange={(e) => onChange({ ...value, name: e.target.value })}
                placeholder="Sachin Kumar"
              />
            </Field>
            <Field label="Your roll in the file" compact>
              <input
                className={inputCls}
                value={value.roll}
                onChange={(e) => onChange({ ...value, roll: e.target.value })}
                placeholder="E23CSEU0155"
              />
            </Field>
          </div>
          {value.found && <FoundNote found={value.found} hasRoll={!!value.roll.trim()} />}
          {!swapsReady && (
            <p className="text-[12.5px] text-muted">
              Leave these blank and everyone gets your file unchanged.
            </p>
          )}
        </div>
      )}
      {problem && <p className="mt-2 text-[13px] text-danger">{problem}</p>}
    </div>
  );
}

/** Says in words what was found, because a tick on its own is not an answer. */
function FoundNote({ found, hasRoll }: { found: { name: boolean; roll: boolean }; hasRoll: boolean }) {
  const missing = [!found.name && "name", hasRoll && !found.roll && "roll number"].filter(
    Boolean,
  ) as string[];

  if (missing.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-safe">
        <Check size={13} /> Found in the document, so the swap will work.
      </p>
    );
  }
  return (
    <p className="flex gap-1.5 text-[12.5px] text-warn">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>
        Could not find your {missing.join(" or ")} in the document — check the spelling, or it will
        stay as it is in everyone&rsquo;s copy.
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
