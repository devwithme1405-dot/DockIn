"use client";

import { useEffect, useState } from "react";
import { FileText, Link2, Send } from "lucide-react";
import { clearShared, onPhone, readSharedFile, takeShare, type SharedIn } from "@/lib/native";
import { sendMessage, uploadChatFile, useChatMe, type ThreadId } from "@/lib/chat";
import { goTab } from "@/lib/tabs";
import { ChatTargetList, useChatTargets } from "./ShareTask";
import { Sheet, useToast } from "./ui";

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Text, a link or documents shared to DockIn from another app's share menu:
 * Friends opens with "Send to…", pick chats, done — like WhatsApp.
 */
export function ShareInbox() {
  const toast = useToast();
  const me = useChatMe();
  const targets = useChatTargets();
  const [share, setShare] = useState<SharedIn | null>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Set<ThreadId>>(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const look = () =>
      void takeShare().then((s) => {
        if (!s) return;
        const words = [s.subject && s.text && !s.text.includes(s.subject) ? s.subject : null, s.text].filter(Boolean).join("\n");
        if (!s.files?.length && !words) {
          toast.show("Images can't be sent on DockIn — text, links and documents can.");
          return;
        }
        setShare(s);
        setText(words);
        setPicked(new Set());
        goTab("/circle");
      });
    look();
    return onPhone("share", look);
  }, [toast]);

  function close() {
    setShare(null);
    clearShared();
  }

  async function send() {
    if (!share || !picked.size || busy) return;
    if (!me) {
      toast.show("Sign in to Friends to send.");
      return;
    }
    setBusy(true);
    const threads = [...picked];
    try {
      const files = await Promise.all((share.files ?? []).map((f) => readSharedFile(f)));
      for (const th of threads) {
        if (text.trim()) await sendMessage(th, text);
        for (const f of files) {
          const up = await uploadChatFile(th, f);
          await sendMessage(th, "", { file: up });
        }
      }
      toast.show(threads.length === 1 ? "Sent" : `Sent to ${threads.length} chats`);
      close();
      // One chat: open it, the way WhatsApp does.
      if (threads.length === 1) goTab(`/circle?chat=${encodeURIComponent(threads[0])}`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not send it.");
    }
    setBusy(false);
  }

  const files = share?.files ?? [];
  const isLink = /^https?:\/\/\S+$/i.test(text.trim());
  return (
    <Sheet open={!!share} onClose={() => !busy && close()} title="Send to…">
      <div className="mb-3 space-y-2">
        {(text || !files.length) && (
          <label className="field flex items-start gap-2.5 px-3.5 py-2.5">
            {isLink ? <Link2 size={17} className="mt-0.5 shrink-0 text-muted" /> : null}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(5, Math.max(2, text.split("\n").length))}
              className="min-w-0 flex-1 resize-none bg-transparent text-[15px] outline-none"
              aria-label="Message"
              placeholder="Add a message"
            />
          </label>
        )}
        {files.map((f) => (
          <div key={f.path} className="field flex items-center gap-3 px-3.5 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#d64545] text-white">
              <FileText size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold">{f.name}</span>
              <span className="block text-[12px] text-muted">{fmtSize(f.size)}</span>
            </span>
          </div>
        ))}
        {(share?.skipped ?? 0) > 0 && <p className="px-1 text-[12.5px] text-muted">Images and files over 50 MB are left out.</p>}
      </div>
      <ChatTargetList
        targets={targets}
        picked={picked}
        toggle={(t) =>
          setPicked((p) => {
            const n = new Set(p);
            if (n.has(t)) n.delete(t);
            else n.add(t);
            return n;
          })
        }
      />
      <button
        onClick={() => void send()}
        disabled={!picked.size || busy}
        className="btn-leather mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] disabled:opacity-50"
      >
        <Send size={17} /> {busy ? "Sending…" : picked.size ? `Send to ${picked.size}` : "Pick who gets it"}
      </button>
    </Sheet>
  );
}
