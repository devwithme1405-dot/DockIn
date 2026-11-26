"use client";

import { useSyncExternalStore } from "react";
import { toDateStr } from "../dates";
import { DockIn, isNativeApp } from "../native";
import { needsProof, passSummary } from "../outpass";
import { getProfile } from "../repo";
import { getSupabase } from "../supabase";
import { demoReply, styleOf, type Style } from "./demoBrain";
import { newId, v3db, type Action, type AskMessage, type Card } from "./store";
import { TOOL_SPECS, runAction, runTool } from "./tools";

/**
 * The conversation: takes what the student said, gets an answer from the real
 * AI when it is connected (server route /api/assistant) or from the demo brain
 * when it isn't, and keeps every line in the phone's own database.
 *
 * Nothing that changes anything happens here on the AI's word alone: actions
 * come back as confirm cards, and run only through {@link confirmCard}.
 */

type Mode = "unknown" | "live" | "demo";
let mode: Mode = "unknown";
let busy = false;
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());

function subscribe(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Thinking right now (for the robot and the typing dots). */
export function useThinking(): boolean {
  return useSyncExternalStore(subscribe, () => busy, () => false);
}

/** "demo" until a real AI answers. */
export function useBrainMode(): Mode {
  return useSyncExternalStore(subscribe, () => mode, () => "unknown" as Mode);
}

async function add(m: Omit<AskMessage, "id" | "at">): Promise<AskMessage> {
  const msg: AskMessage = { id: newId(), at: Date.now(), ...m };
  await v3db.ask.put(msg);
  return msg;
}

/** The latest outpass card still waiting, that needs the mail screenshot and has none. */
async function waitingForProof(): Promise<{ msg: AskMessage; index: number } | null> {
  const recent = await v3db.ask.orderBy("at").reverse().limit(8).toArray();
  for (const m of recent) {
    const i = (m.cards ?? []).findIndex(
      (c) => c.kind === "confirm" && c.state === "waiting" && c.action.type === "outpass" && needsProof(c.action.draft) && !c.action.proofMsg,
    );
    if (i >= 0) return { msg: m, index: i };
  }
  return null;
}

/** Say something to the assistant. Resolves when the answer is on screen. */
export async function send(text: string, image?: Blob): Promise<void> {
  const clean = text.trim();
  if (!clean && !image) return;
  const st: Style = clean ? styleOf(clean) : "hinglish";
  const user = await add({ role: "user", text: clean, image });
  busy = true;
  ping();
  try {
    // A picture right after "send the mail screenshot" is that screenshot.
    if (image) {
      const w = await waitingForProof();
      if (w) {
        const cards = [...(w.msg.cards ?? [])];
        const c = cards[w.index];
        if (c.kind === "confirm" && c.action.type === "outpass") {
          cards[w.index] = { ...c, action: { ...c.action, proofMsg: user.id } };
          await v3db.ask.update(w.msg.id, { cards });
        }
        await add({
          role: "bot",
          text:
            st === "hi"
              ? "स्क्रीनशॉट लग गया ✓ अब ऊपर Confirm दबाओ।"
              : st === "en"
                ? "Got the screenshot ✓ Now tap Confirm above."
                : "Screenshot lag gaya ✓ Ab upar Confirm dabao.",
        });
        if (!clean) return;
      } else if (!clean) {
        await add({
          role: "bot",
          text:
            st === "en"
              ? "Got the picture. What should I do with it? (For a leave pass, tell me the dates first.)"
              : "Photo mil gayi. Iska kya karu? (Leave pass ke liye pehle dates bata do.)",
        });
        return;
      }
    }

    const name = (await getProfile())?.name ?? "";
    let reply: { text: string; cards: Card[] } | null = null;
    if (mode !== "demo") {
      try {
        reply = await liveReply(name);
        mode = "live";
      } catch (e) {
        if ((e as Error).message === "NOT_CONFIGURED") mode = "demo";
        else if (mode === "live") {
          reply = {
            text:
              st === "en"
                ? "I couldn't reach the AI just now (network?). Here's what I can do offline:"
                : "Abhi AI tak nahi pahunch paaya (network?). Offline ye kar sakta hu:",
            cards: [],
          };
        } else mode = "demo";
      }
      ping();
    }
    if (!reply || (mode === "live" && !reply.text && !reply.cards.length)) reply = await demoReply(clean, name);
    await add({ role: "bot", text: reply.text, cards: reply.cards });
  } finally {
    busy = false;
    ping();
  }
}

// ---------------------------------------------------------------- live AI

interface WireMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

function systemPrompt(name: string): string {
  const now = new Date();
  return [
    `You are DockBot, the assistant inside DockIn, a college app for Bennett University students. You talk to ${name || "the student"}.`,
    `Today is ${now.toDateString()} (${toDateStr(now)}), time ${now.toTimeString().slice(0, 5)} IST.`,
    "Reply in the student's own language and style: Hinglish if they write Hinglish, Hindi script if they write Hindi, English if English, and any other Indian language the same way. Keep it short, friendly and direct, like a smart senior.",
    "Use the tools for any fact about their attendance, classes, mess, tasks or outpasses. Never invent numbers.",
    "To add a task/reminder or make an outpass, call propose_task / propose_outpass: it shows a card the student confirms. Say so in one line; never claim it is done.",
    "Outpass rules: a day out pass is the same day and ends by 19:00. A leave pass spans days; Leave and Medical need the parent-approval mail screenshot, which the student sends in this chat. DockIn never approves a pass for parents.",
  ].join("\n");
}

async function history(): Promise<WireMsg[]> {
  const last = await v3db.ask.orderBy("at").reverse().limit(14).toArray();
  return last
    .reverse()
    .filter((m) => m.text)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }) as WireMsg);
}

async function token(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  return (await sb.auth.getSession()).data.session?.access_token ?? null;
}

async function callAi(messages: WireMsg[]): Promise<WireMsg> {
  const jwt = await token();
  if (!jwt) throw new Error("NOT_CONFIGURED");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({
        messages,
        tools: TOOL_SPECS.map((t) => ({ type: "function", function: t })),
      }),
      signal: ctl.signal,
    });
    if (res.status === 503 || res.status === 404) throw new Error("NOT_CONFIGURED");
    if (res.status === 429) throw new Error("LIMIT");
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const body = (await res.json()) as { message?: WireMsg };
    if (!body.message) throw new Error("AI empty");
    return body.message;
  } finally {
    clearTimeout(timer);
  }
}

async function liveReply(name: string): Promise<{ text: string; cards: Card[] }> {
  const messages: WireMsg[] = [{ role: "system", content: systemPrompt(name) }, ...(await history())];
  const cards: Card[] = [];
  for (let round = 0; round < 4; round++) {
    const m = await callAi(messages);
    const calls = m.tool_calls ?? [];
    if (!calls.length) return { text: (m.content ?? "").trim(), cards };
    messages.push({ role: "assistant", content: m.content ?? null, tool_calls: calls });
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        /* a model's broken JSON: run with nothing */
      }
      const r = await runTool(c.function.name, args);
      if (r.card) cards.push(r.card);
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(r.data).slice(0, 6000) });
    }
  }
  return { text: "", cards };
}

// ---------------------------------------------------------------- confirm

/**
 * The student tapped Confirm on a card: do it, mark the card, and say what
 * happened. An outpass is saved and MyCamu opens with its details on top.
 */
export async function confirmCard(msgId: string, index: number, edited?: Action): Promise<void> {
  const m = await v3db.ask.get(msgId);
  const c = m?.cards?.[index];
  if (!m || !c || c.kind !== "confirm" || c.state !== "waiting") return;
  const action = edited ?? c.action;
  let proof: Blob | undefined;
  if (action.type === "outpass" && action.proofMsg) proof = (await v3db.ask.get(action.proofMsg))?.image;
  const id = await runAction(action, proof);
  const cards = [...(m.cards ?? [])];
  cards[index] = { kind: "confirm", action, state: "done", resultId: id };
  await v3db.ask.update(msgId, { cards });
  // Answer in the style the student asked in (their last words before this card).
  const asked = await v3db.ask.where("at").below(m.at).reverse().filter((x) => x.role === "user" && !!x.text).first();
  const st = styleOf(asked?.text || m.text || "");
  if (action.type === "task") {
    await add({ role: "bot", text: st === "en" ? "Added to your Tasks ✓" : st === "hi" ? "Tasks में जुड़ गया ✓" : "Tasks mein add ho gaya ✓" });
    return;
  }
  await add({
    role: "bot",
    text:
      st === "en"
        ? "Saved in Outpass ✓ Opening MyCamu with the details pinned on top — submit it there. After that, approval happens in MyCamu."
        : st === "hi"
          ? "आउटपास में सेव ✓ MyCamu खोल रहा हूँ, डिटेल ऊपर दिखेंगी — वहाँ सबमिट कर दो। उसके बाद अप्रूवल MyCamu में होगा।"
          : "Outpass mein save ✓ MyCamu khol raha hu, details upar pin hongi — wahan submit kar do. Uske baad approval MyCamu mein hoga.",
    cards: [{ kind: "passes", ids: [id] }],
  });
  await openInCamu(action.draft);
}

export async function cancelCard(msgId: string, index: number): Promise<void> {
  const m = await v3db.ask.get(msgId);
  const c = m?.cards?.[index];
  if (!m || !c || c.kind !== "confirm" || c.state !== "waiting") return;
  const cards = [...(m.cards ?? [])];
  cards[index] = { ...c, state: "cancelled" };
  await v3db.ask.update(msgId, { cards });
}

/** MyCamu, signed in, with the pass details pinned on top (and copied). */
export async function openInCamu(draft: Parameters<typeof passSummary>[0]): Promise<"opened" | "copied"> {
  const note = passSummary(draft);
  try {
    await navigator.clipboard?.writeText(note);
  } catch {
    /* clipboard is a nicety */
  }
  if (!isNativeApp()) return "copied";
  await DockIn.openCamu({ path: "/", note });
  return "opened";
}

export async function clearChat(): Promise<void> {
  await v3db.ask.clear();
}
