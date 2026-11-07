"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownLeft, Check, Sparkles, X } from "lucide-react";
import { useCategories, useDues } from "@/lib/hooks";
import {
  addDue,
  addExpense,
  addIncome,
  deleteDue,
  deleteExpense,
  deleteIncome,
  merchantRules,
  rememberMerchant,
  settleWith,
} from "@/lib/repo";
import { fmtMoney, knownPeople, ledger, metaFor, samePerson, splitShares } from "@/lib/money";
import { toDateStr } from "@/lib/dates";
import {
  PaymentError,
  clearNotices,
  detectedFrom,
  merchantKey,
  phoneInbox,
  strayIds,
  type Detected,
} from "@/lib/payments";
import { onPhone } from "@/lib/native";
import type { ExpenseCategory } from "@/lib/types";
import { PersonPicker } from "./Udhaar";
import { Button, Sheet, cx, useToast } from "./ui";

type Mode = "me" | "other" | "split";

/** "pay=60&at=…&who=other" from a payment notification, or "got=250&at=…". */
interface Ask {
  dir: "out" | "in";
  amount: number;
  at: number;
  who: Mode | null;
}

function readAsk(search: string): Ask | null {
  const q = new URLSearchParams(search);
  const pay = q.get("pay");
  const got = q.get("got");
  const raw = pay ?? got;
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const who = q.get("who");
  return {
    dir: pay ? "out" : "in",
    amount,
    at: Number(q.get("at")) || 0,
    who: who === "me" || who === "other" || who === "split" ? who : null,
  };
}

/** The tray row a notification was about: same direction and amount, nearest in time. */
function match(list: Detected[], ask: Ask): Detected | null {
  const same = list.filter((d) => d.dir === ask.dir && d.amount === ask.amount);
  if (!same.length) return null;
  return [...same].sort((a, b) => Math.abs(a.at - ask.at) - Math.abs(b.at - ask.at))[0];
}

/**
 * Payments the phone noticed, waiting for one tap — money out and money in.
 *
 * A spend can be yours (pick where), someone else's (it goes to lena-dena), or
 * split. Money in can be someone paying you back (their udhaar is ticked off),
 * or money from home. Nothing is recorded until you say which: a tracker that
 * quietly writes the wrong number is worse than one that writes nothing.
 *
 * A payee you have placed once as your own is never asked about again: the
 * second ₹60 at 24/7 Kathi is a single tap.
 */
export function DetectedTray() {
  const toast = useToast();
  const cats = useCategories();
  const dues = useDues();
  const rules = useLiveQuery(() => merchantRules(), []);
  const [list, setList] = useState<Detected[] | null>(null);
  const [asking, setAsking] = useState<{ d: Detected; mode: Mode } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // A tap on "Spent ₹60 — For someone" opens Money with what to show.
  const [pending, setPending] = useState<Ask | null>(() =>
    typeof window === "undefined" ? null : readAsk(window.location.search),
  );

  const load = useCallback(async () => {
    try {
      const notices = await phoneInbox();
      setList(detectedFrom(notices));
      // Adverts and balance alerts come in with everything else; they are not
      // shown and they are not kept.
      const rubbish = strayIds(notices);
      if (rubbish.length) await clearNotices(rubbish);
    } catch {
      // Detection is a bonus on top of the Money screen, never a reason it
      // fails to draw. Offline, or not set up, simply means no tray.
      setList([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    // A payment made while this screen is open shows up without a refresh, and
    // so does everything that arrived while DockIn was in the background.
    const offNotice = onPhone("notice", () => void load());
    const offResume = onPhone("resume", () => void load());
    if (readAsk(window.location.search)) {
      // Taken already (see `pending`); a reload must not open it again.
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    const onOpen = (e: Event) => {
      const path = (e as CustomEvent<string>).detail ?? "";
      const ask = readAsk(path.split("?")[1] ?? "");
      if (ask) {
        setPending(ask);
        void load();
      }
    };
    window.addEventListener("dockin-open", onOpen);
    return () => {
      offNotice();
      offResume();
      window.removeEventListener("dockin-open", onOpen);
    };
  }, [load]);

  // Once the tray has loaded, open the sheet the notification asked for.
  useEffect(() => {
    if (!pending || !list) return;
    const d = match(list, pending);
    void Promise.resolve().then(() => {
      setPending(null);
      if (d) setAsking({ d, mode: pending.who ?? "me" });
    });
  }, [pending, list]);

  const rows = useMemo(() => ledger(dues ?? []), [dues]);
  const people = useMemo(() => knownPeople(dues ?? []), [dues]);

  if (!list || list.length === 0) return null;

  const known = (d: Detected): ExpenseCategory | null => {
    if (!d.merchant || d.dir === "in") return null;
    return rules?.find((r) => r.id === merchantKey(d.merchant!))?.category ?? null;
  };

  /** Somebody who owes you, if this money in is from them. */
  const owedBy = (d: Detected) =>
    d.dir === "in" && d.merchant ? rows.find((r) => r.net > 0 && samePerson(r.person, d.merchant!)) ?? null : null;

  function done(d: Detected) {
    setList((cur) => (cur ?? []).filter((x) => x.ids[0] !== d.ids[0]));
    setAsking(null);
    void clearNotices(d.ids).catch(() => {});
  }

  async function run(d: Detected, fn: () => Promise<void>) {
    setBusy(d.ids[0]);
    try {
      await fn();
      done(d);
    } catch (e) {
      toast.show(e instanceof PaymentError ? e.message : "Could not add that.");
    }
    setBusy(null);
  }

  const date = (d: Detected) => toDateStr(new Date(d.at));

  async function mine(d: Detected, category: ExpenseCategory, remember: boolean) {
    await run(d, async () => {
      const e = await addExpense({ amount: d.amount, category, note: d.merchant ?? d.source, date: date(d) });
      if (remember && d.merchant) await rememberMerchant(merchantKey(d.merchant), d.merchant, category);
      toast.show(`${fmtMoney(d.amount)} added to ${metaFor(category, cats ?? []).label}`, () => void deleteExpense(e.id));
    });
  }

  async function forSomeone(d: Detected, person: string, note: string) {
    await run(d, async () => {
      const due = await addDue({ person, amount: d.amount, dir: "owed", note: note || d.merchant || "", date: date(d) });
      toast.show(`${due.person} owes you ${fmtMoney(d.amount)}`, () => void deleteDue(due.id));
    });
  }

  async function split(d: Detected, names: string[], category: ExpenseCategory) {
    const { mine: share, each } = splitShares(d.amount, names.length + 1);
    await run(d, async () => {
      const e = await addExpense({ amount: share, category, note: `${d.merchant ?? d.source} (split)`, date: date(d) });
      for (const n of names) await addDue({ person: n, amount: each, dir: "owed", note: d.merchant ?? "Split", date: date(d) });
      toast.show(`Your share ${fmtMoney(share)}, ${names.length} owe ${fmtMoney(each)} each`, () => void deleteExpense(e.id));
    });
  }

  async function payback(d: Detected, person: string) {
    await run(d, async () => {
      const left = await settleWith(person, "owed", d.amount);
      if (left > 0) await addIncome({ amount: left, from: person, note: "More than was owed", date: date(d) });
      toast.show(left > 0 ? `${person} is settled, ${fmtMoney(left)} extra noted` : `${fmtMoney(d.amount)} back from ${person}`);
    });
  }

  async function income(d: Detected, from: string) {
    await run(d, async () => {
      const i = await addIncome({ amount: d.amount, from, date: date(d) });
      toast.show(`${fmtMoney(d.amount)} in${from ? ` from ${from}` : ""}`, () => void deleteIncome(i.id));
    });
  }

  async function lentToMe(d: Detected, person: string) {
    await run(d, async () => {
      const due = await addDue({ person, amount: d.amount, dir: "owe", note: "Lent you", date: date(d) });
      toast.show(`You owe ${due.person} ${fmtMoney(d.amount)}`, () => void deleteDue(due.id));
    });
  }

  async function dismiss(d: Detected) {
    done(d);
  }

  return (
    <>
      <section className="mx-5 mt-4 overflow-hidden lift rounded-3xl bg-surface">
        <h2 className="flex items-center gap-1.5 px-4 pt-3.5 pb-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
          <Sparkles size={13} /> {list.length === 1 ? "1 to place" : `${list.length} to place`}
        </h2>
        <div className="divide-y divide-line">
          {list.map((d) => {
            const cat = known(d);
            const meta = cat ? metaFor(cat, cats ?? []) : null;
            const back = owedBy(d);
            const isIn = d.dir === "in";
            return (
              <div key={d.ids[0]} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className={cx("text-[15px] font-medium tabular-nums", isIn && "text-safe")}>
                    {isIn && <ArrowDownLeft size={14} className="mr-0.5 inline -translate-y-px" />}
                    {isIn ? "+" : ""}
                    {fmtMoney(d.amount)}
                    {d.merchant && (
                      <span className="font-normal text-text">
                        {isIn ? " from " : " · "}
                        {d.merchant}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[12.5px] text-muted">
                    {isIn
                      ? back
                        ? `${back.person} owes you ${fmtMoney(back.net)}`
                        : "Money in"
                      : meta
                        ? `${meta.emoji} ${meta.label}`
                        : "Not placed yet"}{" "}
                    · {d.source} ·{" "}
                    {new Date(d.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <button
                  onClick={() => dismiss(d)}
                  aria-label={`Ignore ${fmtMoney(d.amount)}`}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={() =>
                    isIn && back
                      ? void payback(d, back.person)
                      : cat
                        ? void mine(d, cat, false)
                        : setAsking({ d, mode: "me" })
                  }
                  disabled={busy === d.ids[0]}
                  className={cx(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium disabled:opacity-60",
                    isIn ? "bg-safe text-white" : "bg-accent text-on-accent",
                  )}
                >
                  <Check size={14} /> {isIn && back ? "Paid back" : cat ? "Add" : "Place"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {asking?.d.dir === "out" && (
        <SpendSheet
          d={asking.d}
          mode={asking.mode}
          people={people}
          onMode={(m) => setAsking({ d: asking.d, mode: m })}
          onClose={() => setAsking(null)}
          onMine={(c) => void mine(asking.d, c, true)}
          onOther={(p, n) => void forSomeone(asking.d, p, n)}
          onSplit={(names, c) => void split(asking.d, names, c)}
        />
      )}
      {asking?.d.dir === "in" && (
        <IncomeSheet
          d={asking.d}
          owing={rows.filter((r) => r.net > 0).map((r) => r.person)}
          people={people}
          onClose={() => setAsking(null)}
          onPayback={(p) => void payback(asking.d, p)}
          onIncome={(f) => void income(asking.d, f)}
          onLent={(p) => void lentToMe(asking.d, p)}
        />
      )}
    </>
  );
}

function SpendSheet({
  d,
  mode,
  people,
  onMode,
  onClose,
  onMine,
  onOther,
  onSplit,
}: {
  d: Detected;
  mode: Mode;
  people: string[];
  onMode: (m: Mode) => void;
  onClose: () => void;
  onMine: (c: ExpenseCategory) => void;
  onOther: (person: string, note: string) => void;
  onSplit: (names: string[], c: ExpenseCategory) => void;
}) {
  const cats = useCategories();
  const [person, setPerson] = useState("");
  const [note, setNote] = useState(d.merchant ?? "");
  const [names, setNames] = useState("");
  const list = names
    .split(/[,\n]/)
    .map((n) => n.trim())
    .filter(Boolean);
  const shares = splitShares(d.amount, list.length + 1);

  const grid = (pick: (c: ExpenseCategory) => void) => (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Category">
      {(cats ?? []).map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={false}
          onClick={() => pick(c.id)}
          className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2 px-1 py-2.5 text-center transition active:scale-95"
        >
          <span className="text-[20px] leading-none">{c.emoji}</span>
          <span className="text-[11px] leading-tight">{c.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={`${fmtMoney(d.amount)}${d.merchant ? ` at ${d.merchant}` : ""}`}>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Who was it for">
        {(
          [
            ["me", "For me"],
            ["other", "For someone"],
            ["split", "Split"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => onMode(m)}
            className={cx("h-10 rounded-xl text-[13.5px] font-medium", mode === m ? "bg-surface shadow-sm" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "me" && (
        <>
          <p className="mb-3 text-[13px] text-muted">
            {d.merchant ? (
              <>
                Where did it go? <b className="text-text">{d.merchant}</b> is remembered, so next time it is one tap.
              </>
            ) : (
              <>Where did it go?</>
            )}
          </p>
          {grid(onMine)}
        </>
      )}

      {mode === "other" && (
        <>
          <p className="text-[13px] text-muted">They owe you the whole {fmtMoney(d.amount)}. It goes to lena-dena, not your spending.</p>
          <PersonPicker value={person} onChange={setPerson} people={people} />
          <input
            className="mt-3 h-12 w-full rounded-xl border border-line bg-bg px-3.5 outline-none placeholder:text-muted/70 focus:border-accent"
            placeholder="What for"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="What for"
          />
          <Button className="mt-4 w-full" disabled={!person.trim()} onClick={() => onOther(person.trim(), note.trim())}>
            Add to lena-dena
          </Button>
        </>
      )}

      {mode === "split" && (
        <>
          <p className="text-[13px] text-muted">Who else was in? Separate names with commas.</p>
          <input
            className="mt-2 h-12 w-full rounded-xl border border-line bg-bg px-3.5 outline-none placeholder:text-muted/70 focus:border-accent"
            placeholder="Rahul, Aman"
            value={names}
            autoCapitalize="words"
            onChange={(e) => setNames(e.target.value)}
            aria-label="Who else"
          />
          {people.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {people
                .filter((p) => !list.some((n) => samePerson(n, p)))
                .map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNames(list.concat(p).join(", "))}
                    className="h-8 rounded-full bg-surface-2 px-3 text-[13px] font-medium"
                  >
                    + {p}
                  </button>
                ))}
            </div>
          )}
          {list.length > 0 ? (
            <>
              <p className="mt-4 mb-3 text-[13.5px]">
                Your share <b className="tabular-nums">{fmtMoney(shares.mine)}</b>, each of {list.length} owes you{" "}
                <b className="tabular-nums">{fmtMoney(shares.each)}</b>. Where did your share go?
              </p>
              {grid((c) => onSplit(list, c))}
            </>
          ) : (
            <p className="mt-4 text-[13px] text-muted">Add at least one name.</p>
          )}
        </>
      )}
    </Sheet>
  );
}

function IncomeSheet({
  d,
  owing,
  people,
  onClose,
  onPayback,
  onIncome,
  onLent,
}: {
  d: Detected;
  owing: string[];
  people: string[];
  onClose: () => void;
  onPayback: (person: string) => void;
  onIncome: (from: string) => void;
  onLent: (person: string) => void;
}) {
  const [person, setPerson] = useState(d.merchant ?? "");
  return (
    <Sheet open onClose={onClose} title={`+${fmtMoney(d.amount)}${d.merchant ? ` from ${d.merchant}` : ""}`}>
      {owing.length > 0 && (
        <>
          <p className="mb-2 text-[13px] text-muted">Someone paying you back?</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {owing.map((p) => (
              <button
                key={p}
                onClick={() => onPayback(p)}
                className="h-10 rounded-full bg-safe-soft px-4 text-[14px] font-medium text-safe"
              >
                {p} paid back
              </button>
            ))}
          </div>
        </>
      )}
      <PersonPicker value={person} onChange={setPerson} people={people} placeholder="From whom (optional)" />
      <div className="mt-4 grid gap-2">
        <Button onClick={() => onIncome(person.trim())}>Money in (home, refund, stipend)</Button>
        <Button variant="secondary" disabled={!person.trim()} onClick={() => onLent(person.trim())}>
          {person.trim() ? `${person.trim()} lent it to me` : "Someone lent it to me"}
        </Button>
      </div>
    </Sheet>
  );
}
