import { addDays, fmtTime, relativeDayLabel, toDateStr, weekdayOf } from "../dates";
import { needsProof, parsePass } from "../outpass";
import type { Card } from "./store";
import { getAttendance, getMess, getTimetable, listPasses, listTasks, tidyPass, whatIfSkip, type ToolResult } from "./tools";

/**
 * The stand-in brain, until a real AI model is connected: plain rules that
 * understand the common asks in English, Hinglish and Hindi, use the same
 * tools a model will, and answer in the student's own style. Free, instant,
 * offline. Anything it doesn't follow gets an honest "I'm in demo mode".
 */

export type Style = "en" | "hinglish" | "hi";

export interface Reply {
  text: string;
  cards: Card[];
}

const DEVANAGARI = /[ऀ-ॿ]/;
const HINGLISH =
  /\b(hai|hain|kya|kitni|kitna|kitne|kab|kal|aaj|parso|mujhe|mera|meri|mere|bata|batao|bta|kar|karo|krdo|kardo|de|do|bhai|yaar|laga|lagao|wala|wali|ki|ka|ke|ko|se|tak|nahi|nhi|haan|acha|accha|chahiye|bana|banao|bnado|dikha|dikhao|baje|chhod|chod|sakta|sakti|skta|kaise|kaisa|khana)\b/;

/** How the student wrote, so the answer comes back the same way. */
export function styleOf(text: string): Style {
  if (DEVANAGARI.test(text)) return "hi";
  const hits = text.toLowerCase().match(new RegExp(HINGLISH.source, "g"));
  return hits && hits.length >= 1 ? "hinglish" : "en";
}

const say = (st: Style, en: string, hinglish: string, hi: string) => (st === "hi" ? hi : st === "hinglish" ? hinglish : en);

/** Hindi words the rest of the rules (and the outpass parser) read in Roman letters. */
export function romanise(text: string): string {
  const map: [RegExp, string][] = [
    [/आज/g, " aaj "],
    [/कल/g, " kal "],
    [/परसों|परसो/g, " parso "],
    [/बजे/g, " baje "],
    [/से/g, " se "],
    [/तक/g, " tak "],
    [/छुट्टी|छुट्टि/g, " chutti "],
    [/आउट ?पास|आउटपास/g, " outpass "],
    [/डे ?आउट/g, " day out "],
    [/लीव/g, " leave "],
    [/घर/g, " ghar "],
    [/क्लास(ें|ेस)?/g, " class "],
    [/अटेंडेंस|हाज़िरी|हाजिरी|उपस्थिति/g, " attendance "],
    [/मेस|खाना|भोजन/g, " mess "],
    [/टाइम ?टेबल|समय ?सारणी/g, " timetable "],
    [/बंक|छोड़|छोड/g, " bunk "],
    [/रिमाइंडर|याद दिला(ना|ओ|दो|देना)?|याद/g, " remind "],
    [/काम|असाइनमेंट/g, " task "],
    [/नमस्ते|नमस्कार|हेलो|हाय/g, " hello "],
    [/धन्यवाद|शुक्रिया/g, " thanks "],
    [/रविवार|इतवार/g, " sunday "],
    [/सोमवार/g, " monday "],
    [/मंगलवार/g, " tuesday "],
    [/बुधवार/g, " wednesday "],
    [/गुरुवार|बृहस्पतिवार/g, " thursday "],
    [/शुक्रवार/g, " friday "],
    [/शनिवार/g, " saturday "],
    [/सुबह/g, " am "],
    [/शाम|दोपहर/g, " pm "],
  ];
  let t = text.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  for (const [re, to] of map) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, ek: 1, two: 2, do: 2, three: 3, teen: 3, four: 4, char: 4, chaar: 4, five: 5, paanch: 5, panch: 5,
  six: 6, chhe: 6, che: 6, seven: 7, saat: 7, eight: 8, aath: 8, nine: 9, nau: 9, ten: 10, das: 10,
};

const HI_DAYS: [RegExp, number][] = [
  [/\b(sun|sunday|ravivar|itwar)\b/, 0],
  [/\b(mon|monday|somvar)\b/, 1],
  [/\b(tue|tues|tuesday|mangalvar)\b/, 2],
  [/\b(wed|wednesday|budhvar)\b/, 3],
  [/\b(thu|thur|thurs|thursday|guruvar|brihaspativar)\b/, 4],
  [/\b(fri|friday|shukravar)\b/, 5],
  [/\b(sat|saturday|shanivar)\b/, 6],
];

/** The day a sentence is about: aaj / kal / parso / a weekday; today by default. */
export function dayIn(t: string, today: string): { date: string; said: boolean } {
  if (/\b(day after tomorrow|parso|parson)\b/.test(t)) return { date: addDays(today, 2), said: true };
  if (/\b(tomorrow|tmrw|tmr|kal|kl)\b/.test(t)) return { date: addDays(today, 1), said: true };
  if (/\b(today|aaj|aj|abhi)\b/.test(t)) return { date: today, said: true };
  for (const [re, wd] of HI_DAYS) {
    if (re.test(t)) return { date: addDays(today, (wd - weekdayOf(today) + 7) % 7), said: true };
  }
  return { date: today, said: false };
}

/** "2 classes", "do class", "3 lecture" → 2 / 3; null when no count. */
export function countIn(t: string): number | null {
  const m = t.match(/\b(\d{1,2})\s*(?:class|classes|lecture|lectures|period|periods|din|day|days)?\b/);
  if (m) return Number(m[1]) || null;
  for (const [w, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${w}\\s+(class|classes|lecture|lectures|period|periods)\\b`).test(t)) return n;
  }
  return null;
}

/** Words that are about asking, not about the subject, so a subject can be matched in what's left. */
const FILLER =
  /\b(how|many|much|can|could|i|my|me|the|of|in|for|is|am|are|what|if|will|be|kitni|kitna|kitne|bunk|skip|chhod|chod|miss|kar|karu|karun|sakta|sakti|skta|hu|hoon|hai|hain|attendance|attendence|percent|mera|meri|mere|bata|batao|bta|do|de|ki|ka|ke|ko|class|classes|lecture|lectures|agar|toh|to|kya|ho|jayega|jaegi|jayegi|bro|bhai|yaar|please|pls|kal|aaj|parso|today|tomorrow|saari|sari|sab|all)\b/g;

export function subjectWords(t: string): string {
  return t.replace(FILLER, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

/** What the student wants, in order of how specific the words are. */
export type Intent = "outpass" | "passes" | "remind" | "whatif" | "attendance" | "timetable" | "mess" | "tasks" | "greet" | "thanks" | "help" | "unknown";

export function intentOf(raw: string): Intent {
  const t = ` ${romanise(raw).toLowerCase()} `;
  if (/\b(my|meri|mere|purani|history|list|status)\b.*\b(out ?pass|outpasses|passes|leaves)\b|\b(out ?pass|leave)\b.*\b(history|status|list)\b/.test(t)) return "passes";
  if (/\b(out ?pass|outpass|day ?out|gate ?pass|outing|leave ?pass|chutti|chhutti|ghar ja|ghar jana|home leave|medical leave|leave)\b/.test(t)) return "outpass";
  if (/\b(remind|reminder|yaad|add (a )?task|task (bana|add|daal|dal)|note (kar|bana)|set (a )?reminder)\b/.test(t)) return "remind";
  if (/\b(bunk|skip|chhod|chod|miss|mass bunk)\b/.test(t)) return countIn(t) || /\b(saari|sari|all|poori|puri|full)\b/.test(t) ? "whatif" : "attendance";
  if (/\b(attendance|attendence|haziri|hazri|percent|percentage)\b|%/.test(t)) return "attendance";
  if (/\b(class|classes|lecture|lectures|timetable|time table|schedule|period|periods)\b/.test(t)) return "timetable";
  if (/\b(mess|khana|khaana|food|lunch|dinner|breakfast|snacks?|nashta|menu|cafeteria)\b/.test(t)) return "mess";
  if (/\b(task|tasks|assignment|assignments|deadline|deadlines|pending|kaam|homework|exam|exams|quiz)\b/.test(t)) return "tasks";
  if (/\b(thanks|thank you|thank|thx|shukriya|dhanyavad|dhanyawad)\b/.test(t)) return "thanks";
  if (/^\s*(hi+|hello|hey|hii+|namaste|namaskar|yo|sup|kaise ho|kya haal|good (morning|evening|afternoon))\b/.test(t)) return "greet";
  if (/\b(help|kya kar sakte|what can you|madad)\b/.test(t)) return "help";
  return "unknown";
}

export const SUGGESTIONS: Record<Style, string[]> = {
  en: ["How many classes can I skip?", "Tomorrow's classes", "What's in the mess today?", "Day out pass tomorrow 3 pm", "My pending tasks"],
  hinglish: ["Kitni classes bunk kar sakta hu?", "Kal ka timetable", "Aaj mess mein kya hai?", "Kal 3 baje day outpass", "Mere pending tasks"],
  hi: ["कितनी क्लास छोड़ सकता हूँ?", "कल का टाइमटेबल", "आज मेस में क्या है?", "कल 3 बजे डे आउट पास", "मेरे बाकी काम"],
};

const NOT_CONNECTED = (st: Style) =>
  say(
    st,
    "Camu isn't connected yet, so I can't see that. Connect it in Profile → College accounts.",
    "Camu abhi connect nahi hai, isliye ye nahi dikh raha. Profile → College accounts mein connect kar do.",
    "Camu अभी जुड़ा नहीं है, इसलिए ये नहीं दिख रहा। Profile → College accounts में जोड़ दो।",
  );

function cardsOf(r: ToolResult): Card[] {
  return r.card ? [r.card] : [];
}

export async function demoReply(raw: string, name: string, now = new Date()): Promise<Reply> {
  const st = styleOf(raw);
  const t = ` ${romanise(raw).toLowerCase()} `;
  const today = toDateStr(now);
  const intent = intentOf(raw);
  const first = name.split(" ")[0] || "";

  switch (intent) {
    case "greet":
      return {
        text: say(
          st,
          `Hi ${first}! 👋 I'm DockBot. Ask me about attendance, classes, the mess, your tasks — or tell me to make an outpass.`,
          `Hi ${first}! 👋 Main DockBot hu. Attendance, classes, mess, tasks — kuch bhi pucho, ya bolo outpass bana du.`,
          `नमस्ते ${first}! 👋 मैं DockBot हूँ। अटेंडेंस, क्लास, मेस, काम — कुछ भी पूछो, या बोलो आउटपास बना दूँ।`,
        ),
        cards: [{ kind: "suggest", items: SUGGESTIONS[st] }],
      };
    case "thanks":
      return { text: say(st, "Anytime! 🙌", "Koi baat nahi! 🙌", "कोई बात नहीं! 🙌"), cards: [] };
    case "help":
    case "unknown":
      return {
        text:
          intent === "help"
            ? say(
                st,
                "I can check attendance and what skipping does to it, show classes for any day, today's mess menu, your tasks, add reminders and fill outpasses. Try one:",
                "Main attendance aur bunk ka hisaab, kisi bhi din ki classes, aaj ka mess, tumhare tasks, reminders aur outpass — sab kar sakta hu. Ye try karo:",
                "मैं अटेंडेंस और बंक का हिसाब, किसी भी दिन की क्लास, आज का मेस, तुम्हारे काम, रिमाइंडर और आउटपास — सब कर सकता हूँ। ये आज़माओ:",
              )
            : say(
                st,
                "I didn't get that one 🤔 I'm running in demo mode for now (the full AI plugs in soon), so I know the everyday asks best. Try:",
                "Ye samajh nahi aaya 🤔 Abhi main demo mode mein hu (asli AI jaldi judega), isliye roz wale sawal best samajhta hu. Ye try karo:",
                "ये समझ नहीं आया 🤔 अभी मैं डेमो मोड में हूँ (असली AI जल्दी जुड़ेगा), इसलिए रोज़ वाले सवाल बेहतर समझता हूँ। ये आज़माओ:",
              ),
        cards: [{ kind: "suggest", items: SUGGESTIONS[st] }],
      };

    case "attendance": {
      const r = await getAttendance(subjectWords(t) || undefined);
      const d = r.data as { connected?: boolean; target: number; overall: { pct: number | null; canMiss: number; mustAttend: number } | null; subjects: { name: string; pct: number | null; canMiss: number; mustAttend: number }[] };
      if (d.connected === false) return { text: NOT_CONNECTED(st), cards: [] };
      const focus = r.card?.kind === "attendance" && r.card.focus ? d.subjects[0] : null;
      const s = focus ?? d.overall;
      const label = focus ? focus.name : say(st, "Overall", "Overall", "कुल");
      if (!s) return { text: NOT_CONNECTED(st), cards: [] };
      const text =
        s.mustAttend > 0
          ? say(
              st,
              `${label}: ${pct(s.pct)} — below your ${d.target}% target. Attend the next ${s.mustAttend} classes in a row to get back.`,
              `${label}: ${pct(s.pct)} — target (${d.target}%) se neeche hai. Wapas aane ke liye agli ${s.mustAttend} classes lagatar attend karni padengi.`,
              `${label}: ${pct(s.pct)} — लक्ष्य (${d.target}%) से नीचे। वापस आने के लिए अगली ${s.mustAttend} क्लास लगातार जानी होंगी।`,
            )
          : say(
              st,
              `${label}: ${pct(s.pct)} (target ${d.target}%). You can skip ${s.canMiss} more ${s.canMiss === 1 ? "class" : "classes"} and still be safe.`,
              `${label}: ${pct(s.pct)} (target ${d.target}%). Abhi ${s.canMiss} ${s.canMiss === 1 ? "class" : "classes"} aur bunk kar sakte ho, safe rahoge.`,
              `${label}: ${pct(s.pct)} (लक्ष्य ${d.target}%)। अभी ${s.canMiss} क्लास और छोड़ सकते हो, सुरक्षित रहोगे।`,
            );
      return { text, cards: cardsOf(r) };
    }

    case "whatif": {
      const words = subjectWords(t);
      let skip = countIn(t);
      const { date, said } = dayIn(t, today);
      let dayNote = "";
      if (!skip && said) {
        // "kal ki saari classes bunk" — every class that day.
        const day = getTimetable(date).data as { classes?: unknown[] };
        skip = day.classes?.length ?? 0;
        dayNote = relativeDayLabel(date, today);
        if (!skip) {
          return {
            text: say(st, `No classes ${dayNote.toLowerCase()} — nothing to skip 😄`, `${dayNote} koi class hi nahi hai — bunk karne ko kuch nahi 😄`, `${dayNote} कोई क्लास ही नहीं — छोड़ने को कुछ नहीं 😄`),
            cards: [],
          };
        }
      }
      const r = await whatIfSkip(skip || 1, dayNote ? undefined : words || undefined);
      const d = r.data as { connected?: boolean; known?: boolean; subject: string; before: number; after: number; target: number; safe: boolean; skip: number };
      if (d.connected === false || d.known === false) return { text: NOT_CONNECTED(st), cards: [] };
      const n = d.skip;
      const what = dayNote ? say(st, `all ${n} classes ${dayNote.toLowerCase()}`, `${dayNote} ki saari ${n} classes`, `${dayNote} की सारी ${n} क्लास`) : say(st, `${n} ${d.subject} ${n === 1 ? "class" : "classes"}`, `${d.subject} ki ${n} ${n === 1 ? "class" : "classes"}`, `${d.subject} की ${n} क्लास`);
      const text = d.safe
        ? say(st, `Skip ${what} → ${d.before}% becomes ${d.after}%. Still above ${d.target}% ✅`, `${what} bunk karoge to ${d.before}% → ${d.after}% ho jayega. Target (${d.target}%) se upar, safe ✅`, `${what} छोड़ोगे तो ${d.before}% → ${d.after}% होगा। लक्ष्य (${d.target}%) से ऊपर ✅`)
        : say(st, `Skip ${what} → ${d.before}% drops to ${d.after}%, under your ${d.target}% target ⚠️ I'd go.`, `${what} bunk karoge to ${d.before}% → ${d.after}% — target (${d.target}%) se neeche ⚠️ Chale jao bhai.`, `${what} छोड़ोगे तो ${d.before}% → ${d.after}% — लक्ष्य (${d.target}%) से नीचे ⚠️ चले जाओ।`);
      return { text, cards: cardsOf(r) };
    }

    case "timetable": {
      const { date } = dayIn(t, today);
      const r = getTimetable(date);
      const d = r.data as { connected?: boolean; holiday: string | null; published: boolean; classes: { from: string; name: string }[] };
      if (d.connected === false) return { text: NOT_CONNECTED(st), cards: [] };
      const day = relativeDayLabel(date, today);
      let text: string;
      if (d.holiday) text = say(st, `${day} is a holiday: ${d.holiday} 🎉`, `${day} holiday hai: ${d.holiday} 🎉`, `${day} छुट्टी है: ${d.holiday} 🎉`);
      else if (!d.classes.length && !d.published)
        text = say(st, `Camu hasn't put up ${day.toLowerCase()}'s timetable yet.`, `Camu ne ${day} ka timetable abhi nahi daala.`, `Camu ने ${day} का टाइमटेबल अभी नहीं डाला।`);
      else if (!d.classes.length) text = say(st, `No classes ${day.toLowerCase()} 🎉`, `${day} koi class nahi 🎉`, `${day} कोई क्लास नहीं 🎉`);
      else {
        const n = d.classes.length;
        const at = fmtTime(d.classes[0].from);
        text = say(st, `${day}: ${n} ${n === 1 ? "class" : "classes"}, first at ${at} (${d.classes[0].name}).`, `${day} ${n} ${n === 1 ? "class hai" : "classes hain"}, pehli ${at} se (${d.classes[0].name}).`, `${day} ${n} क्लास हैं, पहली ${at} से (${d.classes[0].name})।`);
      }
      return { text, cards: cardsOf(r) };
    }

    case "mess": {
      const r = getMess();
      if (!r.card) {
        return {
          text: say(st, "No mess menu from Camu yet — it shows up after a sync.", "Camu se mess menu abhi nahi aaya — sync ke baad dikhega.", "Camu से मेस मेन्यू अभी नहीं आया — सिंक के बाद दिखेगा।"),
          cards: [],
        };
      }
      return { text: say(st, "Here's today's mess menu 🍛", "Aaj ka mess menu ye raha 🍛", "आज का मेस मेन्यू ये रहा 🍛"), cards: cardsOf(r) };
    }

    case "tasks": {
      const when = /\b(overdue|late|chhut gaya|miss ho gaya)\b/.test(t) ? "overdue" : /\b(today|aaj)\b/.test(t) ? "today" : /\b(week|hafte|hafta)\b/.test(t) ? "week" : "all";
      const r = await listTasks(when);
      const d = r.data as { count: number; tasks: { title: string; due: string | null }[] };
      if (!d.count) return { text: say(st, "Nothing pending 🎉", "Koi kaam pending nahi 🎉", "कोई काम बाकी नहीं 🎉"), cards: [] };
      const top = d.tasks[0];
      const due = top.due ? relativeDayLabel(top.due, today) : "";
      return {
        text: say(st, `${d.count} pending. First up: ${top.title}${due ? ` (${due.toLowerCase()})` : ""}.`, `${d.count} kaam pending hain. Sabse pehle: ${top.title}${due ? ` (${due})` : ""}.`, `${d.count} काम बाकी हैं। सबसे पहले: ${top.title}${due ? ` (${due})` : ""}।`),
        cards: cardsOf(r),
      };
    }

    case "remind": {
      const { date, said } = dayIn(t, today);
      const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)\b/);
      let time: string | null = null;
      if (tm) {
        let h = Number(tm[1]) % 12;
        const night = /\b(raat|rat|night|shaam|sham|evening|pm)\b/.test(t);
        const morning = /\b(subah|morning|am)\b/.test(t);
        const ap = tm[3] === "am" ? "am" : tm[3] === "pm" ? "pm" : night ? "pm" : morning ? "am" : h >= 8 && h <= 11 ? "am" : "pm";
        if (ap === "pm") h += 12;
        time = `${String(h).padStart(2, "0")}:${tm[2] ?? "00"}`;
      }
      const title =
        romanise(raw)
          .replace(/\b(remind me|remind|reminder|set a reminder|set reminder|yaad dila(na|o|do|dena)?|yaad|add a task|add task|task bana(o|do)?|note kar(o|do)?|please|pls|laga(o|do|de)?|daal(o|do)?|bana(o|do|de)?|kar(o|do)?|de|do|ka|ki|ke|ko|for|to|about|me|mujhe|tomorrow|today|kal|aaj|parso|at|on|baje|raat|rat|night|shaam|sham|evening|subah|morning|\d{1,2}(:\d{2})?\s*(am|pm|baje)?)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim() || say(st, "Reminder", "Reminder", "रिमाइंडर");
      const action = { type: "task" as const, title: title.charAt(0).toUpperCase() + title.slice(1), dueDate: said || time ? date : null, dueTime: time };
      return {
        text: say(st, "Add this? Tap Confirm.", "Ye add kar du? Confirm dabao.", "ये जोड़ दूँ? Confirm दबाओ।"),
        cards: [{ kind: "confirm", action, state: "waiting" }],
      };
    }

    case "passes": {
      const r = await listPasses();
      const n = (r.data as unknown[]).length;
      if (!n) return { text: say(st, "No outpasses yet.", "Abhi tak koi outpass nahi.", "अभी तक कोई आउटपास नहीं।"), cards: [] };
      return { text: say(st, "Your recent outpasses:", "Tumhare recent outpass:", "तुम्हारे हाल के आउटपास:"), cards: cardsOf(r) };
    }

    case "outpass": {
      const draft = tidyPass(parsePass(romanise(raw), now));
      const proof = needsProof(draft);
      const text =
        draft.kind === "dayout"
          ? say(st, "Day out pass ready — check it and tap Confirm. I'll save it and open MyCamu with the details pinned on top.", "Day out pass taiyaar — check karke Confirm dabao. Save karke MyCamu khol dunga, details upar pin rahengi.", "डे आउट पास तैयार — जाँच कर Confirm दबाओ। सेव करके MyCamu खोल दूँगा, डिटेल ऊपर दिखेंगी।")
          : proof
            ? say(st, "Leave pass ready. Camu needs the parent-approval mail screenshot — send it here (📎), then tap Confirm.", "Leave pass taiyaar. Camu ko parents wale mail ka screenshot chahiye — yahin bhej do (📎), phir Confirm dabao.", "लीव पास तैयार। Camu को पेरेंट्स वाले मेल का स्क्रीनशॉट चाहिए — यहीं भेज दो (📎), फिर Confirm दबाओ।")
            : say(st, "Leave pass ready — check it and tap Confirm.", "Leave pass taiyaar — check karke Confirm dabao.", "लीव पास तैयार — जाँच कर Confirm दबाओ।");
      return { text, cards: [{ kind: "confirm", action: { type: "outpass", draft }, state: "waiting" }] };
    }
  }
}
