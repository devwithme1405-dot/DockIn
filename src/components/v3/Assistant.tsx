"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  DoorOpen,
  ImagePlus,
  Languages,
  Mic,
  MoreVertical,
  RotateCcw,
  SendHorizontal,
  SquareCheckBig,
  Trash2,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useBackClose } from "@/lib/backClose";
import { getProfile } from "@/lib/repo";
import { clearChat, send, useBrainMode, useThinking } from "@/lib/v3/brain";
import { styleOf } from "@/lib/v3/demoBrain";
import { v3db, type AskMessage } from "@/lib/v3/store";
import { openOutpass } from "@/lib/v3/ui";
import { VOICE_LANGS, canListen, saveVoiceLang, savedVoiceLang, speak, stopSpeaking, useVoice } from "@/lib/v3/voice";
import { Sheet, cx } from "../ui";
import { AskCard, useBlobUrl } from "./AskCards";
import { DockBot, type BotMood } from "./DockBot";

const SPEAK_KEY = "dockin-ask-speak";

const STARTERS: { icon: LucideIcon; text: string; tone: string }[] = [
  { icon: SquareCheckBig, text: "Kitni classes bunk kar sakta hu?", tone: "bg-safe-soft text-safe" },
  { icon: CalendarDays, text: "Kal ka timetable", tone: "bg-violet-soft text-violet" },
  { icon: UtensilsCrossed, text: "Aaj mess mein kya hai?", tone: "bg-warn-soft text-warn" },
  { icon: DoorOpen, text: "Kal 3 baje day outpass", tone: "bg-accent-soft text-accent" },
  { icon: SquareCheckBig, text: "Kal DBMS assignment ka reminder laga", tone: "bg-rose-soft text-rose" },
  { icon: SquareCheckBig, text: "Mere pending tasks", tone: "bg-mess-soft text-ink" },
];

/**
 * DockBot's chat: type or talk, in any language. Answers come with cards
 * (attendance ring, the day's classes, the mess menu, tasks) and anything that
 * would change something comes as a card to confirm. Full screen, over
 * everything; Back closes it.
 */
export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBackClose(open, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<AssistantScreen onClose={onClose} />, document.body);
}

function AssistantScreen({ onClose }: { onClose: () => void }) {
  const messages = useLiveQuery(() => v3db.ask.orderBy("at").toArray(), []);
  const profile = useLiveQuery(() => getProfile(), []);
  const thinking = useThinking();
  const mode = useBrainMode();
  const [text, setText] = useState("");
  const [image, setImage] = useState<Blob | null>(null);
  const [menu, setMenu] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [lang, setLang] = useState(savedVoiceLang);
  const [speakOn, setSpeakOn] = useState(() => {
    try {
      return localStorage.getItem(SPEAK_KEY) === "1";
    } catch {
      return false;
    }
  });
  // Messages already on screen when it opened are never re-typed.
  const [openedAt] = useState(() => Date.now());
  const [typed, setTyped] = useState<string[]>([]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const first = (profile?.name ?? "").split(" ")[0];

  const voice = useVoice((heard) => {
    setVoiceOpen(false);
    void submit(heard);
  });

  const listening = voiceOpen && voice.state !== "idle" && voice.state !== "error";

  // A new answer is typed out (once), and read aloud if that's on.
  const last = messages?.[messages.length - 1];
  const fresh = last && last.role === "bot" && last.at >= openedAt && !typed.includes(last.id) ? last : null;
  const typing = fresh?.text ? fresh.id : null;
  const celebrate = !!fresh && /✓/.test(fresh.text);
  const freshId = fresh?.id;
  const mood: BotMood = listening ? "listening" : thinking ? "thinking" : celebrate ? "happy" : typing ? "talking" : "idle";

  useEffect(() => {
    if (!freshId || !speakOn) return;
    const m = messagesRef.current?.find((x) => x.id === freshId);
    if (m?.text) speak(m.text, styleOf(m.text) === "hi" ? "hi-IN" : "en-IN");
  }, [freshId, speakOn]);

  // Keep the newest line in view.
  const count = messages?.length ?? 0;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: count > 1 ? "smooth" : "auto" });
  }, [count, thinking, typing]);

  useEffect(() => () => stopSpeaking(), []);

  async function submit(t = text, img = image) {
    if (!t.trim() && !img) return;
    setText("");
    setImage(null);
    stopSpeaking();
    await send(t, img ?? undefined);
  }

  function startVoice() {
    stopSpeaking();
    setVoiceOpen(true);
    void voice.start(lang);
  }

  const empty = messages !== undefined && messages.length === 0;
  const canSend = !!text.trim() || !!image;

  return (
    <div className="ask-screen paper-page fixed inset-0 z-[55] mx-auto flex w-full max-w-md flex-col" role="dialog" aria-label="DockBot assistant">
      {/* header */}
      <header className="glass-bar relative z-10 flex items-center gap-2 px-2 pt-[calc(var(--sat,0px)+0.5rem)] pb-2">
        <button type="button" onClick={onClose} aria-label="Back" className="grid size-10 place-items-center rounded-full text-accent">
          <ChevronLeft size={24} />
        </button>
        <DockBot mood={mood} size={38} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] leading-tight font-extrabold">DockBot</p>
          <p className="flex items-center gap-1.5 truncate text-[12px] text-muted">
            <span className={cx("size-1.5 rounded-full", thinking ? "animate-pulse bg-orange" : mode === "live" ? "bg-safe" : "bg-warn")} />
            {thinking ? "Thinking…" : listening ? "Listening…" : mode === "live" ? "Online" : "Demo mode · full AI joins soon"}
          </p>
        </div>
        <button type="button" onClick={() => setMenu(true)} aria-label="Chat menu" className="grid size-10 place-items-center rounded-full text-muted">
          <MoreVertical size={20} />
        </button>
      </header>

      {/* conversation */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pt-3 pb-4">
        {empty && (
          <div className="flex flex-col items-center pt-4 text-center">
            <div className="relative">
              <div className="ask-halo absolute inset-[-18px] rounded-full bg-[radial-gradient(circle,rgb(242_135_31/0.22),transparent_68%)]" />
              <DockBot mood="wave" size={136} />
            </div>
            <h2 className="font-display mt-2 text-[24px] leading-tight font-extrabold">
              Namaste{first ? `, ${first}` : ""}! 👋
            </h2>
            <p className="mt-1.5 max-w-[19rem] text-[14px] leading-snug text-muted">
              I&apos;m DockBot. Type or talk — Hindi, English, Hinglish, sab chalega. I check Camu for you and fill outpasses.
            </p>
            <div className="mt-5 grid w-full grid-cols-2 gap-2">
              {STARTERS.map((s, i) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => void submit(s.text)}
                  className="ask-chip btn-paper flex items-start gap-2 rounded-2xl p-3 text-left"
                  style={{ animationDelay: `${160 + i * 70}ms` }}
                >
                  <span className={cx("grid size-7 shrink-0 place-items-center rounded-lg", s.tone)}>
                    <s.icon size={15} />
                  </span>
                  <span className="text-[13px] leading-snug font-semibold">{s.text}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                openOutpass("new");
              }}
              className="mt-3 text-[13px] font-bold text-accent"
            >
              Or fill an outpass yourself →
            </button>
          </div>
        )}

        <ul className="space-y-3">
          {messages?.map((m) => (
            <Line
              key={m.id}
              m={m}
              typing={typing === m.id}
              onTyped={() => setTyped((t) => (t.includes(m.id) ? t : [...t, m.id]))}
              onClose={onClose}
            />
          ))}
          {thinking && (
            <li className="ask-in flex items-end gap-2">
              <DockBot mood="thinking" size={30} />
              <div className="ask-dots rounded-2xl rounded-bl-md border border-card-edge bg-card px-3.5 py-3">
                <span />
                <span />
                <span />
              </div>
            </li>
          )}
        </ul>
      </div>

      {/* composer */}
      <div className="glass-bar relative z-10 px-3 pt-2 pb-[max(0.75rem,var(--sab))]">
        {image && <ImageChip blob={image} onRemove={() => setImage(null)} />}
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Attach a picture"
            onClick={() => pick.current?.click()}
            className="btn-paper grid size-11 shrink-0 place-items-center rounded-full text-muted"
          >
            <ImagePlus size={19} />
          </button>
          <input
            ref={pick}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setImage(f);
            }}
          />
          <textarea
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder={image ? "Add a line (optional)…" : "Ask or tell DockBot…"}
            aria-label="Message"
            className="field max-h-[120px] min-h-11 flex-1 resize-none px-4 py-2.5 text-[15.5px] leading-snug"
          />
          {canSend || !canListen() ? (
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend || thinking}
              onClick={() => void submit()}
              className="btn-leather grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50"
            >
              <SendHorizontal size={19} />
            </button>
          ) : (
            <button type="button" aria-label="Talk" onClick={startVoice} className="btn-leather grid size-11 shrink-0 place-items-center rounded-full">
              <Mic size={20} />
            </button>
          )}
        </div>
      </div>

      {voiceOpen && (
        <VoicePanel
          voice={voice}
          lang={lang}
          onLang={(l) => {
            setLang(l);
            saveVoiceLang(l);
            voice.cancel();
            void voice.start(l);
          }}
          onClose={() => {
            voice.cancel();
            setVoiceOpen(false);
          }}
          onRetry={() => void voice.start(lang)}
        />
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="DockBot">
        <div className="space-y-2 pb-2">
          <MenuItem
            icon={speakOn ? Volume2 : VolumeX}
            label="Read answers aloud"
            sub={speakOn ? "On" : "Off"}
            onClick={() => {
              const next = !speakOn;
              setSpeakOn(next);
              if (!next) stopSpeaking();
              try {
                localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
              } catch {}
            }}
          />
          <div className="rounded-2xl border border-line bg-surface p-3">
            <p className="mb-2 flex items-center gap-2 text-[13.5px] font-bold">
              <Languages size={16} className="text-accent" /> Voice language
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_LANGS.map((l) => (
                <button
                  key={l.tag}
                  type="button"
                  onClick={() => {
                    setLang(l.tag);
                    saveVoiceLang(l.tag);
                  }}
                  className={cx("lip-sm rounded-full px-3 py-1.5 text-[13px]", lang === l.tag ? "btn-leather" : "btn-paper")}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted">Typing works in any language — this is only for the mic.</p>
          </div>
          <MenuItem
            icon={DoorOpen}
            label="Outpass history"
            onClick={() => {
              setMenu(false);
              onClose();
              openOutpass("history");
            }}
          />
          <MenuItem
            icon={Trash2}
            label="Clear this chat"
            danger
            onClick={() => {
              void clearChat();
              setMenu(false);
            }}
          />
          {mode !== "live" && (
            <p className="px-1 pt-1 text-[12.5px] leading-snug text-muted">
              DockBot runs in demo mode in this test build: it understands the everyday asks and uses your real Camu data. The full AI
              (anything you can say) plugs in before launch.
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function MenuItem({ icon: Icon, label, sub, onClick, danger }: { icon: LucideIcon; label: string; sub?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="btn-paper flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left">
      <Icon size={18} className={danger ? "text-danger" : "text-accent"} />
      <span className={cx("flex-1 text-[14.5px] font-semibold", danger && "text-danger")}>{label}</span>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
    </button>
  );
}

function ImageChip({ blob, onRemove }: { blob: Blob; onRemove: () => void }) {
  const url = useBlobUrl(blob);
  return (
    <div className="ask-in mb-2 flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 pr-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="size-12 rounded-xl object-cover" />}
      <p className="flex-1 text-[13px] text-muted">Picture ready to send</p>
      <button type="button" onClick={onRemove} aria-label="Remove picture" className="grid size-8 place-items-center rounded-full text-muted">
        <X size={16} />
      </button>
    </div>
  );
}

function Line({ m, typing, onTyped, onClose }: { m: AskMessage; typing: boolean; onTyped: () => void; onClose: () => void }) {
  const img = useBlobUrl(m.image);
  if (m.role === "user") {
    return (
      <li className="ask-in flex justify-end">
        <div className="max-w-[82%]">
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="mb-1 ml-auto max-h-56 rounded-2xl border border-card-edge object-cover" />
          )}
          {m.text && (
            <p className="btn-leather rounded-2xl rounded-br-md px-3.5 py-2.5 text-[15px] leading-snug font-medium whitespace-pre-wrap">
              {m.text}
            </p>
          )}
        </div>
      </li>
    );
  }
  return (
    <li className="ask-in flex items-start gap-2">
      <div className="mt-0.5 shrink-0">
        <DockBot mood={typing ? "talking" : "idle"} size={30} />
      </div>
      <div className="min-w-0 flex-1">
        {m.text && (
          <div className="inline-block max-w-full rounded-2xl rounded-tl-md border border-card-edge bg-card px-3.5 py-2.5 text-[15px] leading-snug shadow-[0_2px_0_var(--pbtn-lip)]">
            {typing ? <TypeOut text={m.text} onDone={onTyped} /> : <span className="whitespace-pre-wrap">{m.text}</span>}
          </div>
        )}
        {(!typing || !m.text) && m.cards?.map((c, i) => <AskCard key={i} card={c} msgId={m.id} index={i} onClose={onClose} />)}
      </div>
    </li>
  );
}

/** The answer appears as if typed — quick, so it never holds anyone up. */
function TypeOut({ text, onDone }: { text: string; onDone: () => void }) {
  const [n, setN] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const chars = [...text];
    const step = Math.max(1, Math.round(chars.length / 45));
    let i = 0;
    const t = setInterval(() => {
      i = Math.min(chars.length, i + step);
      setN(i);
      if (i >= chars.length) {
        clearInterval(t);
        done.current();
      }
    }, 18);
    return () => clearInterval(t);
  }, [text]);
  return <span className="ask-caret whitespace-pre-wrap">{[...text].slice(0, n).join("")}</span>;
}

function VoicePanel({
  voice,
  lang,
  onLang,
  onClose,
  onRetry,
}: {
  voice: ReturnType<typeof useVoice>;
  lang: string;
  onLang: (l: string) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  // A gentle, lively waveform from the sound level.
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: 21 }, () => 0.12));
  const level = voice.level;
  const active = voice.state === "listening" || voice.state === "hearing";
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setBars((b) =>
        b.map((_, i) => {
          const centre = 1 - Math.abs(i - 10) / 11;
          const base = 0.1 + level * 0.9 * centre;
          return Math.max(0.08, Math.min(1, base * (0.6 + Math.random() * 0.8)));
        }),
      );
    }, 90);
    return () => clearInterval(t);
  }, [active, level]);

  const error = voice.state === "error";
  return (
    <div className="fixed inset-0 z-[60] mx-auto flex w-full max-w-md flex-col justify-end" role="dialog" aria-label="Talk to DockBot">
      <div className="anim-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="anim-sheet paper-page relative rounded-t-[28px] border-t-[1.5px] border-card-edge px-5 pt-4 pb-[max(1.25rem,var(--sab))] shadow-2xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
        <div className="flex flex-col items-center">
          <div className="relative mt-1 grid place-items-center">
            {active && (
              <>
                <span className="voice-ring absolute size-28 rounded-full border-2 border-orange" />
                <span className="voice-ring absolute size-28 rounded-full border-2 border-orange" style={{ animationDelay: ".8s" }} />
              </>
            )}
            <DockBot mood={error ? "idle" : voice.state === "processing" ? "thinking" : "listening"} size={104} />
          </div>
          <p className="mt-2 text-[13px] font-bold tracking-[0.08em] text-muted uppercase">
            {error ? "Didn't work" : voice.state === "processing" ? "Got it…" : voice.state === "hearing" ? "Listening" : "Speak now"}
          </p>
          <div className="mt-3 flex h-12 items-center gap-[5px]" aria-hidden>
            {bars.map((h, i) => (
              <span key={i} className="voice-bar" style={{ height: `${Math.round((active ? h : 0.1) * 46) + 4}px` }} />
            ))}
          </div>
          <p className={cx("mt-3 min-h-[3.2em] max-w-[20rem] text-center text-[17px] leading-snug font-semibold", !voice.partial && "text-muted")}>
            {error ? voice.error : voice.partial || "“Kal 3 baje day outpass bana do”"}
          </p>
        </div>

        <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {VOICE_LANGS.map((l) => (
            <button
              key={l.tag}
              type="button"
              onClick={() => onLang(l.tag)}
              className={cx("lip-sm shrink-0 rounded-full px-3 py-1.5 text-[12.5px]", lang === l.tag ? "btn-leather" : "btn-paper")}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-6">
          <button type="button" onClick={onClose} aria-label="Cancel" className="btn-paper grid size-14 place-items-center rounded-full text-muted">
            <X size={22} />
          </button>
          {error ? (
            <button type="button" onClick={onRetry} aria-label="Try again" className="btn-leather grid size-[72px] place-items-center rounded-full">
              <RotateCcw size={26} />
            </button>
          ) : (
            <button
              type="button"
              onClick={voice.finish}
              aria-label="Done"
              disabled={voice.state === "processing" || voice.state === "starting"}
              className="btn-leather grid size-[72px] place-items-center rounded-full disabled:opacity-60"
            >
              <Check size={30} />
            </button>
          )}
          <span className="size-14" />
        </div>
      </div>
    </div>
  );
}

