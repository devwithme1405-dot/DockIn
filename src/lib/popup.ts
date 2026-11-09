/**
 * Filing what was answered in the payment popup.
 *
 * The popup is native and runs with DockIn closed, so it cannot reach the
 * database the app keeps. It writes its answer next to the payment on the
 * phone instead, and this turns those answers into an expense or a Lend &
 * Borrow entry the next time the app is open — then clears them, so nothing is
 * ever added twice.
 */

import { addDue, addExpense, merchantRules, rememberMerchant } from "./repo";
import { clearNotices, detectedFrom, merchantKey, phoneInbox } from "./payments";
import { fmtMoney } from "./money";
import { toDateStr } from "./dates";

let running: Promise<string[]> | null = null;
/** Ids already filed in this session, in case clearing them on the phone failed. */
const filed = new Set<string>();

/** Files every answered payment; returns a line per one, for a toast. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function applyPopupAnswers(): Promise<string[]> {
  if (running) return running;
  running = run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<string[]> {
  const notices = await phoneInbox();
  if (!notices.some((n) => n.answer)) return [];
  const said: string[] = [];
  let rules: Awaited<ReturnType<typeof merchantRules>> | null = null;
  for (const d of detectedFrom(notices)) {
    const answer = notices.find((n) => d.ids.includes(n.id) && n.answer)?.answer;
    if (!answer || d.dir !== "out") continue;
    if (d.ids.some((id) => filed.has(id))) {
      await clearNotices(d.ids).catch(() => {});
      continue;
    }
    const date = toDateStr(new Date(d.at));
    const where = d.merchant ?? d.source;
    if (answer.who === "me") {
      rules ??= await merchantRules();
      const known = d.merchant ? rules.find((r) => r.id === merchantKey(d.merchant!))?.category : undefined;
      const category = answer.category || known || "other";
      await addExpense({ amount: d.amount, category, note: where, date });
      if (answer.category && d.merchant) await rememberMerchant(merchantKey(d.merchant), d.merchant, answer.category);
      said.push(`${fmtMoney(d.amount)} at ${where} added`);
    } else if (answer.who === "split" && answer.parts?.length) {
      // Trust nothing blindly: shares are clamped so they never add up to more than was paid.
      let left = d.amount;
      const owed: string[] = [];
      for (const p of answer.parts) {
        const person = p.person?.trim().slice(0, 40);
        const amt = Math.min(round2(Number(p.amount) || 0), left);
        if (!person || amt <= 0) continue;
        left = round2(left - amt);
        await addDue({ person, amount: amt, dir: "owed", note: where, date });
        owed.push(`${person} owes you ${fmtMoney(amt)}`);
      }
      const mine = Math.min(round2(Number(answer.mine) || 0), left);
      if (mine > 0) {
        rules ??= await merchantRules();
        const known = d.merchant ? rules.find((r) => r.id === merchantKey(d.merchant!))?.category : undefined;
        await addExpense({ amount: mine, category: answer.category || known || "other", note: where, date });
        owed.push(`your ${fmtMoney(mine)} added`);
      }
      said.push(`${fmtMoney(d.amount)} at ${where} split: ${owed.join(", ")}`);
    } else if (answer.who === "other" && answer.person?.trim()) {
      const person = answer.person.trim().slice(0, 40);
      await addDue({ person, amount: d.amount, dir: "owed", note: d.merchant ?? "", date });
      said.push(`${person} owes you ${fmtMoney(d.amount)}`);
    }
    d.ids.forEach((id) => filed.add(id));
    await clearNotices(d.ids).catch(() => {});
  }
  return said;
}
