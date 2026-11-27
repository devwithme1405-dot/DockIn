"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { DockIn, isNativeApp, type SpeechEvent } from "../native";

/** Languages the phone's recogniser takes, in the order students are most likely to want them. */
export const VOICE_LANGS: { tag: string; label: string }[] = [
  { tag: "hi-IN", label: "Hindi + English" },
  { tag: "en-IN", label: "English" },
  { tag: "bn-IN", label: "বাংলা" },
  { tag: "ta-IN", label: "தமிழ்" },
  { tag: "te-IN", label: "తెలుగు" },
  { tag: "mr-IN", label: "मराठी" },
  { tag: "gu-IN", label: "ગુજરાતી" },
  { tag: "kn-IN", label: "ಕನ್ನಡ" },
  { tag: "ml-IN", label: "മലയാളം" },
  { tag: "pa-IN", label: "ਪੰਜਾਬੀ" },
];

const LANG_KEY = "dockin-voice-lang";

export function savedVoiceLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) || "hi-IN";
  } catch {
    return "hi-IN";
  }
}

export function saveVoiceLang(tag: string) {
  try {
    localStorage.setItem(LANG_KEY, tag);
  } catch {}
}

export type VoiceState = "idle" | "starting" | "listening" | "hearing" | "processing" | "error";

// Words that mark a pass, used only to pick between the engine's own guesses.
const SIGNAL = /\b(day\s?out|out\s?pass|gate\s?pass|outing|leave|medical|duty|baje|a\.?m\.?|p\.?m\.?|kal|parso|aaj|aj|today|tomorrow|tonight|night|subah|shaam|sham|market|home|ghar|hospital|doctor|fever|event)\b|\d/gi;

function passScore(s: string): number {
  const m = s.match(SIGNAL);
  return m ? m.length : 0;
}

/**
 * From the engine's guesses, the one that reads most like a pass. The top guess
 * isn't always the clearest; ties keep the top one, so this never does worse.
 */
function bestGuess(top: string, altsJson?: string): string {
  if (!altsJson) return top;
  let alts: unknown;
  try {
    alts = JSON.parse(altsJson);
  } catch {
    return top;
  }
  if (!Array.isArray(alts) || alts.length < 2) return top;
  let best = top || String(alts[0] ?? "");
  let bestScore = passScore(best);
  for (const a of alts) {
    const s = String(a ?? "");
    const sc = passScore(s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return best;
}

/** Minimal shape of the browser's own SpeechRecognition (desktop Chrome), for testing outside the app. */
interface WebRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function webRecognizer(): (new () => WebRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => WebRec; webkitSpeechRecognition?: new () => WebRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return isNativeApp() || !!webRecognizer();
}

const ERRORS: Record<string, string> = {
  MIC_DENIED: "Allow the microphone to talk to DockIn (Settings → Apps → DockIn → Permissions).",
  NO_SPEECH: "Didn't catch that — try again a little closer.",
  NETWORK: "Voice needs a network connection right now.",
  BUSY: "The mic is busy — try again.",
  AUDIO: "The mic isn't working right now.",
  "not-allowed": "Allow the microphone to talk to DockIn.",
  "no-speech": "Didn't catch that — try again.",
};

/**
 * Talk instead of typing: the phone's speech-to-text (or the browser's, on a
 * laptop). Live words while speaking, a sound level for the waveform, and the
 * final text handed to `onFinal`.
 */
export function useVoice(onFinal: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const final = useRef(onFinal);
  const heard = useRef("");
  const web = useRef<WebRec | null>(null);
  const handle = useRef<PluginListenerHandle | null>(null);

  useEffect(() => {
    final.current = onFinal;
  });

  const done = useCallback((text: string) => {
    setLevel(0);
    const t = text.trim();
    if (t) {
      setState("idle");
      setPartial("");
      final.current(t);
    } else {
      setState("error");
      setError(ERRORS.NO_SPEECH);
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let gone = false;
    void DockIn.addListener("speech", (e: SpeechEvent) => {
      switch (e.type) {
        case "state":
          setState(e.state === "processing" ? "processing" : e.state === "speaking" ? "hearing" : "listening");
          break;
        case "level":
          setLevel(e.level);
          break;
        case "partial":
          heard.current = e.text;
          setPartial(e.text);
          setState("hearing");
          break;
        case "final":
          done(bestGuess(e.text || heard.current, e.alts));
          break;
        case "error":
          setLevel(0);
          if (e.code === "NO_SPEECH" && heard.current) done(heard.current);
          else {
            setState("error");
            setError(ERRORS[e.code] ?? "Voice stopped — try again.");
          }
          break;
      }
    }).then((h) => {
      if (gone) void h.remove();
      else handle.current = h;
    });
    return () => {
      gone = true;
      void handle.current?.remove();
      void DockIn.stopListening().catch(() => {});
    };
  }, [done]);

  const start = useCallback(
    async (lang: string) => {
      heard.current = "";
      setPartial("");
      setError(null);
      setLevel(0);
      setState("starting");
      if (isNativeApp()) {
        try {
          await DockIn.listen({ lang });
          setState((s) => (s === "starting" ? "listening" : s));
        } catch (e) {
          const code = (e as { code?: string }).code ?? "";
          setState("error");
          setError(ERRORS[code] ?? ((e as Error).message || "Couldn't start listening."));
        }
        return;
      }
      const Rec = webRecognizer();
      if (!Rec) {
        setState("error");
        setError("Voice works in the DockIn app.");
        return;
      }
      const r = new Rec();
      web.current = r;
      r.lang = lang;
      r.interimResults = true;
      r.continuous = false;
      r.onspeechstart = () => setState("hearing");
      r.onresult = (ev) => {
        let text = "";
        let isFinal = false;
        for (let i = 0; i < ev.results.length; i++) {
          text += ev.results[i][0].transcript;
          isFinal = ev.results[i].isFinal;
        }
        heard.current = text;
        setPartial(text);
        setLevel(0.4 + Math.random() * 0.5);
        if (isFinal) setState("processing");
      };
      r.onerror = (ev) => {
        setState("error");
        setError(ERRORS[ev.error] ?? "Voice stopped — try again.");
      };
      r.onend = () => {
        web.current = null;
        setState((s) => {
          if (s !== "error") queueMicrotask(() => done(heard.current));
          return s;
        });
      };
      r.start();
      setState("listening");
    },
    [done],
  );

  /** Stop and use what was heard. */
  const finish = useCallback(() => {
    if (isNativeApp()) void DockIn.finishListening().catch(() => {});
    else web.current?.stop();
    setState("processing");
  }, []);

  /** Stop and throw it away. */
  const cancel = useCallback(() => {
    heard.current = "";
    if (isNativeApp()) void DockIn.stopListening().catch(() => {});
    else {
      if (web.current) web.current.onend = null;
      web.current?.abort();
    }
    setState("idle");
    setPartial("");
    setLevel(0);
  }, []);

  return { state, partial, level, error, start, finish, cancel };
}

/** Read text aloud in a language. Emoji are skipped so they aren't spelt out. */
export function speak(text: string, lang: string) {
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, "").trim();
  if (!clean) return;
  if (isNativeApp()) {
    void DockIn.speak({ text: clean, lang }).catch(() => {});
    return;
  }
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (isNativeApp()) void DockIn.stopSpeaking().catch(() => {});
  else if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
