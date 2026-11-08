"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, HandCoins, MessageCircle, Plus, Users, X } from "lucide-react";
import { useDues } from "@/lib/hooks";
import { addDue, deleteDue, getProfile, restoreDue, saveProfile, settleDue, settleWith } from "@/lib/repo";
import { fmtMoney, knownPeople, ledger, ledgerTotals, reminderText, samePerson, whatsappUrl, type PersonLedger } from "@/lib/money";
import { fmtDay, toDateStr } from "@/lib/dates";
import type { Due } from "@/lib/types";
import { Button, Sheet, cx, inputCls, useToast } from "./ui";

/**
 * Lena-dena: who owes you and whom you owe, one line per person.
 *
 * Entries come from three places — "For someone" after a payment, a split, and
 * the + here — and leave the same way: money from that person comes in and
 * DockIn ticks off their oldest entries, or you tap "Got it".
 */
export function UdhaarCard() {
  const dues = useDues();
  const profile = useLiveQuery(() => getProfile(), []);
  const rows = useMemo(() => ledger(dues ?? []), [dues]);
  const totals = ledgerTotals(rows);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const open = rows.find((r) => r.person === person) ?? null;
  const friends = profile?.friends ?? [];

  if (!dues) return null;

  const net = Math.round((totals.lena - totals.dena) * 100) / 100;

  return (
    <section id="dues" className="mt-7 scroll-mt-20 px-5" aria-label="Lena-dena">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[19px] font-extrabold tracking-[-0.02em]">Lena-dena</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManaging(true)}
            aria-label="People"
            className="btn-paper lip-sm inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
          >
            <Users size={15} /> People
          </button>
          <button
            onClick={() => setAdding(true)}
            className="btn-leather lip-sm inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium"
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* A little ledger: what's coming to you on the left, what you owe on the
          right, a hairline rule down the middle like an accounts book. */}
      <div className="notebook overflow-hidden px-0 pt-0 pb-0">
        <div className="relative grid grid-cols-2">
          <span aria-hidden className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-card-edge" />
          <div className="px-4 py-3.5">
            <p className="flex items-center gap-1 text-[11.5px] font-bold tracking-wide text-muted uppercase">
              <ArrowDownLeft size={13} className="text-safe" /> You&apos;ll get
            </p>
            <p className="mt-0.5 font-display text-[22px] font-extrabold tabular-nums text-safe">{fmtMoney(totals.lena)}</p>
          </div>
          <div className="px-4 py-3.5 text-right">
            <p className="flex items-center justify-end gap-1 text-[11.5px] font-bold tracking-wide text-muted uppercase">
              You owe <ArrowUpRight size={13} className="text-danger" />
            </p>
            <p className="mt-0.5 font-display text-[22px] font-extrabold tabular-nums text-danger">{fmtMoney(totals.dena)}</p>
          </div>
        </div>

        {net !== 0 && rows.length > 0 && (
          <p className="border-t border-dashed border-card-edge px-4 py-2 text-center text-[12.5px] font-semibold">
            <span className="text-muted">On balance </span>
            <span className={net > 0 ? "text-safe" : "text-danger"}>
              {net > 0 ? "you'll get " : "you owe "}
              {fmtMoney(Math.abs(net))}
            </span>
          </p>
        )}

        {rows.length === 0 ? (
          <p className="border-t border-card-edge px-4 py-5 text-center text-[13.5px] leading-relaxed text-muted">
            Nothing pending. Paid for a friend? Tap <b className="text-text">+ Add</b>, or hit{" "}
            <b className="text-text">For someone</b> after a payment — when they pay you back it ticks off here.
          </p>
        ) : (
          <ul className="border-t border-card-edge">
            {rows.map((r) => (
              <li key={r.person}>
                <button
                  onClick={() => setPerson(r.person)}
                  className="ruled-row flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-surface-2"
                >
                  <span
                    className={cx(
                      "grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-extrabold ring-2",
                      r.net >= 0 ? "bg-safe-soft text-safe ring-safe/20" : "bg-danger-soft text-danger ring-danger/20",
                    )}
                    aria-hidden
                  >
                    {(r.person.trim()[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold">{r.person}</span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {r.open.length === 1 ? r.open[0].note || fmtDay(r.open[0].date) : `${r.open.length} entries`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={cx("block font-display text-[16px] font-extrabold tabular-nums", r.net >= 0 ? "text-safe" : "text-danger")}>
                      {r.net >= 0 ? "+" : "−"}
                      {fmtMoney(Math.abs(r.net))}
                    </span>
                    <span className="block text-[11px] font-medium text-muted">{r.net >= 0 ? "owes you" : "you owe"}</span>
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-muted/60" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add udhaar">
        <DueForm friends={friends} onDone={() => setAdding(false)} />
      </Sheet>
      <Sheet open={managing} onClose={() => setManaging(false)} title="Your people">
        <PeopleManager friends={friends} />
      </Sheet>
      <PersonSheet row={open} onClose={() => setPerson(null)} />
    </section>
  );
}

/** Add friends once so their names are one tap when splitting or lending. */
function PeopleManager({ friends }: { friends: string[] }) {
  const [name, setName] = useState("");
  const clean = name.trim();
  const exists = friends.some((f) => samePerson(f, clean));

  async function add() {
    if (!clean || exists) return;
    await saveProfile({ friends: [...friends, clean] });
    setName("");
  }
  async function remove(f: string) {
    await saveProfile({ friends: friends.filter((x) => x !== f) });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          className={inputCls}
          placeholder="Add a friend (Yash, Harshit…)"
          value={name}
          autoCapitalize="words"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          aria-label="Friend's name"
        />
        <Button size="sm" className="h-11 shrink-0" disabled={!clean || exists} onClick={() => void add()}>
          <Plus size={16} /> Add
        </Button>
      </div>
      {friends.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-muted">
          Add the friends you usually split or lend with. Then their name is one tap when you add money.
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {friends.map((f) => (
            <li key={f}>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 pr-1.5 pl-3 text-[14px] font-medium">
                {f}
                <button
                  onClick={() => void remove(f)}
                  aria-label={`Remove ${f}`}
                  className="grid size-6 place-items-center rounded-full text-muted hover:bg-line"
                >
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One person: every open entry, settle it, or send a reminder. */
function PersonSheet({ row, onClose }: { row: PersonLedger | null; onClose: () => void }) {
  const toast = useToast();
  const profile = useLiveQuery(() => getProfile(), []);
  const [part, setPart] = useState("");
  const [upi, setUpi] = useState<string | null>(null);
  if (!row) return null;
  const upiNow = upi ?? profile?.upi ?? "";
  const theyOwe = row.net > 0;

  async function gotIt(d: Due) {
    await settleDue(d.id);
    toast.show(`${fmtMoney(d.amount - d.paid)} ${d.dir === "owed" ? "back from" : "paid to"} ${row!.person}`);
  }

  async function partPay() {
    const n = Number(part);
    if (!Number.isFinite(n) || n <= 0) return;
    const left = await settleWith(row!.person, theyOwe ? "owed" : "owe", n);
    setPart("");
    toast.show(left > 0 ? `Settled, and ${fmtMoney(left)} more than was due` : `${fmtMoney(n)} ticked off`);
  }

  return (
    <Sheet open onClose={onClose} title={row.person}>
      <p className={cx("text-[15px] font-medium", theyOwe ? "text-safe" : "text-danger")}>
        {theyOwe ? `Owes you ${fmtMoney(row.net)}` : `You owe ${fmtMoney(-row.net)}`}
      </p>

      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface-2/60">
        {row.open.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{d.note || (d.dir === "owed" ? "You paid" : "They paid")}</span>
              <span className="block text-[12px] text-muted">
                {fmtDay(d.date)} · {d.dir === "owed" ? "they owe" : "you owe"}
                {d.paid > 0 ? ` · ${fmtMoney(d.paid)} back already` : ""}
              </span>
            </span>
            <span className="text-[14.5px] font-semibold tabular-nums">{fmtMoney(d.amount - d.paid)}</span>
            <button
              onClick={() => void gotIt(d)}
              aria-label={d.dir === "owed" ? "Got it back" : "Paid it"}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-safe text-white"
            >
              <Check size={16} strokeWidth={2.75} />
            </button>
            <button
              onClick={async () => {
                await deleteDue(d.id);
                toast.show("Removed", () => void restoreDue(d.id));
              }}
              aria-label="Remove"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-xl border border-line bg-bg px-3">
          <span className="text-muted">₹</span>
          <input
            inputMode="decimal"
            value={part}
            onChange={(e) => setPart(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={theyOwe ? "Part they paid back" : "Part you paid back"}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
            aria-label="Amount paid back"
          />
        </div>
        <Button size="sm" className="h-11" disabled={!part} onClick={() => void partPay()}>
          Tick off
        </Button>
      </div>

      {theyOwe && (
        <>
          <a
            href={whatsappUrl(reminderText(row, upiNow || undefined))}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              if (upi !== null && upi !== (profile?.upi ?? "")) void saveProfile({ upi: upi.trim() });
            }}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1fa855] text-[15px] font-semibold text-white"
          >
            <MessageCircle size={18} /> Remind on WhatsApp
          </a>
          <input
            className={cx(inputCls, "mt-2 h-10 text-[14px]")}
            placeholder="Your UPI id, to add a pay link (optional)"
            value={upiNow}
            autoCapitalize="none"
            onChange={(e) => setUpi(e.target.value)}
            onBlur={() => upi !== null && void saveProfile({ upi: upi.trim() })}
            aria-label="Your UPI id"
          />
        </>
      )}
    </Sheet>
  );
}

/** Add an entry by hand: who, how much, and which way. */
export function DueForm({
  onDone,
  preset,
  friends = [],
}: {
  onDone: () => void;
  preset?: { amount?: number; note?: string; dir?: Due["dir"]; date?: string };
  friends?: string[];
}) {
  const toast = useToast();
  const dues = useDues();
  // Friends you added, then anyone else you have settled up with before.
  const people = useMemo(() => {
    const out = [...friends];
    for (const p of knownPeople(dues ?? [])) if (!out.some((x) => samePerson(x, p))) out.push(p);
    return out.slice(0, 12);
  }, [dues, friends]);
  const [dir, setDir] = useState<Due["dir"]>(preset?.dir ?? "owed");
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState(preset?.amount ? String(preset.amount) : "");
  const [note, setNote] = useState(preset?.note ?? "");
  const value = Number(amount);
  const valid = person.trim().length > 0 && Number.isFinite(value) && value > 0;

  async function save() {
    if (!valid) return;
    const d = await addDue({ person, amount: value, dir, note, date: preset?.date ?? toDateStr() });
    // A name used for the first time is remembered as a friend for next time.
    if (!friends.some((f) => samePerson(f, person)) && !knownPeople(dues ?? []).some((f) => samePerson(f, person))) {
      await saveProfile({ friends: [...friends, person.trim()] });
    }
    toast.show(`${fmtMoney(value)} ${dir === "owed" ? "from" : "to"} ${d.person} added`, () => void deleteDue(d.id));
    onDone();
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Which way">
        {(
          [
            ["owed", "I paid for them"],
            ["owe", "They paid for me"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={dir === v}
            onClick={() => setDir(v)}
            className={cx("lip-sm h-10 rounded-full text-[13.5px]", dir === v ? "btn-leather" : "btn-paper")}
          >
            {label}
          </button>
        ))}
      </div>
      <PersonPicker value={person} onChange={setPerson} people={people} />
      <div className="mt-3 flex h-12 items-center gap-1 rounded-xl border border-line bg-bg px-3.5">
        <span className="text-[18px] text-muted">₹</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="Amount"
          className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted/70"
          aria-label="Amount"
        />
      </div>
      <input
        className={cx(inputCls, "mt-3")}
        placeholder="What for (Pizza, movie ticket…)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="What for"
      />
      <Button className="mt-4 w-full" disabled={!valid} onClick={() => void save()}>
        <HandCoins size={17} /> Save
      </Button>
    </div>
  );
}

/** A name field with the people you usually settle up with as one-tap chips. */
export function PersonPicker({
  value,
  onChange,
  people,
  placeholder = "Who? (Rahul)",
}: {
  value: string;
  onChange: (v: string) => void;
  people: string[];
  placeholder?: string;
}) {
  return (
    <div className="mt-3">
      <input
        className={inputCls}
        placeholder={placeholder}
        value={value}
        autoCapitalize="words"
        onChange={(e) => onChange(e.target.value)}
        aria-label="Person"
      />
      {people.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {people.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cx(
                "lip-sm h-8 rounded-full px-3 text-[13px]",
                value === p ? "btn-leather" : "btn-paper",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
