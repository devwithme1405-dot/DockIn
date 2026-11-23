"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Eye, FileText, Loader2, SendHorizontal } from "lucide-react";
import { readDocxText } from "@/lib/docx";
import { WebOnlyLms, submitToLms } from "@/lib/lmsSubmit";
import { useCollege } from "@/lib/college";
import { isNativeApp } from "@/lib/native";
import { Sheet, cx, useToast } from "./ui";

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Splits text around every occurrence of the given strings so they can be marked. */
function marked(text: string, marks: string[]): (string | { m: string })[] {
  const keys = marks.map((m) => m.trim()).filter((m) => m.length > 1);
  if (!keys.length) return [text];
  const re = new RegExp(`(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 === 1 ? { m: part } : part));
}

/**
 * Check, then hand in: the file you are about to submit, a preview of what is
 * written in it (with your name and roll marked), and one button that submits
 * it to YOUR assignment on the LMS with your own saved login.
 */
export function LmsSubmitSheet({
  open,
  onClose,
  title,
  file,
  instance,
  lmsUrl,
  marks = [],
  onOpenFile,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  file: { blob: Blob; name: string } | null;
  instance: number | null;
  lmsUrl?: string;
  marks?: string[];
  onOpenFile: () => void;
  onSubmitted?: () => void;
}) {
  const toast = useToast();
  const { state } = useCollege();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [webOnly, setWebOnly] = useState(false);
  const lmsOn = !!state.lms?.connected;
  const canSubmit = isNativeApp() && lmsOn && instance !== null;

  useEffect(() => {
    let alive = true;
    if (!open || !file) return;
    const isDocx = /\.docx$/i.test(file.name);
    void (isDocx ? readDocxText(file.blob).catch(() => null) : Promise.resolve(null)).then((t) => {
      if (alive) setText(t);
    });
    return () => {
      alive = false;
    };
  }, [open, file]);

  async function submit() {
    if (!file || instance === null) return;
    setBusy(true);
    try {
      await submitToLms(instance, file.blob, file.name, { url: lmsUrl, title });
      setDone(true);
      onSubmitted?.();
      toast.show("Submitted on the LMS ✓");
    } catch (e) {
      if (e instanceof WebOnlyLms) setWebOnly(true);
      else toast.show(e instanceof Error ? e.message : "Could not submit.");
    }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Check and submit">
      {file && (
        <>
          <p className="text-[13.5px] text-muted">{title}</p>
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3 py-2.5">
            <FileText size={18} className="shrink-0 text-mess" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{file.name}</p>
              <p className="text-[12px] text-muted">{kb(file.blob.size)}</p>
            </div>
            <button onClick={onOpenFile} className="btn-paper inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px]">
              <Eye size={14} /> Open
            </button>
          </div>

          {text !== null && (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-2xl border-[1.5px] border-card-edge bg-card px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-wrap">
              {marked(text.slice(0, 2500), marks).map((p, i) =>
                typeof p === "string" ? (
                  <span key={i}>{p}</span>
                ) : (
                  <mark key={i} className="rounded bg-orange/25 px-0.5 font-bold text-text">
                    {p.m}
                  </mark>
                ),
              )}
              {text.length > 2500 && <span className="text-muted"> …</span>}
            </div>
          )}

          {webOnly ? (
            <div className="mt-4 rounded-2xl bg-orange/10 px-3.5 py-3 text-[13px] leading-snug">
              Your LMS login only works on the website, so DockIn can&apos;t upload for you. Open the file above, save it,
              and upload it on the LMS.
              {lmsUrl && (
                <a href={lmsUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1.5 font-bold text-mess">
                  Open the assignment <ExternalLink size={14} />
                </a>
              )}
            </div>
          ) : canSubmit ? (
            <button
              onClick={() => void submit()}
              disabled={busy || done}
              className={cx(
                "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px]",
                done ? "bg-safe font-bold text-white" : "btn-leather",
              )}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : done ? <Check size={18} /> : <SendHorizontal size={18} />}
              {done ? "Submitted" : "Submit to my LMS"}
            </button>
          ) : (
            <p className="mt-4 rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] text-muted">
              {instance === null
                ? "This one isn't linked to an LMS assignment — open the file and upload it on the LMS."
                : !isNativeApp()
                  ? "Submitting works in the DockIn app."
                  : "Connect your LMS (Profile → College accounts) to submit from here."}
            </p>
          )}
          <p className="mt-2 text-center text-[11.5px] text-muted">Goes in with your own LMS login, to your own submission.</p>
        </>
      )}
    </Sheet>
  );
}
