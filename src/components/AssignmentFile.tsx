"use client";

import { useRef, useState } from "react";
import { Check, Download, FileText, Loader2, Paperclip, X } from "lucide-react";
import type { ShareFile } from "@/lib/types";
import { MAX_FILE_BYTES, SocialError, copyAssignment, fileKind } from "@/lib/social";
import { useToast } from "./ui";

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
}

/**
 * Attach your file to a shared task — as a reference for the group (the
 * question paper, your notes, a format to follow). It is shared exactly as it
 * is; DockIn never rewrites names in it or submits it for anyone.
 */
export function AttachPicker({
  value,
  onChange,
}: {
  value: Attachment | null;
  onChange: (next: Attachment | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    const kind = fileKind(file.name, file.type);
    if (!kind) return setProblem("Attach a Word file (.docx) or a PDF.");
    if (file.size > MAX_FILE_BYTES) return setProblem("That file is over 10 MB.");
    onChange({ file, kind });
  }

  return (
    <div className="mb-4">
      <input
        ref={input}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3 py-2.5">
          <FileText size={17} className="shrink-0 text-mess" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{value.file.name}</p>
            <p className="text-[12px] text-muted">{kb(value.file.size)} · shared as a reference</p>
          </div>
          <button onClick={() => onChange(null)} aria-label="Remove the file" className="grid size-8 place-items-center rounded-full">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => input.current?.click()}
          className="flex w-full items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-card-edge px-3.5 py-3 text-left text-[13.5px] text-muted"
        >
          <Paperclip size={16} /> Attach a file for reference (optional)
        </button>
      )}
      {problem && <p className="mt-1.5 text-[12.5px] text-danger">{problem}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opening it, as a reader
// ---------------------------------------------------------------------------

export function SharedFileRow({ file, mine }: { file: ShareFile; mine: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const copy = await copyAssignment(file);
      await handOver(copy.blob, copy.name);
      setDone(true);
    } catch (e) {
      toast.show(e instanceof SocialError ? e.message : "Could not get that file.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-2 flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-mess">
        <FileText size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{file.name}</p>
        <p className="text-[12px] text-muted">
          {kb(file.size)} · {mine ? "your file" : "reference"}
        </p>
      </div>
      <button
        onClick={() => void open()}
        disabled={busy}
        className="btn-leather inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : done ? <Check size={14} /> : <Download size={14} />}
        Open
      </button>
    </div>
  );
}
